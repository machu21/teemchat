import { supabase } from '../supabase';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const NOTES_MAX_LINES = 300;
export const NOTES_MAX_LINE_CHARS = 300;
export const NOTES_MAX_ATTENDEES = 50;

export interface NotesChatLine {
  name: string;
  text: string;
  at: string;
}

export interface ActionItem {
  text: string;
  owner?: string;
}

export interface MeetingNote {
  id: string;
  spaceId: string;
  meetingId: string | null;
  roomId: string | null;
  title: string;
  summary: string;
  decisions: string[];
  actionItems: ActionItem[];
  attendees: string[];
  createdAt: Date;
}

interface NoteRow {
  id: string;
  space_id: string;
  meeting_id: string | null;
  room_id: string | null;
  title: string;
  summary: string;
  decisions: unknown;
  action_items: unknown;
  attendees: unknown;
  created_at: string;
}

const strings = (v: unknown, max = 50): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, max) : [];

export function parseActionItems(v: unknown): ActionItem[] {
  if (!Array.isArray(v)) return [];
  const out: ActionItem[] = [];
  for (const item of v.slice(0, 30)) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    if (typeof r.text !== 'string' || !r.text.trim()) continue;
    out.push({
      text: r.text.trim().slice(0, 200),
      ...(typeof r.owner === 'string' && r.owner.trim() ? { owner: r.owner.trim().slice(0, 48) } : {}),
    });
  }
  return out;
}

export function toMeetingNote(r: NoteRow): MeetingNote {
  return {
    id: r.id,
    spaceId: r.space_id,
    meetingId: r.meeting_id,
    roomId: r.room_id,
    title: r.title,
    summary: r.summary,
    decisions: strings(r.decisions, 30),
    actionItems: parseActionItems(r.action_items),
    attendees: strings(r.attendees, NOTES_MAX_ATTENDEES),
    createdAt: new Date(r.created_at),
  };
}

/** Keeps the newest lines within the server's limits. */
export function trimChatLog(lines: NotesChatLine[]): NotesChatLine[] {
  return lines.slice(-NOTES_MAX_LINES).map((l) => ({
    name: l.name.slice(0, 48),
    text: l.text.slice(0, NOTES_MAX_LINE_CHARS),
    at: l.at,
  }));
}

/** Plain-text export (Copy as text). */
export function noteToText(note: Pick<MeetingNote, 'title' | 'summary' | 'decisions' | 'actionItems' | 'attendees'>): string {
  const parts = [`# ${note.title}`, '', note.summary];
  if (note.decisions.length) parts.push('', 'Decisions:', ...note.decisions.map((d) => `- ${d}`));
  if (note.actionItems.length) {
    parts.push('', 'Action items:', ...note.actionItems.map((a) => `- [ ] ${a.text}${a.owner ? ` (${a.owner})` : ''}`));
  }
  if (note.attendees.length) parts.push('', `Attendees: ${note.attendees.join(', ')}`);
  return parts.join('\n');
}

export class MeetingNotesService {
  static async list(spaceId: string): Promise<MeetingNote[]> {
    if (!UUID_REGEX.test(spaceId)) return [];
    const { data, error } = await supabase
      .from('meeting_notes')
      .select('id, space_id, meeting_id, room_id, title, summary, decisions, action_items, attendees, created_at')
      .eq('space_id', spaceId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error || !data) return [];
    return (data as NoteRow[]).map(toMeetingNote);
  }

  /** Sends the captured meeting to the server for an AI summary. */
  static async summarize(payload: {
    spaceId: string;
    roomId: string | null;
    meetingId?: string | null;
    title: string;
    agenda?: string;
    attendees: string[];
    chat: NotesChatLine[];
  }): Promise<{ note?: MeetingNote; error?: string; upgradeRequired?: boolean }> {
    const { data: { session } } = await supabase.auth.getSession();
    try {
      const res = await fetch('/api/meetings/notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({
          ...payload,
          attendees: payload.attendees.slice(0, NOTES_MAX_ATTENDEES),
          chat: trimChatLog(payload.chat),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.note) {
        return {
          error: typeof body.error === 'string' ? body.error : 'Could not create meeting notes.',
          upgradeRequired: body.upgradeRequired === true,
        };
      }
      return { note: toMeetingNote(body.note as NoteRow) };
    } catch {
      return { error: 'Network error. Please try again.' };
    }
  }
}
