/**
 * Player emotes and presence states shown above avatars.
 * Pure module shared by WorldSync, the canvas and the UI.
 */

import type { IconName } from '@/lib/icons';

export type EmoteId = 'wave' | 'dance' | 'clap' | 'laugh' | 'heart' | 'thumbs' | 'wow';

export interface EmoteDef {
  id: EmoteId;
  icon: IconName;
  /** Icon colour above the avatar. */
  color: string;
  label: string;
  /** How long it stays above the head. */
  durationMs: number;
}

export const EMOTES: readonly EmoteDef[] = [
  { id: 'wave', icon: 'hand', color: '#F59E0B', label: 'Wave', durationMs: 2500 },
  { id: 'dance', icon: 'music2', color: '#A855F7', label: 'Dance', durationMs: 4000 },
  { id: 'clap', icon: 'party', color: '#EC4899', label: 'Clap', durationMs: 2500 },
  { id: 'laugh', icon: 'laugh', color: '#EAB308', label: 'Laugh', durationMs: 2500 },
  { id: 'heart', icon: 'heart', color: '#EF4444', label: 'Love', durationMs: 2500 },
  { id: 'thumbs', icon: 'thumbsUp', color: '#3B82F6', label: 'Thumbs up', durationMs: 2500 },
  { id: 'wow', icon: 'sparkles', color: '#14B8A6', label: 'Wow', durationMs: 2500 },
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

export const STATUS_OPTIONS: readonly { id: PlayerStatus; label: string; icon: IconName; color: string; hint: string }[] = [
  { id: 'available', label: 'Available', icon: 'dotFilled', color: '#22C55E', hint: 'Open to chat' },
  { id: 'busy', label: 'Do not disturb', icon: 'busy', color: '#EF4444', hint: 'No chat pop-ups or sounds' },
  { id: 'focus', label: 'Focus', icon: 'headphones', color: '#8B5CF6', hint: 'Do not disturb, and other voices are muted outside your room' },
  { id: 'away', label: 'Away', icon: 'moon', color: '#F59E0B', hint: 'Set automatically after 10 minutes idle' },
];

export function isPlayerStatus(value: unknown): value is PlayerStatus {
  return value === 'available' || value === 'away' || value === 'busy' || value === 'focus';
}

/** Badge shown on the avatar for non-default statuses (null when Available). */
export function statusIcon(status: PlayerStatus | undefined): { icon: IconName; color: string } | null {
  if (!status || status === 'available') return null;
  const o = STATUS_OPTIONS.find((s) => s.id === status);
  return o ? { icon: o.icon, color: o.color } : null;
}

/** Busy and Focus suppress chat banners, sounds and pop-ups. */
export function isDoNotDisturb(status: PlayerStatus): boolean {
  return status === 'busy' || status === 'focus';
}

export const AUTO_AWAY_MS = 10 * 60 * 1000;
