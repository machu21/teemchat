import type { Moodle } from './condition';

// ============================================================
// ZOMBIE MODE — BODY DAMAGE & INFECTION (pure, deterministic)
// Eleven body parts, each able to carry wounds (scratch, laceration,
// bite) and a fracture. Wounds bleed until bandaged, hurt, heal over
// time and can fester if not disinfected. A zombie wound may carry the
// infection, which has no cure: it hides for a while, then makes you
// sick, then kills you.
//
//   injure(b, roll, source) → a new wound / fracture from a hit
//   tickBody(b, ctx)        → bleeding, pain, healing, infection, modifiers
//   treat(b, kind)          → bandage / disinfect / splint / painkillers
//
// Local to the owning player (like vitals). `roll` is any [0, 1) source,
// so the host, a client or a test can drive it.
// ============================================================

export type BodyPart =
  | 'head'
  | 'neck'
  | 'torso'
  | 'leftArm'
  | 'rightArm'
  | 'leftHand'
  | 'rightHand'
  | 'leftLeg'
  | 'rightLeg'
  | 'leftFoot'
  | 'rightFoot';

export const BODY_PARTS: readonly BodyPart[] = [
  'head',
  'neck',
  'torso',
  'leftArm',
  'rightArm',
  'leftHand',
  'rightHand',
  'leftLeg',
  'rightLeg',
  'leftFoot',
  'rightFoot',
];

type Limb = 'head' | 'core' | 'arm' | 'leg';

/**
 * hitWeight: how often a zombie attack lands there (they grab at arms and hands).
 * damageMul: how much a hit there hurts compared to the base bite.
 */
export const PART_INFO: Record<BodyPart, { label: string; limb: Limb; hitWeight: number; damageMul: number }> = {
  head: { label: 'Head', limb: 'head', hitWeight: 4, damageMul: 1.5 },
  neck: { label: 'Neck', limb: 'head', hitWeight: 3, damageMul: 1.6 },
  torso: { label: 'Torso', limb: 'core', hitWeight: 18, damageMul: 1 },
  leftArm: { label: 'Left arm', limb: 'arm', hitWeight: 16, damageMul: 0.8 },
  rightArm: { label: 'Right arm', limb: 'arm', hitWeight: 16, damageMul: 0.8 },
  leftHand: { label: 'Left hand', limb: 'arm', hitWeight: 13, damageMul: 0.6 },
  rightHand: { label: 'Right hand', limb: 'arm', hitWeight: 13, damageMul: 0.6 },
  leftLeg: { label: 'Left leg', limb: 'leg', hitWeight: 7, damageMul: 0.9 },
  rightLeg: { label: 'Right leg', limb: 'leg', hitWeight: 7, damageMul: 0.9 },
  leftFoot: { label: 'Left foot', limb: 'leg', hitWeight: 2, damageMul: 0.6 },
  rightFoot: { label: 'Right foot', limb: 'leg', hitWeight: 2, damageMul: 0.6 },
};

export type WoundKind = 'scratch' | 'laceration' | 'bite';

export interface Wound {
  id: number;
  part: BodyPart;
  kind: WoundKind;
  bleeding: boolean;
  bandaged: boolean;
  /** Personal seconds since the bandage went on (dirty after BODY.bandageDirtySeconds). */
  bandageAge: number;
  disinfected: boolean;
  /** Wound infection (festering, not the zombie infection) 0–1: stops healing and hurts. */
  sepsis: number;
  /** Personal seconds since the wound was made. */
  age: number;
  /** Personal seconds of healing left. */
  healLeft: number;
}

export interface Fracture {
  part: BodyPart;
  splinted: boolean;
  healLeft: number;
}

export interface BodyState {
  wounds: Wound[];
  fractures: Fracture[];
  /** Personal seconds of painkillers left. */
  painkiller: number;
  /** The zombie infection: null = clean. `progress` 0–1, 1 = death. */
  infection: { progress: number } | null;
  nextId: number;
}

