import { addXp, type LevelStat } from './progression';
import type { IconName } from '@/lib/icons';

// ============================================================
// ZOMBIE MODE — SKILLS (pure, deterministic)
// Fourteen skills on the same XP curve as fitness and strength
// (progression.ts). You get better at what you do: shooting trains
// Aiming, reloading trains Reloading, swinging and repairing weapons
// trains Maintenance, boarding up trains Carpentry, treating wounds
// trains First Aid, mending clothes trains Tailoring.
// Skill books multiply XP for a range of levels (Vol. 1: levels 0–4,
// Vol. 2: levels 5–9); traits and occupations add their own multipliers.
// Every skill now has an activity that trains it (cooking at a fire,
// farming plots, fishing, trapping, foraging, vehicle repairs, electrical
// and metal recipes); occupations and books still give a head start.
// ============================================================

export type SkillId =
  | 'aiming'
  | 'reloading'
  | 'maintenance'
  | 'firstAid'
  | 'carpentry'
  | 'tailoring'
  | 'cooking'
  | 'farming'
  | 'fishing'
  | 'trapping'
  | 'foraging'
  | 'mechanics'
  | 'electrical'
  | 'metalworking';

export const SKILL_IDS: readonly SkillId[] = [
  'aiming',
  'reloading',
  'maintenance',
  'firstAid',
  'carpentry',
  'tailoring',
  'cooking',
  'farming',
  'fishing',
  'trapping',
  'foraging',
  'mechanics',
  'electrical',
  'metalworking',
];

export type SkillGroup = 'Combat' | 'Survival' | 'Crafting';

export interface SkillInfo {
  label: string;
  group: SkillGroup;
  icon: IconName;
  /** How you train it (shown in the skills panel). */
  practice: string;
  /** What a higher level does. */
  effect: string;
  /** Can be practised in the game today. */
  practisable: boolean;
  /** Counts as a weapon skill (the Pacifist trait learns these slower). */
  combat?: boolean;
}

export const SKILLS: Record<SkillId, SkillInfo> = {
  aiming: { label: 'Aiming', group: 'Combat', icon: 'crosshair', practice: 'Fire guns; hits teach more than misses.', effect: 'Tighter spread.', practisable: true, combat: true },
  reloading: { label: 'Reloading', group: 'Combat', icon: 'pistol', practice: 'Reload guns.', effect: 'Faster reloads.', practisable: true, combat: true },
  maintenance: { label: 'Maintenance', group: 'Combat', icon: 'wrench', practice: 'Land melee hits; repair weapons with duct tape.', effect: 'Weapons wear slower; repairs restore more.', practisable: true, combat: true },
  firstAid: { label: 'First Aid', group: 'Survival', icon: 'bandage', practice: 'Bandage, disinfect and splint injuries.', effect: 'Wounds and bones heal faster.', practisable: true },
  carpentry: { label: 'Carpentry', group: 'Crafting', icon: 'hammer', practice: 'Board up doors and windows.', effect: 'Board up faster.', practisable: true },
  tailoring: { label: 'Tailoring', group: 'Crafting', icon: 'shirt', practice: 'Mend clothes with thread.', effect: 'Repairs restore more.', practisable: true },
  cooking: { label: 'Cooking', group: 'Survival', icon: 'soup', practice: 'Cook at a stove or campfire.', effect: 'Cook faster; unlocks soup.', practisable: true },
  farming: { label: 'Farming', group: 'Survival', icon: 'sprout', practice: 'Dig, plant, water and harvest farm plots.', effect: 'Bigger harvests.', practisable: true },
  fishing: { label: 'Fishing', group: 'Survival', icon: 'fishingHook', practice: 'Fish at the park fountains with a rod.', effect: 'More bites, bigger fish.', practisable: true },
  trapping: { label: 'Trapping', group: 'Survival', icon: 'rabbit', practice: 'Set, bait and empty snares; butcher the catch.', effect: 'Snares you set catch more.', practisable: true },
  foraging: { label: 'Foraging', group: 'Survival', icon: 'leaf', practice: 'Search grass, parks and dirt (U).', effect: 'Find more, and rarer things.', practisable: true },
  mechanics: { label: 'Mechanics', group: 'Crafting', icon: 'car', practice: 'Fit tyres and batteries, repair engines.', effect: 'Engine repairs go further; with Electrical 1 at level 2, hotwiring.', practisable: true },
  electrical: { label: 'Electrical', group: 'Crafting', icon: 'zap', practice: 'Electrical recipes, generator repairs, hotwiring.', effect: 'Wire generators and devices.', practisable: true },
  metalworking: { label: 'Metalworking', group: 'Crafting', icon: 'flame', practice: 'Weld at a workbench; weld car panels.', effect: 'Weld metal defences.', practisable: true },
};

