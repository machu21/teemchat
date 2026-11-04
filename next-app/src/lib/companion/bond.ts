/** Relationship levels: bond XP is earned server-side via award_companion_bond(). */

export interface BondLevel {
  level: number;
  title: string;
  /** XP at which this level starts */
  minXp: number;
  /** XP at which the next level starts (null at max level) */
  nextXp: number | null;
  /** What the owner gets on reaching this level */
  unlock: string;
}

const LEVELS: Array<Omit<BondLevel, 'level' | 'nextXp'>> = [
  { title: 'New Friends', minXp: 0, unlock: 'Your companion hatches and starts learning about you' },
  { title: 'Buddies', minXp: 15, unlock: 'Remembers follow-ups from past chats' },
  { title: 'Pals', minXp: 40, unlock: 'Gives you a nickname and has more opinions' },
  { title: 'Best Friends', minXp: 90, unlock: 'Heart and music emotes, and more teasing' },
  { title: 'Soulmates', minXp: 180, unlock: 'Sparkle aura that other players can see' },
];

export function getBondLevel(xp: number): BondLevel {
  const safe = Math.max(0, Math.floor(Number.isFinite(xp) ? xp : 0));
  let idx = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    if (safe >= LEVELS[i].minXp) idx = i;
  }
  const next = LEVELS[idx + 1];
  return { ...LEVELS[idx], level: idx + 1, nextXp: next ? next.minXp : null };
}

/** 0..1 progress through the current level. */
export function bondProgress(xp: number): number {
  const lvl = getBondLevel(xp);
  if (lvl.nextXp === null) return 1;
  return Math.min(1, Math.max(0, (xp - lvl.minXp) / (lvl.nextXp - lvl.minXp)));
}

export const BOND_LEVELS = LEVELS.map((l, i) => ({ ...l, level: i + 1 }));
