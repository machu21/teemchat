import { supabase } from '../supabase';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROOM_ID = /^[a-z0-9-]{1,48}$/;

export interface Meeting {
  id: string;
  spaceId: string;
  roomId: string | null;
  title: string;
  agenda: string | null;
  startsAt: Date;
  durationMin: number;
  createdBy: string | null;
}

export interface MeetingWithSpace extends Meeting {
  spaceName: string;
  spaceSlug: string | null;
}

interface MeetingRow {
  id: string;
  space_id: string;
  room_id: string | null;
  title: string;
  agenda: string | null;
  starts_at: string;
  duration_min: number;
  created_by: string | null;
  spaces?: { name?: string; slug?: string | null } | null;
}

const COLUMNS = 'id, space_id, room_id, title, agenda, starts_at, duration_min, created_by';

function toMeeting(r: MeetingRow): Meeting {
  return {
    id: r.id,
    spaceId: r.space_id,
    roomId: r.room_id,
    title: r.title,
    agenda: r.agenda,
    startsAt: new Date(r.starts_at),
    durationMin: Number(r.duration_min) || 30,
    createdBy: r.created_by,
  };
}

export interface MeetingInput {
  title: string;
  agenda?: string;
  startsAt: Date;
  durationMin: number;
  roomId: string | null;
}

/** Client-side validation mirroring the table checks. Returns an error or null. */
export function validateMeeting(input: MeetingInput, now: Date = new Date()): string | null {
  const title = input.title.trim();
  if (!title) return 'Give the meeting a title.';
  if (title.length > 120) return 'Title is too long (120 characters max).';
  if ((input.agenda ?? '').length > 2000) return 'Agenda is too long (2000 characters max).';
  if (!(input.startsAt instanceof Date) || Number.isNaN(input.startsAt.getTime())) return 'Pick a date and time.';
  if (input.startsAt.getTime() < now.getTime() - 5 * 60_000) return 'That time is in the past.';
  if (!Number.isInteger(input.durationMin) || input.durationMin < 5 || input.durationMin > 480) {
    return 'Duration must be between 5 minutes and 8 hours.';
  }
  if (input.roomId !== null && !ROOM_ID.test(input.roomId)) return 'Unknown room.';
  return null;
}

/** Meetings that haven't ended yet, soonest first. */
export function upcomingOnly<T extends Meeting>(list: T[], now: Date = new Date()): T[] {
  return list
    .filter((m) => m.startsAt.getTime() + m.durationMin * 60_000 > now.getTime())
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

export class MeetingService {
  static async listUpcoming(spaceId: string): Promise<Meeting[]> {
    if (!UUID_REGEX.test(spaceId)) return [];
    const since = new Date(Date.now() - 8 * 60 * 60_000).toISOString();
    const { data, error } = await supabase
      .from('space_meetings')
      .select(COLUMNS)
      .eq('space_id', spaceId)
      .gte('starts_at', since)
      .order('starts_at', { ascending: true })
      .limit(50);
    if (error || !data) return [];
    return upcomingOnly((data as MeetingRow[]).map(toMeeting));
  }

  /** Upcoming meetings across the spaces I'm a member of (dashboard). */
  static async listMineUpcoming(userId: string): Promise<MeetingWithSpace[]> {
    if (!UUID_REGEX.test(userId)) return [];
    const { data: memberships } = await supabase.from('space_members').select('space_id').eq('user_id', userId);
    const spaceIds = (memberships as { space_id: string }[] | null)?.map((m) => m.space_id) ?? [];
    if (spaceIds.length === 0) return [];
    const since = new Date(Date.now() - 8 * 60 * 60_000).toISOString();
    const { data, error } = await supabase
      .from('space_meetings')
      .select(`${COLUMNS}, spaces(name, slug)`)
      .in('space_id', spaceIds.slice(0, 100))
      .gte('starts_at', since)
      .order('starts_at', { ascending: true })
      .limit(20);
    if (error || !data) return [];
    return upcomingOnly(
      (data as MeetingRow[]).map((r) => ({
        ...toMeeting(r),
        spaceName: r.spaces?.name || 'Space',
        spaceSlug: r.spaces?.slug ?? null,
      }))
    );
  }

  static async get(meetingId: string): Promise<Meeting | null> {
    if (!UUID_REGEX.test(meetingId)) return null;
    const { data, error } = await supabase.from('space_meetings').select(COLUMNS).eq('id', meetingId).maybeSingle();
    if (error || !data) return null;
    return toMeeting(data as MeetingRow);
  }

  static async create(spaceId: string, userId: string, input: MeetingInput): Promise<{ meeting?: Meeting; error?: string }> {
    const invalid = validateMeeting(input);
    if (invalid) return { error: invalid };
    const { data, error } = await supabase
      .from('space_meetings')
      .insert({
        space_id: spaceId,
        room_id: input.roomId,
        title: input.title.trim(),
        agenda: input.agenda?.trim() || null,
        starts_at: input.startsAt.toISOString(),
        duration_min: input.durationMin,
        created_by: userId,
      })
      .select(COLUMNS)
      .single();
    if (error || !data) return { error: 'Could not schedule the meeting. Only hosts can schedule.' };
    return { meeting: toMeeting(data as MeetingRow) };
  }

  static async remove(meetingId: string): Promise<boolean> {
    const { error } = await supabase.from('space_meetings').delete().eq('id', meetingId);
    return !error;
  }
}
