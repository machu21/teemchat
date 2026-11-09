import { supabase } from '../supabase';
import {
  AgeBand,
  DEFAULT_SAFETY_PREFS,
  DmPrivacy,
  SafetyPrefs,
  ageBandFromBirthDate,
  isAgeBand,
} from '../safety/ageBand';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Purely local guests (non-UUID ids) have no database rows; keep their state on the device. */
const LOCAL_KEY = 'teemchat-local-safety-v1';

export interface MySafety {
  ageBand: AgeBand;
  hasBirthDate: boolean;
  prefs: SafetyPrefs;
}

export type ReportReason = 'harassment' | 'inappropriate' | 'spam' | 'underage' | 'other';

export const REPORT_REASONS: { id: ReportReason; label: string }[] = [
  { id: 'harassment', label: 'Harassment or bullying' },
  { id: 'inappropriate', label: 'Inappropriate content' },
  { id: 'spam', label: 'Spam or scams' },
  { id: 'underage', label: 'Underage safety concern' },
  { id: 'other', label: 'Something else' },
];

export type ModerationAction = 'kick' | 'ban' | 'unban' | 'mute_voice' | 'mute_chat' | 'unmute';

export interface SpaceRestrictions {
  banned: boolean;
  voiceMuted: boolean;
  chatMuted: boolean;
}

export const NO_RESTRICTIONS: SpaceRestrictions = { banned: false, voiceMuted: false, chatMuted: false };

const DEFAULT_SAFETY: MySafety = { ageBand: 'unknown', hasBirthDate: false, prefs: DEFAULT_SAFETY_PREFS };
const SAFETY_UNAVAILABLE: MySafety = { ...DEFAULT_SAFETY, hasBirthDate: true };

export function isPersistedId(id: string | null | undefined): id is string {
  return Boolean(id && UUID_REGEX.test(id));
}

function parseSafety(raw: unknown): MySafety {
  if (!raw || typeof raw !== 'object') return DEFAULT_SAFETY;
  const r = raw as Record<string, unknown>;
  return {
    ageBand: isAgeBand(r.age_band) ? r.age_band : 'unknown',
    hasBirthDate: r.has_birth_date === true,
    prefs: {
      chatFilter: r.chat_filter !== false,
      dmPrivacy: r.dm_privacy === 'everyone' ? 'everyone' : 'friends',
    },
  };
}

function parseRestrictions(raw: unknown): SpaceRestrictions {
  if (!raw || typeof raw !== 'object') return NO_RESTRICTIONS;
  const r = raw as Record<string, unknown>;
  return {
    banned: r.banned === true,
    voiceMuted: r.voice_muted === true,
    chatMuted: r.chat_muted === true,
  };
}

interface LocalSafety {
  ageBand: AgeBand;
  prefs: SafetyPrefs;
  blocked: string[];
}

function readLocal(): LocalSafety | null {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(LOCAL_KEY) : null;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalSafety>;
    return {
      ageBand: isAgeBand(parsed.ageBand) ? parsed.ageBand : 'unknown',
      prefs: { ...DEFAULT_SAFETY_PREFS, ...(parsed.prefs || {}) },
      blocked: Array.isArray(parsed.blocked) ? parsed.blocked.filter((x) => typeof x === 'string') : [],
    };
  } catch {
    return null;
  }
}

function writeLocal(patch: Partial<LocalSafety>): void {
  try {
    const current = readLocal() || { ageBand: 'unknown' as AgeBand, prefs: DEFAULT_SAFETY_PREFS, blocked: [] };
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify({ ...current, ...patch }));
  } catch {
    // Storage blocked (private mode): state still applies for this visit
  }
}

export class SafetyService {
  /**
   * Loads the caller's safety profile. If no birth date is stored yet, it first tries
   * to claim the one captured at password signup (auth metadata) so those users never
   * see the age gate.
   */
  static async getMySafety(userId: string): Promise<MySafety> {
    if (!isPersistedId(userId)) {
      const local = readLocal();
      if (!local) return DEFAULT_SAFETY;
      return { ageBand: local.ageBand, hasBirthDate: local.ageBand !== 'unknown', prefs: local.prefs };
    }
    try {
      const { data, error } = await supabase.rpc('get_my_safety');
      // Safety RPCs unavailable (migration not deployed / offline): never trap the user
      // behind the age gate; the database still enforces whatever policies exist.
      if (error) return SAFETY_UNAVAILABLE;
      const safety = parseSafety(data);
      if (safety.hasBirthDate) return safety;
      const claimed = await supabase.rpc('set_my_birth_date', { p_date: null });
      return claimed.error ? safety : parseSafety(claimed.data);
    } catch {
      return SAFETY_UNAVAILABLE;
    }
  }

  /** Stores the birth date once. Returns the new profile or an error message. */
  static async setBirthDate(userId: string, birthDate: string): Promise<{ safety?: MySafety; error?: string }> {
    if (!isPersistedId(userId)) {
      const ageBand = ageBandFromBirthDate(birthDate);
      const prefs = ageBand === 'child' ? DEFAULT_SAFETY_PREFS : readLocal()?.prefs || DEFAULT_SAFETY_PREFS;
      writeLocal({ ageBand, prefs });
      return { safety: { ageBand, hasBirthDate: ageBand !== 'unknown', prefs } };
    }
    const { data, error } = await supabase.rpc('set_my_birth_date', { p_date: birthDate });
    if (error) {
      return {
        error: /already set/i.test(error.message)
          ? 'Your birth date is already saved.'
          : 'Could not save your birth date. Please try again.',
      };
    }
    return { safety: parseSafety(data) };
  }

