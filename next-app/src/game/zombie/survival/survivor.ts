import { CONDITION } from './condition';
import { SKILL_IDS, freshSkills, type SkillId, type SkillSet } from './skills';
import type { ItemDefId } from './types';
import type { IconName } from '@/lib/icons';

// ============================================================
// ZOMBIE MODE — SURVIVOR BUILD (pure)
// Character creation: an occupation (starting skills, gear and a point
// budget) plus positive traits (cost points) and negative traits (give
// points back). The budget must not go below zero, and opposite traits
// (Strong / Weak…) can't be combined. `survivorModifiers()` folds the
// build into the multipliers the game reads every frame.
// ============================================================

export type OccupationId =
  | 'unemployed'
  | 'fireOfficer'
  | 'policeOfficer'
  | 'veteran'
  | 'carpenter'
  | 'constructionWorker'
  | 'mechanic'
  | 'burglar'
  | 'nurse'
  | 'fitnessInstructor'
  | 'electrician'
  | 'chef'
  | 'farmer';

export type Perk = 'desensitized' | 'hotwire';

export interface OccupationDef {
  label: string;
  icon: IconName;
  /** Starting trait points (can be negative for strong jobs). */
  points: number;
  /** Starting skill levels; fitness / strength are added to the base 5. */
  skills: Partial<Record<SkillId | 'fitness' | 'strength', number>>;
  items: { def: ItemDefId; qty: number }[];
  perks: Perk[];
  description: string;
}

export const OCCUPATIONS: Record<OccupationId, OccupationDef> = {
  unemployed: { label: 'Unemployed', icon: 'user', points: 8, skills: {}, items: [], perks: [], description: 'No head start, but plenty of points for traits.' },
  fireOfficer: { label: 'Fire Officer', icon: 'flame', points: 0, skills: { fitness: 1, strength: 1 }, items: [{ def: 'work_gloves', qty: 1 }], perks: [], description: 'Fitter and stronger than most. Starts with work gloves.' },
  policeOfficer: { label: 'Police Officer', icon: 'police', points: -4, skills: { aiming: 3, reloading: 2 }, items: [], perks: [], description: 'Trained with firearms: steadier aim, quicker reloads.' },
  veteran: { label: 'Veteran', icon: 'shield', points: -8, skills: { aiming: 2, reloading: 2 }, items: [], perks: ['desensitized'], description: 'Seen worse. Never panics, and knows a gun.' },
  carpenter: { label: 'Carpenter', icon: 'hammer', points: 2, skills: { carpentry: 3 }, items: [{ def: 'weapon:hammer', qty: 1 }, { def: 'nails', qty: 20 }], perks: [], description: 'Boards up quickly. Starts with a hammer and nails.' },
  constructionWorker: { label: 'Construction Worker', icon: 'building', points: -2, skills: { carpentry: 1, strength: 1 }, items: [{ def: 'work_gloves', qty: 1 }], perks: [], description: 'Used to heavy work. Starts with work gloves.' },
  mechanic: { label: 'Mechanic', icon: 'wrench', points: -4, skills: { mechanics: 3, maintenance: 1 }, items: [{ def: 'wrench', qty: 1 }], perks: [], description: 'Knows engines and keeps tools in shape. Starts with a wrench.' },
  burglar: { label: 'Burglar', icon: 'lock', points: -6, skills: { maintenance: 1 }, items: [{ def: 'weapon:crowbar', qty: 1 }], perks: ['hotwire'], description: 'Can hotwire cars without keys. Starts with a crowbar.' },
  nurse: { label: 'Nurse', icon: 'hospital', points: 2, skills: { firstAid: 3 }, items: [{ def: 'bandage', qty: 2 }], perks: [], description: 'Patches people up fast. Starts with bandages.' },
  fitnessInstructor: { label: 'Fitness Instructor', icon: 'dumbbell', points: -6, skills: { fitness: 3, firstAid: 1 }, items: [], perks: [], description: 'Superb stamina.' },
  electrician: { label: 'Electrician', icon: 'zap', points: -4, skills: { electrical: 3 }, items: [{ def: 'battery', qty: 2 }], perks: [], description: 'Knows wiring. Starts with batteries.' },
  chef: { label: 'Chef', icon: 'diner', points: -4, skills: { cooking: 3, maintenance: 1 }, items: [{ def: 'weapon:knife', qty: 1 }], perks: [], description: 'A good cook with a sharp knife.' },
  farmer: { label: 'Farmer', icon: 'sprout', points: 2, skills: { farming: 3 }, items: [{ def: 'tomato_seeds', qty: 3 }, { def: 'carrot_seeds', qty: 3 }], perks: [], description: 'Knows the land. Starts with seeds.' },
};