export const BODY = {
  /** What a zombie hit leaves (must sum to 1). */
  outcome: { scratch: 0.6, laceration: 0.3, bite: 0.1 } as Record<WoundKind, number>,
  /** Chance the wound carries the infection. */
  infectChance: { scratch: 0.03, laceration: 0.1, bite: 0.6 } as Record<WoundKind, number>,
  /** HP per personal second while bleeding. */
  bleedRate: { scratch: 0.05, laceration: 0.18, bite: 0.25 } as Record<WoundKind, number>,
  /** Scratches stop bleeding on their own after this long. */
  scratchClotSeconds: 25,
  healSeconds: { scratch: 150, laceration: 420, bite: 600 } as Record<WoundKind, number>,
  /** Healing speed of a deep wound left unbandaged. */
  unbandagedHealMul: 0.25,
  pain: { scratch: 6, laceration: 14, bite: 22 } as Record<WoundKind, number>,
  fracturePain: 30,
  splintedPainMul: 0.6,
  bandageDirtySeconds: 180,
  /** Sepsis per personal second for an undisinfected laceration or bite (×2 under a dirty bandage). */
  sepsisRate: 0.0015,
  sepsisPain: 15,
  /** Sepsis above this stops the wound healing. */
  sepsisStopsHealing: 0.5,
  /** Charger impacts: chance of breaking an arm or leg. */
  impactFractureChance: 0.35,
  fractureSeconds: 900,
  unsplintedHealMul: 0.3,
  painkillerSeconds: 150,
  painkillerMul: 0.3,
  /** Personal seconds from infection to death (≈40 real minutes awake). */
  infectionSeconds: 2400,
  /** Progress where each stage starts: queasy, feverish, terminal. */
  stages: { queasy: 0.35, feverish: 0.6, terminal: 0.85 },
  /** HP per personal second at the very end of the terminal stage. */
  terminalDrain: 0.25,
} as const;

export type InfectionStage = 'none' | 'incubating' | 'queasy' | 'feverish' | 'terminal';

export function freshBody(): BodyState {
  return { wounds: [], fractures: [], painkiller: 0, infection: null, nextId: 1 };
}

export function infectionStage(b: BodyState): InfectionStage {
  const p = b.infection?.progress;
  if (p === undefined) return 'none';
  if (p >= BODY.stages.terminal) return 'terminal';
  if (p >= BODY.stages.feverish) return 'feverish';
  if (p >= BODY.stages.queasy) return 'queasy';
  return 'incubating';
}

function pickWeighted<T extends string>(table: Record<T, number>, r: number): T {
  const keys = Object.keys(table) as T[];
  const total = keys.reduce((s, k) => s + table[k], 0);
  let acc = 0;
  for (const k of keys) {
    acc += table[k] / total;
    if (r < acc) return k;
  }
  return keys[keys.length - 1];
}

const HIT_WEIGHTS = Object.fromEntries(BODY_PARTS.map((p) => [p, PART_INFO[p].hitWeight])) as Record<BodyPart, number>;

export interface InjuryResult {
  body: BodyState;
  part: BodyPart;
  /** Multiplier on the incoming damage for where it landed. */
  damageMul: number;
  wound: Wound | null;
  fracture: Fracture | null;
  /** This hit gave you the infection (you won't be told). */
  infected: boolean;
  /** Clothing on that part turned the hit: no wound, less damage. */
  blocked: boolean;
}

/** Share of the damage that still gets through when clothing turns a hit. */
export const BLOCKED_DAMAGE_MUL = 0.4;

/**
 * A hit lands somewhere on the body. `zombie`: a scratch, laceration or bite
 * that may carry the infection. `impact` (a charger slam): maybe a broken limb.
 */