  static async updatePrefs(
    userId: string,
    patch: { chatFilter?: boolean; dmPrivacy?: DmPrivacy }
  ): Promise<MySafety | null> {
    if (!isPersistedId(userId)) {
      const local = readLocal();
      const child = local?.ageBand === 'child';
      const prefs: SafetyPrefs = child
        ? DEFAULT_SAFETY_PREFS
        : { ...(local?.prefs || DEFAULT_SAFETY_PREFS), ...patch };
      writeLocal({ prefs });
      const ageBand = local?.ageBand || 'unknown';
      return { ageBand, hasBirthDate: ageBand !== 'unknown', prefs };
    }
    const { data, error } = await supabase.rpc('update_my_safety', {
      p_chat_filter: patch.chatFilter ?? null,
      p_dm_privacy: patch.dmPrivacy ?? null,
    });
    if (error) return null;
    return parseSafety(data);
  }

  static async listBlocked(userId: string): Promise<string[]> {
    if (!isPersistedId(userId)) return readLocal()?.blocked || [];
    try {
      const { data, error } = await supabase
        .from('user_blocks')
        .select('blocked_user_id')
        .eq('blocker_id', userId);
      if (error || !data) return [];
      return data.map((row: { blocked_user_id: string }) => row.blocked_user_id);
    } catch {
      return [];
    }
  }

  static async block(userId: string, targetId: string): Promise<boolean> {
    if (!targetId || targetId === userId) return false;
    if (!isPersistedId(userId) || !isPersistedId(targetId)) {
      const blocked = new Set(readLocal()?.blocked || []);
      blocked.add(targetId);
      writeLocal({ blocked: [...blocked] });
      return true;
    }
    const { error } = await supabase
      .from('user_blocks')
      .insert({ blocker_id: userId, blocked_user_id: targetId });
    // 23505 = already blocked: the outcome the caller wanted.
    return !error || error.code === '23505';
  }

  static async unblock(userId: string, targetId: string): Promise<boolean> {
    if (!isPersistedId(userId) || !isPersistedId(targetId)) {
      const blocked = (readLocal()?.blocked || []).filter((id) => id !== targetId);
      writeLocal({ blocked });
      return true;
    }
    const { error } = await supabase
      .from('user_blocks')
      .delete()
      .eq('blocker_id', userId)
      .eq('blocked_user_id', targetId);
    return !error;
  }

  static async report(params: {
    reporterId: string;
    reportedUserId: string;
    reason: ReportReason;
    details?: string;
    spaceId?: string | null;
    roomId?: string | null;
  }): Promise<{ ok: boolean; error?: string }> {
    const { reporterId, reportedUserId, reason, details, spaceId, roomId } = params;
    if (!isPersistedId(reporterId) || !isPersistedId(reportedUserId)) {
      return { ok: false, error: 'Reports need a signed-in account on both sides.' };
    }
    const { error } = await supabase.from('user_reports').insert({
      reporter_id: reporterId,
      reported_user_id: reportedUserId,
      reason,
      details: details?.trim().slice(0, 500) || null,
      space_id: isPersistedId(spaceId) ? spaceId : null,
      room_id: roomId || null,
    });
    if (error) return { ok: false, error: 'Could not send the report. Please try again.' };
    return { ok: true };
  }

  /** Whether the UI should offer "Add Friend" / "Message". Never reveals the other user's age. */
  static async contactPermissions(otherUserId: string): Promise<{ canBefriend: boolean; canMessage: boolean }> {
    if (!isPersistedId(otherUserId)) return { canBefriend: true, canMessage: true };
    try {
      const { data, error } = await supabase.rpc('contact_permissions', { p_other: otherUserId });
      if (error || !data) return { canBefriend: true, canMessage: true };
      const r = data as Record<string, unknown>;
      return { canBefriend: r.can_befriend !== false, canMessage: r.can_message !== false };
    } catch {
      return { canBefriend: true, canMessage: true };
    }
  }

  static async myRestrictions(spaceId: string): Promise<SpaceRestrictions> {
    if (!isPersistedId(spaceId)) return NO_RESTRICTIONS;
    try {
      const { data, error } = await supabase.rpc('my_space_restrictions', { p_space: spaceId });
      if (error) return NO_RESTRICTIONS;
      return parseRestrictions(data);
    } catch {
      return NO_RESTRICTIONS;
    }
  }

  static async amIModerator(spaceId: string): Promise<boolean> {
    if (!isPersistedId(spaceId)) return false;
    try {
      const { data, error } = await supabase.rpc('am_i_space_moderator', { p_space: spaceId });
      return !error && data === true;
    } catch {
      return false;
    }
  }

  static async moderate(params: {
    spaceId: string;
    targetUserId: string;
    action: ModerationAction;
    minutes?: number | null;
    reason?: string;
  }): Promise<{ ok: boolean; error?: string }> {
    const { spaceId, targetUserId, action, minutes, reason } = params;
    if (!isPersistedId(spaceId) || !isPersistedId(targetUserId)) {
      return { ok: false, error: 'Moderation is only available in saved spaces.' };
    }
    const { error } = await supabase.rpc('moderate_space_member', {
      p_space: spaceId,
      p_user: targetUserId,
      p_action: action,
      p_minutes: minutes ?? null,
      p_reason: reason?.trim() || null,
    });
    if (error) {
      if (/owner/i.test(error.message)) return { ok: false, error: 'You cannot moderate the space owner or other admins.' };
      return { ok: false, error: 'Action failed. Please try again.' };
    }
    return { ok: true };
  }
}
