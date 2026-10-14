import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const geminiApiKey = process.env.GEMINI_API_KEY || '';
const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const ai = new GoogleGenAI({ apiKey: geminiApiKey });

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return NextResponse.json({ error: 'Invalid user token' }, { status: 401 });
    }

    const body = await req.json();
    const {
      companion,
      userName,
      currentZone,
      userMessage,
      recentHistory = [],
    } = body;

    if (!userMessage) {
      return NextResponse.json({ error: 'Missing userMessage' }, { status: 400 });
    }

    // 1. Quota check via Supabase RPC
    try {
      const { data: usage } = await supabase.rpc('check_and_increment_ai_usage', {
        p_daily_limit: 50,
      });

      if (usage && typeof usage === 'object' && 'allowed' in usage && !usage.allowed) {
        return NextResponse.json({
          response:
            "⚡ I've reached my daily energy limit (50/50 messages). Energy recharges at midnight UTC! Let's chat again tomorrow.",
          quotaExceeded: true,
        });
      }
    } catch (e) {
      console.warn('Quota check warning:', e);
    }

    // 2. Vector embedding + similarity search RAG
    let ragMemories: Array<{ memory_key: string; memory_value: string }> = [];
    try {
      const embRes = await ai.models.embedContent({
        model: 'text-embedding-004',
        contents: userMessage,
      });

      const embeddingValues = (embRes as unknown as { embedding?: { values?: number[] }; embeddings?: Array<{ values?: number[] }> }).embedding?.values ||
        (embRes as unknown as { embeddings?: Array<{ values?: number[] }> }).embeddings?.[0]?.values;

      if (embeddingValues && companion?.id) {
        const { data: matched } = await supabase.rpc('match_companion_memories', {
          p_companion_id: companion.id,
          p_query_embedding: embeddingValues,
          p_match_count: 6,
          p_min_similarity: 0.55,
        });
        if (matched && Array.isArray(matched)) {
          ragMemories = matched;
        }
      }
    } catch (e) {
      console.warn('RAG semantic lookup warning:', e);
    }

    // 3. Build system instruction
    const memoryBullets = ragMemories.map((m) => `- ${m.memory_key}: ${m.memory_value}`);
    if (companion?.learnedContext) {
      for (const [k, v] of Object.entries(companion.learnedContext)) {
        if (!memoryBullets.some((b) => b.includes(k))) {
          memoryBullets.push(`- ${k}: ${v}`);
        }
      }
    }

    const memorySection =
      memoryBullets.length > 0
        ? `\nRELEVANT MEMORIES ABOUT ${userName}:\n${memoryBullets.join('\n')}`
        : `\nWHAT YOU KNOW ABOUT ${userName}:\n- This is a new friendship. Be curious and attentive!`;

    const systemInstruction = `
You are '${companion?.name || 'Pixel Companion'}', a loyal, charming personal AI companion inside 'TeemChat', a retro 2D virtual hangout.
Persona: ${companion?.persona || 'Friendly retro companion'}
Form: ${companion?.companionType || 'robot'} (${companion?.avatarStyle || 'bot_blue'})
Owner: ${userName}
Current location: ${currentZone || 'Verdant Village'}
${memorySection}

CRITICAL RULES:
1. Speak faithfully in your persona. Warm, punchy, playful, and loyal.
2. Be curious about ${userName}'s thoughts, plans, and build ideas in TeemChat.
3. Keep replies natural, concise, and engaging (1 to 3 sentences unless technical code or deep explanation is explicitly requested).
4. For code, always use triple backticks with language. For inline code use single backticks.
5. Reference zones naturally (Verdant Village, Whispering Woods, Adventure Camp, Craggy Ridge, Crystal Bay, River Crossing).
`;

    // 4. Multi-turn conversation format
    const contents = recentHistory.slice(-8).map((msg: { role: string; content: string }) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    contents.push({
      role: 'user',
      parts: [{ text: userMessage }],
    });

    const response = await ai.models.generateContent({
      model: geminiModel,
      contents,
      config: {
        systemInstruction,
        temperature: 0.85,
        maxOutputTokens: 1024,
      },
    });

    const replyText = response.text || "I'm right beside you! Let's explore together!";

    // 5. Asynchronous fact extraction & memory insertion in background
    (async () => {
      try {
        if (!companion?.id) return;
        const factPrompt = `
Analyze this conversation:
User: "${userMessage}"
Companion: "${replyText}"
Extract any personal preferences, facts, or instructions stated by user '${userName}'.
Return a clean JSON object of key-value pairs (max 3), e.g. {"likes": "fishing", "role": "builder"}. If none, return {}. No markdown fences.
`;
        const factRes = await ai.models.generateContent({
          model: geminiModel,
          contents: factPrompt,
        });

        const rawJson = factRes.text?.replace(/```json|```/g, '').trim() || '{}';
        const start = rawJson.indexOf('{');
        const end = rawJson.lastIndexOf('}');
        if (start !== -1 && end > start) {
          const parsed = JSON.parse(rawJson.slice(start, end + 1));
          for (const [k, v] of Object.entries(parsed)) {
            const factText = `${k}: ${v} (about user ${userName})`;
            const emb = await ai.models.embedContent({
              model: 'text-embedding-004',
              contents: factText,
            });

            const embVals = (emb as unknown as { embedding?: { values?: number[] }; embeddings?: Array<{ values?: number[] }> }).embedding?.values ||
              (emb as unknown as { embeddings?: Array<{ values?: number[] }> }).embeddings?.[0]?.values;

            await supabase.from('companion_memories').insert({
              companion_id: companion.id,
              user_id: user.id,
              memory_key: k,
              memory_value: String(v),
              category: 'learned_fact',
              importance_score: 0.8,
              embedding: embVals ? `[${embVals.join(',')}]` : null,
            });
          }
        }
      } catch (err) {
        console.warn('Async fact extraction error:', err);
      }
    })();

    return NextResponse.json({ response: replyText });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Error generating companion response:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