export function injure(
  b: BodyState,
  roll: () => number,
  source: 'zombie' | 'impact',
  /** 0–1 chance per part that worn clothing stops a zombie hit becoming a wound. */
  protection: Partial<Record<BodyPart, number>> = {},
  /** Multiplier on the chance a wound carries the infection (Prone to Illness). */
  infectMul = 1
): InjuryResult {
  if (source === 'impact') {
    const limbs = BODY_PARTS.filter((p) => PART_INFO[p].limb === 'arm' || PART_INFO[p].limb === 'leg').filter((p) => !p.endsWith('Hand') && !p.endsWith('Foot'));
    const part = limbs[Math.floor(roll() * limbs.length)];
    if (roll() >= BODY.impactFractureChance || b.fractures.some((f) => f.part === part)) {
      return { body: b, part, damageMul: 1, wound: null, fracture: null, infected: false, blocked: false };
    }
    const fracture: Fracture = { part, splinted: false, healLeft: BODY.fractureSeconds };
    return { body: { ...b, fractures: [...b.fractures, fracture] }, part, damageMul: 1, wound: null, fracture, infected: false, blocked: false };
  }
  const part = pickWeighted(HIT_WEIGHTS, roll());
  // Clothing only rolls when it covers the part, so bare-skin hits keep the same sequence
  const guard = protection[part] ?? 0;
  if (guard > 0 && roll() < guard) {
    return { body: b, part, damageMul: PART_INFO[part].damageMul * BLOCKED_DAMAGE_MUL, wound: null, fracture: null, infected: false, blocked: true };
  }
  const kind = pickWeighted(BODY.outcome, roll());
  const wound: Wound = {
    id: b.nextId,
    part,
    kind,
    bleeding: true,
    bandaged: false,
    bandageAge: 0,
    disinfected: false,
    sepsis: 0,
    age: 0,
    healLeft: BODY.healSeconds[kind],
  };
  const infected = !b.infection && roll() < Math.min(1, BODY.infectChance[kind] * infectMul);
  return {
    body: { ...b, wounds: [...b.wounds, wound], nextId: b.nextId + 1, infection: infected ? { progress: 0 } : b.infection },
    part,
    damageMul: PART_INFO[part].damageMul,
    wound,
    fracture: null,
    infected,
    blocked: false,
  };
}

// ---------------------------------------------------------------- tick

export interface BodyMods {
  speedMul: number;
  staminaRegenMul: number;
  /** Melee damage multiplier (broken arm, pain). */
  meleeMul: number;
  /** Gun spread multiplier (pain, broken arm). */
  spreadMul: number;
  canSprint: boolean;
  canJump: boolean;
  /** False while bleeding or feverish: no passive healing. */
  canRegen: boolean;
}

export interface BodyResult {
  body: BodyState;
  /** HP lost this frame (bleeding + infection). */
  damage: number;
  /** 0–100 after painkillers. */
  pain: number;
  stage: InfectionStage;
  mods: BodyMods;
  /** Wounds that finished healing this frame. */
  healed: Wound[];
}

const isLeg = (p: BodyPart) => PART_INFO[p].limb === 'leg';
const isArm = (p: BodyPart) => PART_INFO[p].limb === 'arm';

export function bodyPain(b: BodyState): number {
  let pain = 0;
  for (const w of b.wounds) {
    // Pain fades as the wound heals
    const healed = 1 - w.healLeft / BODY.healSeconds[w.kind];
    pain += BODY.pain[w.kind] * (1 - 0.5 * healed) + w.sepsis * BODY.sepsisPain;
  }
  for (const f of b.fractures) pain += BODY.fracturePain * (f.splinted ? BODY.splintedPainMul : 1);
  if (b.painkiller > 0) pain *= BODY.painkillerMul;
  return Math.min(100, pain);
}

