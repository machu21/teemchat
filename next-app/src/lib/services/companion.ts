import { supabase } from '../supabase';
import { companionFromRow, normalizeTraits, oneLine } from '../companion/normalize';
import { CompanionProfile, CompanionSpecies, CompanionTraits } from '../companion/types';

const NEW_COMPANION = { name: 'Pixel Cat', persona: '', companion_type: 'cat', avatar_style: 'orange_tabby' };

export interface CompanionReminder {
  id: string;
  text: string;
  dueAt: string;
  done: boolean;
}

export interface CompanionHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Owner-side data access for the companion. RLS limits every query to the
 * signed-in user's own rows; bond XP can only change through the chat API.
 */
export class CompanionService {
  static async getMine(userId: string): Promise<CompanionProfile | null> {
    const { data, error } = await supabase.from('ai_companions').select('*').eq('user_id', userId).maybeSingle();
    if (error) {
      console.warn('Companion fetch warning:', error.message);
      return null;
    }
    if (data) return companionFromRow(data);

    const { data: created, error: insertErr } = await supabase
      .from('ai_companions')
      .insert({ user_id: userId, ...NEW_COMPANION })
      .select('*')
      .single();
    if (insertErr) {
      console.warn('Companion create warning:', insertErr.message);
      return null;
    }
    return created ? companionFromRow(created) : null;
  }

  static async update(
    companionId: string,
    patch: Partial<{
      name: string;
      species: CompanionSpecies;
      persona: string;
      traits: CompanionTraits;
      nicknameForOwner: string | null;
      tourProgress: Record<string, boolean>;
    }>
  ): Promise<CompanionProfile | null> {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.name !== undefined) row.name = oneLine(patch.name, 32) || 'Pixel Cat';
    if (patch.species !== undefined) row.companion_type = patch.species;
    if (patch.persona !== undefined) row.persona = oneLine(patch.persona, 400);
    if (patch.traits !== undefined) row.traits = normalizeTraits(patch.traits);
    if (patch.nicknameForOwner !== undefined) row.nickname_for_owner = oneLine(patch.nicknameForOwner, 32) || null;
    if (patch.tourProgress !== undefined) row.tour_progress = patch.tourProgress;

    const { data, error } = await supabase.from('ai_companions').update(row).eq('id', companionId).select('*').single();
    if (error) {
      console.warn('Companion update warning:', error.message);
      return null;
    }
    return data ? companionFromRow(data) : null;
  }

  /** Most recent chat turns, oldest first. */
  static async loadHistory(companionId: string, limit = 30): Promise<CompanionHistoryMessage[]> {
    const { data } = await supabase
      .from('companion_messages')
      .select('role, content, created_at')
      .eq('companion_id', companionId)
      .in('role', ['user', 'assistant'])
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data ?? [])
      .reverse()
      .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content) }));
  }

  static async clearHistory(companionId: string): Promise<boolean> {
    const { error } = await supabase.from('companion_messages').delete().eq('companion_id', companionId);
    return !error;
  }

  static async addReminder(companion: CompanionProfile, text: string, minutes: number): Promise<CompanionReminder | null> {
    const dueAt = new Date(Date.now() + minutes * 60_000).toISOString();
    const { data, error } = await supabase
      .from('companion_reminders')
      .insert({ companion_id: companion.id, user_id: companion.userId, text: oneLine(text, 280), due_at: dueAt })
      .select('id, text, due_at, done')
      .single();
    if (error || !data) return null;
    return { id: data.id, text: data.text, dueAt: data.due_at, done: data.done };
  }

  static async listOpenReminders(companionId: string): Promise<CompanionReminder[]> {
    const { data } = await supabase
      .from('companion_reminders')
      .select('id, text, due_at, done')
      .eq('companion_id', companionId)
      .eq('done', false)
      .order('due_at', { ascending: true })
      .limit(20);
    return (data ?? []).map((r) => ({ id: r.id, text: r.text, dueAt: r.due_at, done: r.done }));
  }

  static async completeReminder(id: string): Promise<boolean> {
    const { error } = await supabase.from('companion_reminders').update({ done: true }).eq('id', id);
    return !error;
  }
}
