import type { DifficultyCoefficients, SpecialZombieType } from './types';

// ============================================================
// ZOMBIE MODE — DIFFICULTY CURVE (pure, deterministic)
// Everything is a function of match seconds only, so the host and every
// client compute identical coefficients from the shared start time
// without syncing them.
// ============================================================

export const DIFFICULTY = {
  /** Seconds per difficulty level. */
  levelSeconds: 180,
  maxLevel: 10,
  baseSpawnInterval: 30,
  minSpawnInterval: 8,
  /** Match second each special starts appearing. */
  unlock: { charger: 240, bloater: 120, dreadnought: 900 } as Record<SpecialZombieType, number>,
  /** Chance per spawn at full ramp (level 10). */
  maxChance: { charger: 0.08, bloater: 0.12, dreadnought: 0.01 } as Record<SpecialZombieType, number>,
  /** Seconds from unlock to full chance. */
  rampSeconds: 900,
} as const;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Continuous level in [0, maxLevel]; smooth so coefficients don't jump at boundaries. */
export function difficultyLevel(elapsedSeconds: number): number {
  return Math.min(DIFFICULTY.maxLevel, Math.max(0, elapsedSeconds) / DIFFICULTY.levelSeconds);
}

export function difficultyAt(elapsedSeconds: number): DifficultyCoefficients {
  const level = difficultyLevel(elapsedSeconds);
  const t = level / DIFFICULTY.maxLevel; // 0..1
  const specialChance = {} as Record<SpecialZombieType, number>;
  for (const kind of Object.keys(DIFFICULTY.unlock) as SpecialZombieType[]) {
    const ramp = clamp01((elapsedSeconds - DIFFICULTY.unlock[kind]) / DIFFICULTY.rampSeconds);
    specialChance[kind] = elapsedSeconds < DIFFICULTY.unlock[kind] ? 0 : DIFFICULTY.maxChance[kind] * (0.25 + 0.75 * ramp);
  }
  return {
    level,
    spawnIntervalSeconds: DIFFICULTY.baseSpawnInterval - (DIFFICULTY.baseSpawnInterval - DIFFICULTY.minSpawnInterval) * t,
    populationMul: 1 + 1.5 * t,
    aggroMul: 1 + 0.6 * t,
    speedMul: 1 + 0.35 * t,
    specialChance,
    lootMul: 1 - 0.6 * t,
    decayMul: 1 + 0.5 * t,
  };
}

/**
 * Picks the kind for one spawn from a uniform roll in [0, 1).
 * Rarest first so a single roll can't starve the dreadnought.
 */
export function rollZombieKind(d: DifficultyCoefficients, roll: number): 'walker' | SpecialZombieType {
  let acc = 0;
  for (const kind of ['dreadnought', 'charger', 'bloater'] as const) {
    acc += d.specialChance[kind];
    if (roll < acc) return kind;
  }
  return 'walker';
}

/**
 * Fixed-step accumulator: feeds variable RAF frame times into a
 * deterministic fixed `step` (default 50 ms = 20 Hz sim). Caps catch-up so a
 * backgrounded tab doesn't run thousands of steps when it wakes.
 */
export class FixedStep {
  private acc = 0;
  constructor(
    readonly step = 0.05,
    private maxSteps = 10
  ) {}

  /** Returns how many fixed steps to run for this frame. */
  advance(frameSeconds: number): number {
    this.acc += Math.max(0, frameSeconds);
    let n = Math.floor(this.acc / this.step);
    if (n > this.maxSteps) {
      n = this.maxSteps;
      this.acc = 0;
    } else {
      this.acc -= n * this.step;
    }
    return n;
  }

  /** 0..1 progress into the next step, for render interpolation. */
  get alpha(): number {
    return this.acc / this.step;
  }
}
