import type { ConsumableEffect, ContainerKind, InventoryItem, ItemDefId } from './types';

// ============================================================
// ZOMBIE MODE — FOOD SPOILAGE (pure, deterministic)
// Fresh food goes stale, then rotten. An item's age is never ticked or
// sent over the wire: each perishable stack carries `rot`, its "birth" on
// the aging clock of wherever it is.
//
//   in your bag / on the ground / in a crate: the clock is game hours, so
//     age = hoursNow − rot
//   in a fridge: the clock runs at FRIDGE_RATE while the mains are on and
//     at full speed after the power fails (world.ts powerOffHour), so
//     age = fridgeClock(hoursNow) − rot
//
// Both clocks are functions of the match clock and the world seed, which
// every client already shares, so nobody has to resend rotting food.
// Moving an item between places re-bases `rot` onto the new clock
// (ContainerStore.take / put), keeping its age.
// ============================================================

export interface SpoilSpec {
  /** Game hours it stays fresh. */
  fresh: number;
  /** Game hours until it's rotten. */
  rotten: number;
}

/** Perishable foods. Everything else (cans, chips, drinks, meds) keeps. */
export const SPOIL: Partial<Record<ItemDefId, SpoilSpec>> = {
  apple: { fresh: 96, rotten: 192 },
  bread: { fresh: 60, rotten: 120 },
  raw_meat: { fresh: 18, rotten: 40 },
  cooked_meat: { fresh: 40, rotten: 90 },
  hot_soup: { fresh: 40, rotten: 90 },
  tomato: { fresh: 96, rotten: 192 },
  carrot: { fresh: 240, rotten: 480 },
  potato: { fresh: 480, rotten: 960 },
  cabbage: { fresh: 120, rotten: 240 },
  berries: { fresh: 48, rotten: 96 },
  mushrooms: { fresh: 48, rotten: 96 },
  fish_minnow: { fresh: 24, rotten: 48 },
  fish_perch: { fresh: 24, rotten: 48 },
  fish_carp: { fresh: 24, rotten: 48 },
  fish_catfish: { fresh: 24, rotten: 48 },
  cooked_fish: { fresh: 40, rotten: 90 },
  vegetable_stew: { fresh: 48, rotten: 96 },
  salad: { fresh: 24, rotten: 48 },
  dead_rabbit: { fresh: 24, rotten: 48 },
  dead_squirrel: { fresh: 24, rotten: 48 },
  dead_bird: { fresh: 24, rotten: 48 },
  dead_rat: { fresh: 24, rotten: 48 },
};

/** A powered fridge slows spoilage to this fraction. */
export const FRIDGE_RATE = 0.15;
/** Loot starts its life up to this fraction of the way through `fresh` (seeded per item). */
export const START_AGE_MAX = 0.6;

export type Freshness = 'fresh' | 'stale' | 'rotten';

export const FRESHNESS_LABEL: Record<Freshness, string> = { fresh: 'Fresh', stale: 'Stale', rotten: 'Rotten' };

export function isPerishable(def: ItemDefId): boolean {
  return SPOIL[def] !== undefined;
}

/** Fridge aging clock: slow until the power fails, normal after. */
export function fridgeClock(hours: number, powerOff: number): number {
  return hours <= powerOff ? hours * FRIDGE_RATE : powerOff * FRIDGE_RATE + (hours - powerOff);
}

/** The aging clock reading for a place (bag = 'bag'). */
export function agingClock(where: ContainerKind | 'bag', hours: number, powerOff: number): number {
  return where === 'fridge' ? fridgeClock(hours, powerOff) : hours;
}

/** Hours old on a clock reading (0 when the item doesn't track age). */
export function ageOn(it: Pick<InventoryItem, 'rot'>, clock: number): number {
  return it.rot === undefined ? 0 : Math.max(0, clock - it.rot);
}

export function freshnessOf(def: ItemDefId, age: number): Freshness {
  const s = SPOIL[def];
  if (!s || age < s.fresh) return 'fresh';
  return age < s.rotten ? 'stale' : 'rotten';
}

/** Moves `rot` from one clock to another, keeping the age. */
export function rebase(it: InventoryItem, fromClock: number, toClock: number): InventoryItem {
  if (it.rot === undefined) return it;
  return { ...it, rot: toClock - (fromClock - it.rot) };
}

/**
 * What eating it stale or rotten costs on top of the normal effect:
 * stale food is less filling and unpleasant; rotten food barely feeds you
 * and makes you ill (food poisoning: a slow HP drain).
 */
export function spoilPenalty(effect: ConsumableEffect, freshness: Freshness): ConsumableEffect | null {
  if (freshness === 'fresh') return null;
  const hunger = effect.hunger ?? 0;
  if (freshness === 'stale') return { hunger: -Math.round(hunger * 0.3), unhappiness: 6 };
  return {
    hunger: -Math.round(hunger * 0.7),
    unhappiness: 18,
    stress: 5,
    effects: [{ kind: 'poison', remaining: 60, magnitude: 0.18, source: 'food_poisoning' }],
  };
}

/** Same food, same age (to the hour): stacks of perishables only merge when this holds. */
export function sameBatch(a: Pick<InventoryItem, 'def' | 'rot'>, b: Pick<InventoryItem, 'def' | 'rot'>): boolean {
  if (a.def !== b.def) return false;
  if (a.rot === undefined || b.rot === undefined) return a.rot === b.rot;
  return Math.abs(a.rot - b.rot) < 1;
}
