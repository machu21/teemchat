import type { SupabaseClient } from '@supabase/supabase-js';
import { companionFromRow, oneLine } from './normalize';
import { buildFactExtractionPrompt, buildSummaryPrompt } from './prompt';
import { CompanionMemoryFact, CompanionMood, CompanionProfile, CompanionSummary, DEFAULT_TRAITS } from './types';

/** Messages (user + assistant rows) between rolling summaries. */
export const SUMMARY_EVERY_MESSAGES = 20;

const BLOCKED_FACT_PATTERN = /password|passcode|pin\b|credit|card|cvv|iban|bank|ssn|social security|address|phone|email/i;

export const NEW_COMPANION_DEFAULTS = {
  name: 'Pixel Cat',
  persona: '',
  companion_type: 'cat',
  avatar_style: 'orange_tabby',
};

/** Stand-in used when the companion row can't be loaded (chat still works, nothing is saved). */
export function ephemeralCompanion(userId: string): CompanionProfile {
  return {
    id: 'unsaved',
    userId,
    name: NEW_COMPANION_DEFAULTS.name,
    persona: '',
    species: 'cat',
    avatarStyle: NEW_COMPANION_DEFAULTS.avatar_style,
    traits: { ...DEFAULT_TRAITS },
    mood: 'happy',
    bondXp: 0,
    nicknameForOwner: null,
    lastSeenOwnerAt: null,
    tourProgress: {},
  };
}

/**
 * Loads the caller's companion (RLS limits it to their own row), creating it on
 * first use. Returns null when the database is unavailable so chat can degrade
 * to a memory-less reply instead of failing.
 */
export async function getOrCreateCompanion(supabase: SupabaseClient, userId: string): Promise<CompanionProfile | null> {
  try {
    const { data: existing, error } = await supabase
      .from('ai_companions')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    if (existing) return companionFromRow(existing as Record<string, unknown>);

    const { data: created, error: insertErr } = await supabase
      .from('ai_companions')
      .insert({ user_id: userId, ...NEW_COMPANION_DEFAULTS })
      .select('*')
      .single();
    if (insertErr) throw insertErr;
    return created ? companionFromRow(created as Record<string, unknown>) : null;
  } catch (err) {
    console.warn('Companion load warning:', err);
    return null;
  }
}

export async function loadRecentFacts(supabase: SupabaseClient, companionId: string, limit = 8): Promise<CompanionMemoryFact[]> {
  try {
    const { data } = await supabase.rpc('get_recent_companion_memories', {
      p_companion_id: companionId,
      p_limit: limit,
    });
    if (!Array.isArray(data)) return [];
    return data.map((m: Record<string, unknown>) => ({
      id: String(m.id ?? ''),
      key: String(m.memory_key ?? ''),
      value: String(m.memory_value ?? ''),
      category: String(m.category ?? 'general'),
      importance: typeof m.importance_score === 'number' ? m.importance_score : 0.5,
    }));
  } catch (err) {
    console.warn('Companion facts warning:', err);
    return [];
  }
}