export type SkillSet = Record<SkillId, LevelStat>;

export function freshSkills(start: Partial<Record<SkillId, number>> = {}): SkillSet {
  const out = {} as SkillSet;
  for (const id of SKILL_IDS) out[id] = { level: Math.max(0, Math.min(10, start[id] ?? 0)), xp: 0 };
  return out;
}

/** XP per activity (before multipliers). */
export const SKILL_XP = {
  shot: 0.5,
  hit: 2,
  reload: 3,
  meleeHit: 1,
  repair: 6,
  treatment: 6,
  plank: 8,
  mend: 8,
} as const;

/** Skill books: which levels each volume covers and its XP multiplier. */
export const SKILL_BOOKS = {
  1: { from: 0, to: 4, mul: 3 },
  2: { from: 5, to: 9, mul: 2.5 },
} as const;
export type BookVolume = keyof typeof SKILL_BOOKS;

/** Volumes read per skill. */
export type BooksRead = Partial<Record<SkillId, BookVolume[]>>;

/** The book multiplier that applies at a skill's current level. */
export function bookMultiplier(read: BookVolume[] | undefined, level: number): number {
  let mul = 1;
  for (const v of read ?? []) {
    const b = SKILL_BOOKS[v];
    if (level >= b.from && level <= b.to) mul = Math.max(mul, b.mul);
  }
  return mul;
}

export interface XpContext {
  /** Trait / occupation multiplier on all learning (Fast / Slow Learner). */
  learnMul: number;
  /** Extra multiplier on weapon skills (Pacifist). */
  combatMul: number;
  books: BooksRead;
}

/** Adds XP to one skill with every multiplier applied. */
export function trainSkill(set: SkillSet, skill: SkillId, amount: number, ctx: XpContext): { set: SkillSet; leveledUp: boolean } {
  const cur = set[skill];
  const mul = ctx.learnMul * (SKILLS[skill].combat ? ctx.combatMul : 1) * bookMultiplier(ctx.books[skill], cur.level);
  const r = addXp(cur, amount, mul);
  if (r.stat === cur) return { set, leveledUp: false };
  return { set: { ...set, [skill]: r.stat }, leveledUp: r.leveledUp };
}

// ---------------------------------------------------------------- effects (level 0–10)

/** Gun spread: ×1.3 untrained, ×1 at 5, ×0.7 at 10. */
export const aimSpreadMul = (level: number) => 1.3 - 0.06 * level;
/** Reload time: ×1.2 untrained, ×0.95 at 5, ×0.7 at 10. */
export const reloadTimeMul = (level: number) => 1.2 - 0.05 * level;
/** Chance a connecting swing costs a point of wear: 100 % untrained, 40 % at 10. */
export const wearChance = (level: number) => 1 - 0.06 * level;
/** Wound / fracture healing speed: ×1 untrained, ×1.8 at 10. */
export const firstAidHealMul = (level: number) => 1 + 0.08 * level;
/** Board-up time: ×1.25 untrained, ×0.55 at 10. */
export const barricadeTimeMul = (level: number) => 1.25 - 0.07 * level;
/** Condition restored by one repair (duct tape / thread): 15 % untrained, 50 % at 10. */
export const repairAmount = (level: number) => 0.15 + 0.035 * level;
