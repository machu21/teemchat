// ============================================================
// ZOMBIE MODE — XP & LEVELS (pure, deterministic)
// Shared by the physical stats (fitness, strength) today and by the
// skill set later (carpentry, first aid, aiming…), so every skill
// levels on the same curve.
// ============================================================

export const PROGRESSION = {
  maxLevel: 10,
  /** XP for level n → n+1 is `base * (n + 1) ^ exponent`. */
  base: 50,
  exponent: 1.4,
} as const;

export interface LevelStat {
  /** Whole level, 0…maxLevel. */
  level: number;
  /** XP banked towards the next level. */
  xp: number;
}

export function xpToNext(level: number): number {
  if (level >= PROGRESSION.maxLevel) return Infinity;
  return Math.round(PROGRESSION.base * Math.pow(level + 1, PROGRESSION.exponent));
}

/** 0–1 progress towards the next level (1 at max level). */
export function levelProgress(s: LevelStat): number {
  const need = xpToNext(s.level);
  return Number.isFinite(need) ? Math.min(1, s.xp / need) : 1;
}

/** Adds XP (multiplied by `mul`), rolling over as many levels as it pays for. */
export function addXp(s: LevelStat, amount: number, mul = 1): { stat: LevelStat; leveledUp: boolean } {
  if (amount <= 0 || s.level >= PROGRESSION.maxLevel) return { stat: s, leveledUp: false };
  let level = s.level;
  let xp = s.xp + amount * mul;
  let leveledUp = false;
  while (level < PROGRESSION.maxLevel && xp >= xpToNext(level)) {
    xp -= xpToNext(level);
    level++;
    leveledUp = true;
  }
  if (level >= PROGRESSION.maxLevel) xp = 0;
  return { stat: { level, xp }, leveledUp };
}