export async function loadRecentSummaries(supabase: SupabaseClient, companionId: string, limit = 3): Promise<CompanionSummary[]> {
  try {
    const { data } = await supabase
      .from('companion_summaries')
      .select('id, summary, open_threads, created_at')
      .eq('companion_id', companionId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (!Array.isArray(data)) return [];
    return data.map((s: Record<string, unknown>) => ({
      id: String(s.id ?? ''),
      summary: String(s.summary ?? ''),
      openThreads: Array.isArray(s.open_threads) ? s.open_threads.map(String) : [],
      createdAt: typeof s.created_at === 'string' ? s.created_at : undefined,
    }));
  } catch (err) {
    console.warn('Companion summaries warning:', err);
    return [];
  }
}

/** Merge semantic matches with recent/important facts, de-duplicated by key, best first. */
export function mergeFacts(semantic: CompanionMemoryFact[], recent: CompanionMemoryFact[], max = 8): CompanionMemoryFact[] {
  const seen = new Set<string>();
  const out: CompanionMemoryFact[] = [];
  for (const f of [...semantic, ...recent]) {
    const k = f.key.toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(f);
    if (out.length >= max) break;
  }
  return out;
}

export interface ExtractedFact {
  key: string;
  value: string;
  category: string;
  importance: number;
}

/** Parse + sanitize the fact extractor's JSON. */
export function parseExtractedFacts(raw: string | undefined | null): ExtractedFact[] {
  const text = (raw ?? '').replace(/```json|```/g, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return [];
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as { facts?: unknown };
    if (!Array.isArray(parsed.facts)) return [];
    return parsed.facts
      .map((f: unknown) => {
        const o = (f && typeof f === 'object' ? f : {}) as Record<string, unknown>;
        const key = oneLine(o.key, 40).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
        const value = oneLine(o.value, 200);
        const importance = typeof o.importance === 'number' ? Math.min(1, Math.max(0, o.importance)) : 0.6;
        return { key, value, category: oneLine(o.category, 20) || 'other', importance };
      })
      .filter((f) => f.key && f.value && !BLOCKED_FACT_PATTERN.test(f.key) && !BLOCKED_FACT_PATTERN.test(f.value))
      .slice(0, 3);
  } catch {
    return [];
  }
}

export interface CompanionAiDeps {
  /** Returns the raw model text for a JSON-only prompt. */
  generateJson: (prompt: string) => Promise<string | undefined>;
  /** Returns a 768-dim embedding, or null. */
  embed: (text: string) => Promise<number[] | null>;
}

/** Extract durable facts from one exchange and upsert them by key. */
export async function learnFromExchange(
  supabase: SupabaseClient,
  deps: CompanionAiDeps,
  companion: CompanionProfile,
  ownerName: string,
  userMessage: string,
  reply: string
): Promise<number> {
  const facts = parseExtractedFacts(await deps.generateJson(buildFactExtractionPrompt(ownerName, userMessage, reply)));
  let written = 0;
  for (const fact of facts) {
    const embedding = await deps.embed(`${fact.key}: ${fact.value}`).catch(() => null);
    const fields = {
      memory_value: fact.value,
      category: fact.category,
      importance_score: fact.importance,
      confidence: 0.8,
      updated_at: new Date().toISOString(),
      embedding: embedding ? `[${embedding.join(',')}]` : null,
    };

    const { data: existing } = await supabase
      .from('companion_memories')
      .select('id')
      .eq('companion_id', companion.id)
      .eq('memory_key', fact.key)
      .limit(1);

    const existingId = Array.isArray(existing) && existing[0] ? (existing[0] as { id: string }).id : null;
    const { error } = existingId
      ? await supabase.from('companion_memories').update(fields).eq('id', existingId)
      : await supabase.from('companion_memories').insert({
          companion_id: companion.id,
          user_id: companion.userId,
          memory_key: fact.key,
          ...fields,
        });
    if (!error) written++;
  }
  return written;
}

export async function saveExchange(
  supabase: SupabaseClient,
  companion: CompanionProfile,
  userMessage: string,
  reply: string
): Promise<void> {
  await supabase.from('companion_messages').insert([
    { companion_id: companion.id, user_id: companion.userId, role: 'user', content: userMessage.slice(0, 4000) },
    { companion_id: companion.id, user_id: companion.userId, role: 'assistant', content: reply.slice(0, 4000) },
  ]);
}

export async function updateCompanionState(
  supabase: SupabaseClient,
  companion: CompanionProfile,
  mood: CompanionMood
): Promise<void> {
  await supabase
    .from('ai_companions')
    .update({ mood, last_seen_owner_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', companion.id);
}

export async function awardBond(supabase: SupabaseClient, xp = 1): Promise<number | null> {
  try {
    const { data, error } = await supabase.rpc('award_companion_bond', { p_xp: xp });
    if (error) return null;
    return typeof data === 'number' ? data : null;
  } catch {
    return null;
  }
}

/**
 * Once enough new messages have piled up since the last summary, condense them
 * into a diary entry with open follow-up threads.
 */
export async function maybeSummarize(
  supabase: SupabaseClient,
  deps: CompanionAiDeps,
  companion: CompanionProfile,
  ownerName: string
): Promise<boolean> {
  const { data: last } = await supabase
    .from('companion_summaries')
    .select('created_at')
    .eq('companion_id', companion.id)
    .order('created_at', { ascending: false })
    .limit(1);
  const since = Array.isArray(last) && last[0] ? (last[0] as { created_at: string }).created_at : '1970-01-01T00:00:00Z';

  const { data: msgs } = await supabase
    .from('companion_messages')
    .select('role, content, created_at')
    .eq('companion_id', companion.id)
    .gt('created_at', since)
    .order('created_at', { ascending: true })
    .limit(40);

  if (!Array.isArray(msgs) || msgs.length < SUMMARY_EVERY_MESSAGES) return false;

  const raw = await deps.generateJson(
    buildSummaryPrompt(ownerName, msgs as Array<{ role: string; content: string }>)
  );
  const text = (raw ?? '').replace(/```json|```/g, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return false;

  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as { summary?: unknown; open_threads?: unknown };
    const summary = oneLine(parsed.summary, 600);
    if (!summary) return false;
    const threads = Array.isArray(parsed.open_threads)
      ? parsed.open_threads.map((t) => oneLine(t, 140)).filter(Boolean).slice(0, 3)
      : [];
    const { error } = await supabase.from('companion_summaries').insert({
      companion_id: companion.id,
      user_id: companion.userId,
      summary,
      open_threads: threads,
    });
    return !error;
  } catch {
    return false;
  }
}