export const OCCUPATION_ORDER: readonly OccupationId[] = Object.keys(OCCUPATIONS) as OccupationId[];

/** What a trait changes. Multipliers default to 1, deltas to 0. */
export interface TraitEffects {
  /** Fitness / strength level change at creation. */
  fitness?: number;
  strength?: number;
  /** All XP. */
  learnMul?: number;
  /** Weapon-skill XP (Aiming, Reloading, Maintenance). */
  combatXpMul?: number;
  hungerMul?: number;
  thirstMul?: number;
  fatigueMul?: number;
  panicMul?: number;
  /** How much the weather moves your body temperature. */
  exposureMul?: number;
  /** Wound and fracture healing speed. */
  healMul?: number;
  /** View radius. */
  visionMul?: number;
  /** Always-aware radius around you (hearing). */
  peripheralMul?: number;
  /** Extra chance (0–1) on every part that a zombie hit leaves no wound. */
  protection?: number;
  /** Damage taken from zombie wounds. */
  woundDamageMul?: number;
  /** Chance a wound carries the infection. */
  infectionMul?: number;
  /** Extra carry capacity (kg). */
  carryKg?: number;
}

export type TraitId =
  | 'strong'
  | 'athletic'
  | 'fastLearner'
  | 'lightEater'
  | 'lowThirst'
  | 'eagleEyed'
  | 'keenHearing'
  | 'thickSkinned'
  | 'fastHealer'
  | 'brave'
  | 'outdoorsman'
  | 'nightOwl'
  | 'organized'
  | 'weak'
  | 'outOfShape'
  | 'slowLearner'
  | 'heartyAppetite'
  | 'highThirst'
  | 'shortSighted'
  | 'hardOfHearing'
  | 'thinSkinned'
  | 'slowHealer'
  | 'cowardly'
  | 'sleepyhead'
  | 'proneToIllness'
  | 'pacifist';

export interface TraitDef {
  label: string;
  /** Points: positive traits cost (> 0), negative traits give points back (< 0). */
  cost: number;
  description: string;
  effects: TraitEffects;
  /** Can't be taken together. */
  excludes?: TraitId[];
}

