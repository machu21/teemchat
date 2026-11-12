import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { RATE_LIMITS } from '@/lib/rateLimit';
import {
  AI_ADDON_REQUIRED_MESSAGE,
  AI_UNAVAILABLE_MESSAGE,
  authenticateCompanionRequest,
  checkCompanionQuota,
  formatWindowReset,
} from '@/lib/companionAuth';
import {
  MAX_BODY_BYTES,
  NOTES_RESPONSE_SCHEMA,
  NOTES_SYSTEM_PROMPT,
  buildNotesPrompt,
  parseNotesRequest,
  parseNotesResult,
} from '@/lib/meetings/notesPrompt';
import { filterText } from '@/lib/safety/profanity';

const geminiApiKey = process.env.GEMINI_API_KEY || '';
const geminiModel = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const ai = new GoogleGenAI({ apiKey: geminiApiKey });

/**
 * POST /api/meetings/notes
 * Summarizes a meeting (agenda + room chat + attendees) into notes and action
 * items with Gemini, then saves them to meeting_notes under the caller's RLS.
 * Counts as one AI message against the caller's companion quota.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateCompanionRequest(req, 'user:meeting-notes', RATE_LIMITS.USER_MEETING_NOTES);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const rawText = await req.text();
    if (rawText.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'This meeting is too long to summarize in one go.' }, { status: 413 });
    }
    let body: unknown;
    try {
      body = JSON.parse(rawText);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
    }
    const parsed = parseNotesRequest(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const request = parsed.value;

    // The caller must be able to see the space (RLS decides).
    const { data: space } = await supabase.from('spaces').select('id').eq('id', request.spaceId).maybeSingle();
    if (!space) return NextResponse.json({ error: 'You cannot take notes in this space.' }, { status: 403 });

    if (!geminiApiKey) {
      return NextResponse.json({ error: 'AI notes are not configured on this server.' }, { status: 503 });
    }

    const quota = await checkCompanionQuota(supabase);
    if (!quota.allowed) {
      return NextResponse.json(
        {
          error:
            quota.limitType === 'window'
              ? `You've used your AI messages for now. They reset ${formatWindowReset(quota.resetsAt)}.`
              : quota.isTrial
                ? AI_ADDON_REQUIRED_MESSAGE
                : quota.limitType === 'unavailable'
                  ? AI_UNAVAILABLE_MESSAGE
                  : 'Daily AI limit reached. Try again tomorrow.',
          upgradeRequired: quota.isTrial,
        },
        { status: quota.limitType === 'unavailable' ? 503 : 402 }
      );
    }

    const response = await ai.models.generateContent({
      model: geminiModel,
      contents: [{ role: 'user', parts: [{ text: buildNotesPrompt(request) }] }],
      config: {
        systemInstruction: NOTES_SYSTEM_PROMPT,
        temperature: 0.3,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
        responseJsonSchema: NOTES_RESPONSE_SCHEMA,
      },
    });

    const result = parseNotesResult(response.text);
    if (!result) {
      return NextResponse.json({ error: 'The AI could not produce notes. Please try again.' }, { status: 502 });
    }

    const { data: saved, error } = await supabase
      .from('meeting_notes')
      .insert({
        space_id: request.spaceId,
        meeting_id: request.meetingId,
        room_id: request.roomId,
        title: filterText(request.title),
        summary: result.summary,
        decisions: result.decisions,
        action_items: result.actionItems,
        attendees: request.attendees.map((a) => filterText(a)),
        created_by: user.id,
      })
      .select('id, space_id, meeting_id, room_id, title, summary, decisions, action_items, attendees, created_at')
      .single();

    if (error || !saved) {
      return NextResponse.json({ error: 'Notes were written but could not be saved.' }, { status: 500 });
    }
    return NextResponse.json({ note: saved });
  } catch (err) {
    console.error('Meeting notes error:', err);
    return NextResponse.json({ error: 'Failed to create meeting notes.' }, { status: 500 });
  }
}
