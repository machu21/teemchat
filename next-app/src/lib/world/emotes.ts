/**
 * Player emotes and presence states shown above avatars.
 * Pure module shared by WorldSync, the canvas and the UI.
 */

export type EmoteId = 'wave' | 'dance' | 'clap' | 'laugh' | 'heart' | 'thumbs' | 'wow';

export interface EmoteDef {
  id: EmoteId;
  emoji: string;
  label: string;
  /** How long it stays above the head. */
  durationMs: number;
}

export const EMOTES: readonly EmoteDef[] = [
  { id: 'wave', emoji: '👋', label: 'Wave', durationMs: 2500 },
  { id: 'dance', emoji: '💃', label: 'Dance', durationMs: 4000 },
  { id: 'clap', emoji: '👏', label: 'Clap', durationMs: 2500 },
  { id: 'laugh', emoji: '😂', label: 'Laugh', durationMs: 2500 },
  { id: 'heart', emoji: '❤️', label: 'Love', durationMs: 2500 },
  { id: 'thumbs', emoji: '👍', label: 'Thumbs up', durationMs: 2500 },
  { id: 'wow', emoji: '😮', label: 'Wow', durationMs: 2500 },
];

const BY_ID = new Map(EMOTES.map((e) => [e.id, e]));

export function isEmoteId(value: unknown): value is EmoteId {
  return typeof value === 'string' && BY_ID.has(value as EmoteId);
}

export function emoteDef(id: EmoteId): EmoteDef {
  return BY_ID.get(id)!;
}

/** Minimum gap between broadcast emotes (keeps well under the 10 msg/s budget). */
export const EMOTE_COOLDOWN_MS = 750;

/** Client-side throttle: returns true when an emote may be sent now. */
export function createEmoteThrottle(cooldownMs: number = EMOTE_COOLDOWN_MS, now: () => number = Date.now) {
  let last = -Infinity;
  return () => {
    const t = now();
    if (t - last < cooldownMs) return false;
    last = t;
    return true;
  };
}

// ── Player status (presence) ──

export type PlayerStatus = 'available' | 'away' | 'busy' | 'focus';

export const STATUS_OPTIONS: readonly { id: PlayerStatus; label: string; icon: string; hint: string }[] = [
  { id: 'available', label: 'Available', icon: '🟢', hint: 'Open to chat' },
  { id: 'busy', label: 'Do not disturb', icon: '🔴', hint: 'No chat pop-ups or sounds' },
  { id: 'focus', label: 'Focus', icon: '🎧', hint: 'Do not disturb, and other voices are muted outside your room' },
  { id: 'away', label: 'Away', icon: '🌙', hint: 'Set automatically after 10 minutes idle' },
];

export function isPlayerStatus(value: unknown): value is PlayerStatus {
  return value === 'available' || value === 'away' || value === 'busy' || value === 'focus';
}

export function statusIcon(status: PlayerStatus | undefined): string | null {
  switch (status) {
    case 'busy':
      return '🔴';
    case 'focus':
      return '🎧';
    case 'away':
      return '🌙';
    default:
      return null;
  }
}

/** Busy and Focus suppress chat banners, sounds and pop-ups. */
export function isDoNotDisturb(status: PlayerStatus): boolean {
  return status === 'busy' || status === 'focus';
}

export const AUTO_AWAY_MS = 10 * 60 * 1000;