export const TRAITS: Record<TraitId, TraitDef> = {
  strong: { label: 'Strong', cost: 6, description: 'Strength +3: hits harder, carries more.', effects: { strength: 3 }, excludes: ['weak'] },
  athletic: { label: 'Athletic', cost: 6, description: 'Fitness +3: sprints longer, recovers faster.', effects: { fitness: 3 }, excludes: ['outOfShape'] },
  fastLearner: { label: 'Fast Learner', cost: 6, description: 'All skills learn 30 % faster.', effects: { learnMul: 1.3 }, excludes: ['slowLearner'] },
  lightEater: { label: 'Light Eater', cost: 3, description: 'Gets hungry 25 % slower.', effects: { hungerMul: 0.75 }, excludes: ['heartyAppetite'] },
  lowThirst: { label: 'Low Thirst', cost: 3, description: 'Gets thirsty 25 % slower.', effects: { thirstMul: 0.75 }, excludes: ['highThirst'] },
  eagleEyed: { label: 'Eagle Eyed', cost: 4, description: 'Sees 15 % further.', effects: { visionMul: 1.15 }, excludes: ['shortSighted'] },
  keenHearing: { label: 'Keen Hearing', cost: 4, description: 'Senses zombies all around you from further away.', effects: { peripheralMul: 1.6 }, excludes: ['hardOfHearing'] },
  thickSkinned: { label: 'Thick Skinned', cost: 6, description: 'Hits break the skin less often.', effects: { protection: 0.15 }, excludes: ['thinSkinned'] },
  fastHealer: { label: 'Fast Healer', cost: 5, description: 'Wounds and bones heal 40 % faster.', effects: { healMul: 1.4 }, excludes: ['slowHealer'] },
  brave: { label: 'Brave', cost: 4, description: 'Panics half as easily.', effects: { panicMul: 0.5 }, excludes: ['cowardly'] },
  outdoorsman: { label: 'Outdoorsman', cost: 2, description: 'Cold and heat bother you half as much.', effects: { exposureMul: 0.5 } },
  nightOwl: { label: 'Night Owl', cost: 2, description: 'Tires 20 % slower.', effects: { fatigueMul: 0.8 }, excludes: ['sleepyhead'] },
  organized: { label: 'Organized', cost: 4, description: 'Packs smart: carry 3 kg more.', effects: { carryKg: 3 } },
  weak: { label: 'Weak', cost: -6, description: 'Strength −3.', effects: { strength: -3 }, excludes: ['strong'] },
  outOfShape: { label: 'Out of Shape', cost: -6, description: 'Fitness −3.', effects: { fitness: -3 }, excludes: ['athletic'] },
  slowLearner: { label: 'Slow Learner', cost: -6, description: 'All skills learn 30 % slower.', effects: { learnMul: 0.7 }, excludes: ['fastLearner'] },
  heartyAppetite: { label: 'Hearty Appetite', cost: -3, description: 'Gets hungry 35 % faster.', effects: { hungerMul: 1.35 }, excludes: ['lightEater'] },
  highThirst: { label: 'High Thirst', cost: -3, description: 'Gets thirsty 35 % faster.', effects: { thirstMul: 1.35 }, excludes: ['lowThirst'] },
  shortSighted: { label: 'Short Sighted', cost: -2, description: 'Sees 15 % less far.', effects: { visionMul: 0.85 }, excludes: ['eagleEyed'] },
  hardOfHearing: { label: 'Hard of Hearing', cost: -4, description: 'Only senses zombies very close by.', effects: { peripheralMul: 0.6 }, excludes: ['keenHearing'] },
  thinSkinned: { label: 'Thin Skinned', cost: -6, description: 'Zombie wounds hurt 25 % more.', effects: { woundDamageMul: 1.25 }, excludes: ['thickSkinned'] },
  slowHealer: { label: 'Slow Healer', cost: -4, description: 'Wounds and bones heal 35 % slower.', effects: { healMul: 0.65 }, excludes: ['fastHealer'] },
  cowardly: { label: 'Cowardly', cost: -3, description: 'Panics almost twice as easily.', effects: { panicMul: 1.8 }, excludes: ['brave'] },
  sleepyhead: { label: 'Sleepyhead', cost: -2, description: 'Tires 25 % faster.', effects: { fatigueMul: 1.25 }, excludes: ['nightOwl'] },
  proneToIllness: { label: 'Prone to Illness', cost: -4, description: 'Wounds are 50 % likelier to carry the infection.', effects: { infectionMul: 1.5 } },
  pacifist: { label: 'Pacifist', cost: -4, description: 'Weapon skills learn 25 % slower.', effects: { combatXpMul: 0.75 } },
};

export const TRAIT_ORDER: readonly TraitId[] = Object.keys(TRAITS) as TraitId[];

export interface SurvivorBuild {
  name: string;
  occupation: OccupationId;
  traits: TraitId[];
}

export const DEFAULT_BUILD: SurvivorBuild = { name: 'Survivor', occupation: 'unemployed', traits: [] };
export const NAME_MAX = 24;

/** Points left after traits (must be ≥ 0). */
export function pointsLeft(b: Pick<SurvivorBuild, 'occupation' | 'traits'>): number {
  let p = OCCUPATIONS[b.occupation]?.points ?? 0;
  for (const t of b.traits) p -= TRAITS[t]?.cost ?? 0;
  return p;
}

/** Problems that stop this build from starting (empty = valid). */
export function buildErrors(b: SurvivorBuild): string[] {
  const errors: string[] = [];
  if (!b.name.trim()) errors.push('Give your survivor a name.');
  if (b.name.trim().length > NAME_MAX) errors.push(`Names are at most ${NAME_MAX} characters.`);
  if (!OCCUPATIONS[b.occupation]) errors.push('Pick an occupation.');
  const seen = new Set<TraitId>();
  for (const t of b.traits) {
    if (!TRAITS[t]) errors.push(`Unknown trait: ${t}`);
    else if (seen.has(t)) errors.push(`${TRAITS[t].label} is listed twice.`);
    seen.add(t);
  }
  for (const t of seen) {
    for (const x of TRAITS[t]?.excludes ?? []) {
      if (seen.has(x) && t < x) errors.push(`${TRAITS[t].label} and ${TRAITS[x].label} can't be combined.`);
    }
  }
  if (OCCUPATIONS[b.occupation] && pointsLeft(b) < 0) errors.push('Not enough trait points.');
  return errors;
}

