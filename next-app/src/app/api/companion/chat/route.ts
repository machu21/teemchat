import { NextRequest, NextResponse, after } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { RATE_LIMITS } from '@/lib/rateLimit';
import { authenticateCompanionRequest, checkCompanionQuota, formatWindowReset } from '@/lib/companionAuth';
import { COMPANION_REPLY_SCHEMA, buildSystemPrompt } from '@/lib/companion/prompt';
import { normalizeWorldContext, oneLine, parseCompanionReply } from '@/lib/companion/normalize';
import {
  CompanionAiDeps,
  awardBond,
  ephemeralCompanion,
  getOrCreateCompanion,
  learnFromExchange,
  loadRecentFacts,
  loadRecentSummaries,
  maybeSummarize,
  mergeFacts,
  saveExchange,
  updateCompanionState,
} from '@/lib/companion/server';
import { CompanionMemoryFact } from '@/lib/companion/types';

const geminiApiKey = process.env.GEMINI_API_KEY || '';
const geminiModel = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

const ai = new GoogleGenAI({ apiKey: geminiApiKey });

const MAX_MESSAGE_LENGTH = 2000;

type EmbedResult = { embedding?: { values?: number[] }; embeddings?: Array<{ values?: number[] }> };

async function embed(text: string): Promise<number[] | null> {
  const res = (await ai.models.embedContent({
    model: 'gemini-embedding-001',
    contents: text,
    config: { outputDimensionality: 768 },
  })) as unknown as EmbedResult;
  return res?.embedding?.values || res?.embeddings?.[0]?.values || null;
}

const aiDeps: CompanionAiDeps = {
  embed,
  generateJson: async (prompt) => {
    const res = await ai.models.generateContent({
      model: geminiModel,
      contents: prompt,
      config: { responseMimeType: 'application/json', temperature: 0.2 },
    });
    return res.text;
  },
};

/** Run background work after the response is sent; falls back to fire-and-forget outside a request scope (tests). */
function runAfter(task: () => Promise<unknown>) {
  const safe = () => task().catch((err) => console.warn('Companion background task warning:', err));
  try {
    after(safe);
  } catch {
    void safe();
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateCompanionRequest(req, 'user:ai', RATE_LIMITS.USER_AI_CHAT);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const body = await req.json();
    const { userName, userMessage, recentHistory = [] } = (body && typeof body === 'object' ? body : {}) as {
      userName?: unknown;
      userMessage?: unknown;
      recentHistory?: unknown;
    };

    if (typeof userMessage !== 'string' || !userMessage.trim()) {
      return NextResponse.json({ error: 'Missing userMessage' }, { status: 400 });
    }
    if (userMessage.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        { error: 'Message too long', message: `Keep messages under ${MAX_MESSAGE_LENGTH} characters.` },
        { status: 400 }
      );
    }

    // 1. Quota check via Supabase RPC
    const quota = await checkCompanionQuota(supabase);
    if (!quota.allowed) {
      return NextResponse.json({
        response: quota.limitType === 'window'
          ? `You've used your AI messages for this 5-hour window. Your limit resets ${formatWindowReset(quota.resetsAt)}.`
          : quota.isTrial
          ? "You've used your 5 free AI messages. Get the AI add-on to keep chatting — 60 messages every 5 hours."
          : "I've reached my daily energy limit (50/50 messages). Energy recharges at midnight UTC! Let's chat again tomorrow.",
        quotaExceeded: true,
        upgradeRequired: quota.isTrial,
        mood: 'sleepy',
        emote: 'zzz',
        actions: [],
      });
    }

    // 2. The companion is always loaded server-side — persona/memories from the client are ignored.
    const companion = await getOrCreateCompanion(supabase, user.id);
    const ownerName = oneLine(userName, 32) || oneLine(user.user_metadata?.display_name, 32) || 'friend';
    const world = normalizeWorldContext((body as Record<string, unknown>).world ?? {
      zone: (body as Record<string, unknown>).currentZone,
    });

    // 3. Memory: semantic recall + most important facts + recent diary summaries
    let facts: CompanionMemoryFact[] = [];
    let summaries: Awaited<ReturnType<typeof loadRecentSummaries>> = [];
    if (companion) {
      const [semantic, recent, diary] = await Promise.all([
        embed(userMessage)
          .then(async (vec) => {
            if (!vec) return [];
            const { data } = await supabase.rpc('match_companion_memories', {
              p_companion_id: companion.id,
              p_query_embedding: vec,
              p_match_count: 6,
              p_min_similarity: 0.55,
            });
            return Array.isArray(data)
              ? data.map((m: { memory_key: string; memory_value: string }) => ({ key: m.memory_key, value: m.memory_value }))
              : [];
          })
          .catch((e) => {
            console.warn('RAG semantic lookup warning:', e);
            return [];
          }),
        loadRecentFacts(supabase, companion.id, 8),
        loadRecentSummaries(supabase, companion.id, 3),
      ]);
      facts = mergeFacts(semantic, recent);
      summaries = diary;
    }

    const systemInstruction = buildSystemPrompt({
      companion: companion ?? ephemeralCompanion(user.id),
      ownerName,
      facts,
      summaries,
      world,
    });

    // 4. Multi-turn conversation (text only, bounded)
    const history = Array.isArray(recentHistory) ? recentHistory : [];
    const contents = history
      .slice(-8)
      .filter((m): m is { role: string; content: string } => !!m && typeof m.content === 'string')
      .map((msg) => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content.slice(0, MAX_MESSAGE_LENGTH) }],
      }));
    contents.push({ role: 'user', parts: [{ text: userMessage }] });

    const response = await ai.models.generateContent({
      model: geminiModel,
      contents,
      config: {
        systemInstruction,
        temperature: 0.9,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
        responseJsonSchema: COMPANION_REPLY_SCHEMA,
      },
    });

    const reply = parseCompanionReply(response.text, companion?.mood ?? 'happy');

    // 5. Bond grows with every real conversation (throttled server-side)
    const bondXp = companion ? ((await awardBond(supabase, 1)) ?? companion.bondXp) : 0;

    // 6. Background: persist history, learn facts, update mood, roll up summaries
    if (companion) {
      runAfter(async () => {
        await Promise.all([
          saveExchange(supabase, companion, userMessage, reply.text),
          updateCompanionState(supabase, companion, reply.mood),
          learnFromExchange(supabase, aiDeps, companion, ownerName, userMessage, reply.text),
        ]);
        await maybeSummarize(supabase, aiDeps, companion, ownerName);
      });
    }

    return NextResponse.json({
      response: reply.text,
      mood: reply.mood,
      emote: reply.emote,
      actions: reply.actions,
      bondXp,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Error generating companion response:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