/** `dt` real seconds × `timeScale` (fast-forward while asleep) = personal seconds. */
export function tickBody(b: BodyState, ctx: { dt: number; timeScale: number; healMul?: number }): BodyResult {
  // Never run backwards (a bad frame time would un-bleed wounds and refill painkillers)
  const s = Math.max(0, ctx.dt * ctx.timeScale);
  // Healing speed (First Aid skill × Fast / Slow Healer); bleeding and the infection run at their own pace
  const heal = Math.max(0, ctx.healMul ?? 1);
  let damage = 0;
  const healed: Wound[] = [];
  const wounds: Wound[] = [];
  for (const w0 of b.wounds) {
    const w = { ...w0, age: w0.age + s };
    if (w.bleeding && !w.bandaged) {
      damage += BODY.bleedRate[w.kind] * s;
      if (w.kind === 'scratch' && w.age >= BODY.scratchClotSeconds) w.bleeding = false;
    }
    const dirty = w.bandaged && w.bandageAge >= BODY.bandageDirtySeconds;
    if (w.bandaged) w.bandageAge += s;
    if (w.kind !== 'scratch' && !w.disinfected) w.sepsis = Math.min(1, w.sepsis + BODY.sepsisRate * (dirty ? 2 : 1) * s);
    const healRate = w.sepsis >= BODY.sepsisStopsHealing ? 0 : w.bandaged || w.kind === 'scratch' ? 1 : BODY.unbandagedHealMul;
    w.healLeft -= healRate * heal * s;
    if (w.healLeft <= 0) healed.push(w);
    else wounds.push(w);
  }
  const fractures: Fracture[] = [];
  for (const f of b.fractures) {
    const healLeft = f.healLeft - s * heal * (f.splinted ? 1 : BODY.unsplintedHealMul);
    if (healLeft > 0) fractures.push({ ...f, healLeft });
  }
  let infection = b.infection;
  if (infection) {
    infection = { progress: Math.min(1, infection.progress + s / BODY.infectionSeconds) };
    if (infection.progress >= BODY.stages.terminal) {
      // Accelerates towards the end; at 1.0 the body gives out
      const t = (infection.progress - BODY.stages.terminal) / (1 - BODY.stages.terminal);
      damage += (BODY.terminalDrain * (0.2 + t) + (infection.progress >= 1 ? 50 : 0)) * s;
    }
  }
  const body: BodyState = { ...b, wounds, fractures, infection, painkiller: Math.max(0, b.painkiller - s) };
  const stage = infectionStage(body);
  const pain = bodyPain(body);

  const mods: BodyMods = { speedMul: 1, staminaRegenMul: 1, meleeMul: 1, spreadMul: 1, canSprint: true, canJump: true, canRegen: true };
  for (const f of fractures) {
    if (isLeg(f.part)) {
      mods.speedMul *= f.splinted ? 0.8 : 0.6;
      mods.canJump = false;
      if (!f.splinted) mods.canSprint = false;
    } else if (isArm(f.part)) {
      mods.meleeMul *= f.splinted ? 0.75 : 0.5;
      mods.spreadMul *= 1.4;
    }
  }
  if (pain > 30) {
    mods.staminaRegenMul *= 0.85;
    mods.spreadMul *= 1 + pain / 200;
  }
  if (pain > 60) {
    mods.speedMul *= 0.9;
    mods.meleeMul *= 0.85;
  }
  if (stage === 'queasy') mods.staminaRegenMul *= 0.9;
  if (stage === 'feverish' || stage === 'terminal') {
    mods.staminaRegenMul *= 0.7;
    mods.speedMul *= 0.92;
    mods.canRegen = false;
  }
  if (wounds.some((w) => w.bleeding && !w.bandaged)) mods.canRegen = false;

  return { body, damage, pain, stage, mods, healed };
}

// ---------------------------------------------------------------- treatment

export type Treatment = 'bandage' | 'disinfect' | 'splint' | 'painkiller';

const WOUND_PRIORITY: Record<WoundKind, number> = { bite: 3, laceration: 2, scratch: 1 };