/** Whether adding `t` to the build is allowed right now (for the picker). */
export function canAddTrait(b: SurvivorBuild, t: TraitId): boolean {
  if (b.traits.includes(t)) return false;
  if (TRAITS[t].excludes?.some((x) => b.traits.includes(x))) return false;
  return TRAITS[t].cost <= 0 || pointsLeft({ ...b, traits: [...b.traits, t] }) >= 0;
}

/** Everything the build changes, folded into one set of numbers. */
export interface SurvivorModifiers extends Required<Omit<TraitEffects, 'fitness' | 'strength'>> {
  perks: Perk[];
}

export function survivorModifiers(b: SurvivorBuild): SurvivorModifiers {
  const m: SurvivorModifiers = {
    learnMul: 1,
    combatXpMul: 1,
    hungerMul: 1,
    thirstMul: 1,
    fatigueMul: 1,
    panicMul: 1,
    exposureMul: 1,
    healMul: 1,
    visionMul: 1,
    peripheralMul: 1,
    protection: 0,
    woundDamageMul: 1,
    infectionMul: 1,
    carryKg: 0,
    perks: [...(OCCUPATIONS[b.occupation]?.perks ?? [])],
  };
  for (const t of b.traits) {
    const e = TRAITS[t]?.effects;
    if (!e) continue;
    m.learnMul *= e.learnMul ?? 1;
    m.combatXpMul *= e.combatXpMul ?? 1;
    m.hungerMul *= e.hungerMul ?? 1;
    m.thirstMul *= e.thirstMul ?? 1;
    m.fatigueMul *= e.fatigueMul ?? 1;
    m.panicMul *= e.panicMul ?? 1;
    m.exposureMul *= e.exposureMul ?? 1;
    m.healMul *= e.healMul ?? 1;
    m.visionMul *= e.visionMul ?? 1;
    m.peripheralMul *= e.peripheralMul ?? 1;
    m.protection = 1 - (1 - m.protection) * (1 - (e.protection ?? 0));
    m.woundDamageMul *= e.woundDamageMul ?? 1;
    m.infectionMul *= e.infectionMul ?? 1;
    m.carryKg += e.carryKg ?? 0;
  }
  // Veterans don't panic
  if (m.perks.includes('desensitized')) m.panicMul = 0;
  return m;
}

/** Starting fitness, strength and skills for a build. */
export function startingStats(b: SurvivorBuild): { fitness: number; strength: number; skills: SkillSet } {
  const occ = OCCUPATIONS[b.occupation] ?? OCCUPATIONS.unemployed;
  let fitness = CONDITION.startLevel + (occ.skills.fitness ?? 0);
  let strength = CONDITION.startLevel + (occ.skills.strength ?? 0);
  for (const t of b.traits) {
    fitness += TRAITS[t]?.effects.fitness ?? 0;
    strength += TRAITS[t]?.effects.strength ?? 0;
  }
  const start: Partial<Record<SkillId, number>> = {};
  for (const id of SKILL_IDS) if (occ.skills[id]) start[id] = occ.skills[id];
  const clamp = (v: number) => Math.max(0, Math.min(10, v));
  return { fitness: clamp(fitness), strength: clamp(strength), skills: freshSkills(start) };
}

/** Accepts only well-formed builds (e.g. from storage); returns null otherwise. */
export function parseBuild(raw: unknown): SurvivorBuild | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.name !== 'string' || typeof r.occupation !== 'string' || !Array.isArray(r.traits)) return null;
  const b: SurvivorBuild = {
    name: r.name.slice(0, NAME_MAX),
    occupation: r.occupation as OccupationId,
    traits: r.traits.filter((t): t is TraitId => typeof t === 'string'),
  };
  return buildErrors(b).length ? null : b;
}
