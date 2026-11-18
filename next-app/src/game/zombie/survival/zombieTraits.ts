// ============================================================
// ZOMBIE MODE — PER-ZOMBIE TRAITS (pure)
// Every walker rolls five traits at spawn: speed, strength, sight,
// hearing and toughness, each low / normal / high. Most are normal, so
// a horde reads as a crowd of individuals: the odd sprinter, the half-
// blind shambler, the one that hears a pin drop.
// Odds are configurable (difficulty presets later); traits travel on the
// wire packed into one small int so clients dead-reckon sprinters right.
// ============================================================

export type TraitTier = 0 | 1 | 2;

export interface ZombieTraits {
  speed: TraitTier;
  strength: TraitTier;
  sight: TraitTier;
  hearing: TraitTier;
  toughness: TraitTier;
}

export type TraitName = keyof ZombieTraits;
export const TRAIT_NAMES: readonly TraitName[] = ['speed', 'strength', 'sight', 'hearing', 'toughness'];

/** Multiplier per tier [low, normal, high]. */
export const TRAIT_MUL: Record<TraitName, readonly [number, number, number]> = {
  speed: [0.7, 1, 1.55],
  strength: [0.7, 1, 1.4],
  sight: [0.6, 1, 1.4],
  hearing: [0.6, 1, 1.45],
  toughness: [0.7, 1, 1.45],
};

/** Chance of each tier [low, normal, high]. */
export type TraitOdds = Record<TraitName, readonly [number, number, number]>;

export const DEFAULT_TRAIT_ODDS: TraitOdds = {
  speed: [0.3, 0.62, 0.08],
  strength: [0.25, 0.6, 0.15],
  sight: [0.3, 0.55, 0.15],
  hearing: [0.25, 0.6, 0.15],
  toughness: [0.2, 0.65, 0.15],
};

export const NORMAL_TRAITS: ZombieTraits = { speed: 1, strength: 1, sight: 1, hearing: 1, toughness: 1 };

function tier(odds: readonly [number, number, number], r: number): TraitTier {
  const total = odds[0] + odds[1] + odds[2];
  if (r < odds[0] / total) return 0;
  if (r < (odds[0] + odds[1]) / total) return 1;
  return 2;
}

export function rollTraits(rng: () => number, odds: TraitOdds = DEFAULT_TRAIT_ODDS): ZombieTraits {
  return {
    speed: tier(odds.speed, rng()),
    strength: tier(odds.strength, rng()),
    sight: tier(odds.sight, rng()),
    hearing: tier(odds.hearing, rng()),
    toughness: tier(odds.toughness, rng()),
  };
}

export function traitMul(t: ZombieTraits | undefined, name: TraitName): number {
  return t ? TRAIT_MUL[name][t[name]] : 1;
}

/** 2 bits per trait, in TRAIT_NAMES order. 341 (0b0101010101) = all normal. */
export function packTraits(t: ZombieTraits): number {
  let n = 0;
  TRAIT_NAMES.forEach((name, i) => (n |= t[name] << (i * 2)));
  return n;
}

export function unpackTraits(n: number): ZombieTraits {
  const get = (i: number) => Math.min(2, (n >> (i * 2)) & 3) as TraitTier;
  return { speed: get(0), strength: get(1), sight: get(2), hearing: get(3), toughness: get(4) };
}

export const PACKED_NORMAL = packTraits(NORMAL_TRAITS);
