/**
 * Shared types for the living AI companion (client + server).
 * Pure module: no browser or server imports.
 */

export const COMPANION_SPECIES = ['cat', 'robot', 'dog', 'wisp'] as const;
export type CompanionSpecies = (typeof COMPANION_SPECIES)[number];

export const COMPANION_MOODS = ['happy', 'excited', 'curious', 'calm', 'sleepy', 'proud', 'worried', 'sulky'] as const;
export type CompanionMood = (typeof COMPANION_MOODS)[number];

export const COMPANION_EMOTES = ['none', 'heart', 'sparkle', 'question', 'music', 'zzz', 'exclaim', 'laugh'] as const;
export type CompanionEmote = (typeof COMPANION_EMOTES)[number];

export interface CompanionTraits {
  /** 0..1 — jokes, puns, exclamation marks */
  playful: number;
  /** 0..1 — asks about the owner, notices things */
  curious: number;
  /** 0..1 — light teasing, playful opinions */
  sassy: number;
  /** 0..1 — soft, unhurried tone */
  calm: number;
}

export const DEFAULT_TRAITS: CompanionTraits = { playful: 0.7, curious: 0.7, sassy: 0.3, calm: 0.5 };

/** What the client tells the companion about the world right now. Display-only context, never trusted for auth. */
export interface WorldContext {
  /** Map the owner is on, e.g. "Zombie City" (absent outside a space) */
  mapName?: string;
  /** 'social' hangout or 'zombie' survival */
  mode?: 'social' | 'zombie';
  /** Places on the current map the companion may suggest / lead to */
  places?: Array<{ id: string; name: string }>;
  zone?: string;
  /** e.g. 'exploring', 'zombie_mode', 'in_voice', 'listening_music', 'dashboard' */
  activity?: string;
  nearbyNames?: string[];
  onlineFriendNames?: string[];
  /** Owner's local time, 'HH:MM' */
  localTime?: string;
  /** 0 = Sunday */
  localDay?: number;
  /** Seconds the owner has been in this session */
  sessionSeconds?: number;
}

export const COMPANION_ACTION_TYPES = [
  'navigate_to_zone',
  'open_dms',
  'open_friends',
  'open_map',
  'start_tour',
  'set_reminder',
] as const;
export type CompanionActionType = (typeof COMPANION_ACTION_TYPES)[number];

export interface CompanionAction {
  type: CompanionActionType;
  /** Zone id for navigate_to_zone, friend name for open_dms, reminder text for set_reminder */
  target?: string;
  /** Minutes from now, set_reminder only */
  minutes?: number;
}

export interface CompanionReply {
  text: string;
  mood: CompanionMood;
  emote: CompanionEmote;
  actions: CompanionAction[];
}

export interface CompanionMemoryFact {
  id?: string;
  key: string;
  value: string;
  category?: string;
  importance?: number;
  createdAt?: string;
}

export interface CompanionSummary {
  id?: string;
  summary: string;
  openThreads: string[];
  createdAt?: string;
}

/** Companion profile as loaded from `ai_companions` (server is the source of truth). */
export interface CompanionProfile {
  id: string;
  userId: string;
  name: string;
  persona: string;
  species: CompanionSpecies;
  avatarStyle: string;
  traits: CompanionTraits;
  mood: CompanionMood;
  bondXp: number;
  nicknameForOwner: string | null;
  lastSeenOwnerAt: string | null;
  tourProgress: Record<string, boolean>;
}