/** The wound a bandage would go on: bleeding first, then the worst unbandaged or dirty one. */
export function bandageTarget(b: BodyState): Wound | null {
  let best: Wound | null = null;
  let bestScore = 0;
  for (const w of b.wounds) {
    const dirty = w.bandaged && w.bandageAge >= BODY.bandageDirtySeconds;
    if (w.bandaged && !dirty) continue;
    const score = (w.bleeding ? 10 : 0) + WOUND_PRIORITY[w.kind] + (dirty ? 0.5 : 0);
    if (score > bestScore) {
      best = w;
      bestScore = score;
    }
  }
  return best;
}

/** Whether a treatment would do anything right now. */
export function canTreat(b: BodyState, t: Treatment): boolean {
  switch (t) {
    case 'bandage':
      return bandageTarget(b) !== null;
    case 'disinfect':
      return b.wounds.some((w) => !w.disinfected || w.sepsis > 0);
    case 'splint':
      return b.fractures.some((f) => !f.splinted);
    case 'painkiller':
      return true;
  }
}

/** Applies one treatment. Returns the body unchanged (and `part: null`) when there's nothing to treat. */
export function treat(b: BodyState, t: Treatment): { body: BodyState; part: BodyPart | null } {
  switch (t) {
    case 'bandage': {
      const target = bandageTarget(b);
      if (!target) return { body: b, part: null };
      return {
        body: { ...b, wounds: b.wounds.map((w) => (w.id === target.id ? { ...w, bandaged: true, bleeding: false, bandageAge: 0 } : w)) },
        part: target.part,
      };
    }
    case 'disinfect': {
      if (!canTreat(b, 'disinfect')) return { body: b, part: null };
      return { body: { ...b, wounds: b.wounds.map((w) => ({ ...w, disinfected: true, sepsis: 0 })) }, part: b.wounds[0].part };
    }
    case 'splint': {
      const f = b.fractures.find((x) => !x.splinted);
      if (!f) return { body: b, part: null };
      return { body: { ...b, fractures: b.fractures.map((x) => (x === f ? { ...x, splinted: true } : x)) }, part: f.part };
    }
    case 'painkiller':
      return { body: { ...b, painkiller: BODY.painkillerSeconds }, part: null };
  }
}

// ---------------------------------------------------------------- moodles

/** Bleeding, pain, broken bones and (once it shows) sickness. */
export function bodyMoodles(b: BodyState, pain: number): Moodle[] {
  const out: Moodle[] = [];
  let bleed = 0;
  for (const w of b.wounds) if (w.bleeding && !w.bandaged) bleed += WOUND_PRIORITY[w.kind];
  if (bleed > 0) out.push({ id: 'bleeding', level: bleed >= 6 ? 4 : bleed >= 4 ? 3 : bleed >= 2 ? 2 : 1 });
  const stage = infectionStage(b);
  if (stage === 'queasy') out.push({ id: 'sick', level: 1 });
  else if (stage === 'feverish') out.push({ id: 'sick', level: (b.infection?.progress ?? 0) >= 0.72 ? 3 : 2 });
  else if (stage === 'terminal') out.push({ id: 'sick', level: 4 });
  if (b.fractures.length) out.push({ id: 'fracture', level: b.fractures.some((f) => !f.splinted) ? 3 : 1 });
  const p = pain >= 80 ? 4 : pain >= 55 ? 3 : pain >= 30 ? 2 : pain >= 10 ? 1 : 0;
  if (p) out.push({ id: 'pain', level: p });
  return out;
}

/** A short label for one wound ("Laceration · bandaged"). */
export function woundLabel(w: Wound): string {
  const kind = w.kind === 'scratch' ? 'Scratch' : w.kind === 'laceration' ? 'Laceration' : 'Bite';
  const dirty = w.bandaged && w.bandageAge >= BODY.bandageDirtySeconds;
  const state = w.bleeding && !w.bandaged ? 'bleeding' : dirty ? 'dirty bandage' : w.bandaged ? 'bandaged' : 'open';
  return `${kind} · ${state}${w.sepsis >= 0.3 ? ' · festering' : ''}`;
}
