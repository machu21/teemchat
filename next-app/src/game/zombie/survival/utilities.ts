import type { StructureKind } from './structures';
import type { ItemDefId } from './types';
import type { Season, Weather } from './world';
import {
  ANIMALS,
  ANIMAL_IDS,
  BAIT_ITEMS,
  CROPS,
  CROP_IDS,
  STAGE_LABEL,
  applyPlot,
  applyTrap,
  emptyPlot,
  emptyTrap,
  harvestYield,
  stageOf,
  tickPlot,
  tickTrap,
} from './food';
import type { IconName } from '@/lib/icons';

// ============================================================
// ZOMBIE MODE — UTILITIES (pure)
// Things that need power, water or fire:
//   * map fixtures (from the city plan): kitchen taps, toilets, stoves,
//     fuel pumps. Taps, stoves and pumps work while the mains are on
//     (world.ts) or near a running generator; toilets hold a little
//     (tainted) water in the tank.
//   * player-built utilities with state, synced in the built-structure
//     list: generators (fuel, on/off, condition), rain collectors (water)
//     and campfires (burn time).
// The host owns built-utility state; fixtures are read-only map data.
// ============================================================

export type FixtureKind = 'tap' | 'toilet' | 'stove' | 'pump' | 'fountain';

export interface WorldFixture {
  kind: FixtureKind;
  /** Box, world px. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export const FIXTURE_INFO: Record<FixtureKind, { label: string; icon: IconName }> = {
  tap: { label: 'Kitchen Tap', icon: 'tap' },
  toilet: { label: 'Toilet', icon: 'toilet' },
  stove: { label: 'Stove', icon: 'cookingPot' },
  pump: { label: 'Fuel Pump', icon: 'fuel' },
  fountain: { label: 'Fountain', icon: 'droplets' },
};

/** px from the feet to a fixture's edge to use it. */
export const FIXTURE_REACH = 26;
/** A stove or campfire within this many px lets you cook. */
export const HEAT_REACH = 40;
/** Bottles a toilet tank fills (per player: tanks aren't synced). */
export const TOILET_FILLS = 3;

export const GENERATOR = {
  /** Powers stoves, fuel pumps, street lamps, alarms and indoor heating within this many tiles. */
  radiusTiles: 12,
  maxFuel: 100,
  /** Fuel burned per game hour while running (a full tank ≈ a day). */
  fuelPerHour: 4,
  /** A full gas can adds this much. */
  canFuel: 60,
  /** Condition lost per game hour running; at 0 it stops until repaired. */
  wearPerHour: 1,
  /** Condition restored by one repair (electronics scrap); Electrical adds 5 per level. */
  repair: 30,
  /** Loud: a noise of this radius (tiles) every `noiseEvery` seconds while running. */
  noiseRadius: 14,
  noiseEvery: 3,
} as const;

export const COLLECTOR = {
  /** Bottles it holds. */
  capacity: 20,
  /** Bottles per game hour in full rain (snow fills it too). */
  fillPerHour: 3,
} as const;

export const CAMPFIRE = {
  /** Real seconds of burning per plank (one game hour = 150 s). */
  secondsPerPlank: 450,
  /** Lit when built (with the planks it took). */
  startSeconds: 450,
  maxSeconds: 1800,
  /** Light radius at night (tiles) and the warmth within reach. */
  lightTiles: 4,
  warmthTiles: 3,
  /** °C added to the air you feel next to it. */
  warmth: 14,
} as const;

/** The structures that carry state, and how many numbers. */
export type UtilityKind = Extract<StructureKind, 'generator' | 'rain_collector' | 'campfire' | 'farm_plot' | 'snare_trap'>;

export function isUtility(kind: StructureKind): kind is UtilityKind {
  return kind === 'generator' || kind === 'rain_collector' || kind === 'campfire' || kind === 'farm_plot' || kind === 'snare_trap';
}

/**
 * State when built:
 *   generator      [fuel 0–100, on 0|1, condition 0–100]
 *   rain_collector [bottles of water]
 *   campfire       [seconds of burning left]
 *   farm_plot      food.ts PlotState [crop, growth, water, health, hours ripe]
 *   snare_trap     food.ts TrapState [caught animal, baited, Trapping level of the trapper]
 */
export function initialState(kind: UtilityKind, level = 0): number[] {
  if (kind === 'generator') return [0, 0, 100];
  if (kind === 'rain_collector') return [0];
  if (kind === 'farm_plot') return emptyPlot();
  if (kind === 'snare_trap') return emptyTrap(level);
  return [CAMPFIRE.startSeconds];
}

/** Clamps a state received over the wire (bad rows can't break the host's numbers). */
export function sanitizeState(kind: UtilityKind, raw: unknown[]): number[] {
  const n = (i: number, lo: number, hi: number) => {
    const v = raw[i];
    return typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo;
  };
  if (kind === 'generator') return [n(0, 0, GENERATOR.maxFuel), n(1, 0, 1) >= 0.5 ? 1 : 0, n(2, 0, 100)];
  if (kind === 'rain_collector') return [n(0, 0, COLLECTOR.capacity)];
  if (kind === 'farm_plot') {
    const crop = Math.round(typeof raw[0] === 'number' ? raw[0] : -1);
    return [crop >= 0 && crop < CROP_IDS.length ? crop : -1, n(1, 0, 1), n(2, 0, 100), n(3, 0, 100), n(4, 0, 10_000)];
  }
  if (kind === 'snare_trap') {
    const animal = Math.round(typeof raw[0] === 'number' ? raw[0] : -1);
    return [animal >= 0 && animal < ANIMAL_IDS.length ? animal : -1, n(1, 0, 1) >= 0.5 ? 1 : 0, Math.round(n(2, 0, 10))];
  }
  return [n(0, 0, CAMPFIRE.maxSeconds)];
}

/** What goes on the wire (rounded, so small drifts don't resend the structure list). */
export function wireState(kind: UtilityKind, s: number[]): number[] {
  if (kind === 'generator') return [Math.ceil(s[0]), s[1], Math.ceil(s[2])];
  if (kind === 'rain_collector') return [Math.floor(s[0] * 2) / 2];
  if (kind === 'farm_plot') return [s[0], Math.floor(s[1] * 100) / 100, Math.round(s[2]), Math.round(s[3]), Math.floor(s[4])];
  if (kind === 'snare_trap') return s.slice(0, 3);
  // Campfires: only whether and roughly how long it burns
  return [Math.ceil(s[0] / 30) * 30];
}

export function generatorRunning(s: number[]): boolean {
  return s[1] === 1 && s[0] > 0 && s[2] > 0;
}

export interface UtilityTick {
  state: number[];
  /** Something worth telling nearby players. */
  event?: 'outOfFuel' | 'brokeDown' | 'burntOut' | 'full' | 'ripe' | 'withered' | 'caught';
}

/** The weather a plot or trap feels, and the host's dice. */
export interface UtilityEnv {
  season: Season;
  /** °C outdoors. */
  temp: number;
  weather: Weather;
  /** 0–1 random numbers (host only). */
  rng: () => number;
}

const DEFAULT_ENV: UtilityEnv = { season: 'summer', temp: 20, weather: 'clear', rng: () => 1 };

/**
 * Host: advances one utility. `gameHours` passed this frame, `dt` real
 * seconds, `rain` 0–1 falling on it (0 indoors).
 */
export function tickUtility(kind: UtilityKind, s: number[], gameHours: number, dt: number, rain: number, env: UtilityEnv = DEFAULT_ENV): UtilityTick {
  if (kind === 'farm_plot') {
    const next = tickPlot(s, gameHours, { rain, season: env.season, temp: env.temp });
    const was = stageOf(s);
    const now = stageOf(next);
    return { state: next, event: now !== was && now === 'ripe' ? 'ripe' : now !== was && now === 'dead' ? 'withered' : undefined };
  }
  if (kind === 'snare_trap') {
    if (gameHours <= 0) return { state: s };
    const next = tickTrap(s, gameHours, env.weather, env.rng(), env.rng());
    return { state: next, event: next[0] >= 0 && s[0] < 0 ? 'caught' : undefined };
  }
  if (kind === 'generator') {
    if (!generatorRunning(s)) return { state: s };
    const fuel = Math.max(0, s[0] - GENERATOR.fuelPerHour * gameHours);
    const cond = Math.max(0, s[2] - GENERATOR.wearPerHour * gameHours);
    if (fuel <= 0) return { state: [0, 0, cond], event: 'outOfFuel' };
    if (cond <= 0) return { state: [fuel, 0, 0], event: 'brokeDown' };
    return { state: [fuel, 1, cond] };
  }
  if (kind === 'rain_collector') {
    if (rain <= 0 || s[0] >= COLLECTOR.capacity) return { state: s };
    const water = Math.min(COLLECTOR.capacity, s[0] + COLLECTOR.fillPerHour * rain * gameHours);
    return { state: [water], event: water >= COLLECTOR.capacity ? 'full' : undefined };
  }
  if (s[0] <= 0) return { state: s };
  // Rain on an open fire makes it burn down three times as fast
  const left = Math.max(0, s[0] - dt * (1 + 2 * rain));
  return { state: [left], event: left <= 0 ? 'burntOut' : undefined };
}

/** Player actions on a utility (wire index = position; append only). */
export const UTILITY_ACTIONS = ['toggle', 'refuel', 'repair', 'fill', 'stoke', 'plant', 'water', 'harvest', 'clear', 'bait', 'collect'] as const;
export type UtilityAction = (typeof UTILITY_ACTIONS)[number];

/**
 * What an action costs (used up; `alt` items count the same) and gives back on success.
 * Planting spends the chosen seed; harvests and catches come back from the host.
 */
export const ACTION_ITEMS: Record<
  UtilityAction,
  { spend: { def: ItemDefId; qty: number; alt?: ItemDefId[] }[]; tools: ItemDefId[]; gives: { def: ItemDefId; qty: number }[] }
> = {
  toggle: { spend: [], tools: [], gives: [] },
  refuel: { spend: [{ def: 'gas_can_full', qty: 1 }], tools: [], gives: [{ def: 'gas_can', qty: 1 }] },
  repair: { spend: [{ def: 'electronics_scrap', qty: 1 }], tools: ['screwdriver'], gives: [] },
  fill: { spend: [{ def: 'empty_bottle', qty: 1 }], tools: [], gives: [{ def: 'tainted_water', qty: 1 }] },
  stoke: { spend: [{ def: 'planks', qty: 1, alt: ['branch'] }], tools: [], gives: [] },
  plant: { spend: [], tools: [], gives: [] },
  water: { spend: [{ def: 'water_bottle', qty: 1, alt: ['tainted_water'] }], tools: [], gives: [{ def: 'empty_bottle', qty: 1 }] },
  harvest: { spend: [], tools: [], gives: [] },
  clear: { spend: [], tools: [], gives: [] },
  bait: { spend: [{ def: BAIT_ITEMS[0], qty: 1, alt: BAIT_ITEMS.slice(1) }], tools: [], gives: [] },
  collect: { spend: [], tools: [], gives: [] },
};

/** Which actions make sense on a utility right now (the HUD shows these; E does the first). */
export function utilityActions(kind: UtilityKind, s: number[]): UtilityAction[] {
  if (kind === 'generator') {
    const out: UtilityAction[] = [];
    if (s[1] === 1 || (s[0] > 0 && s[2] > 0)) out.push('toggle');
    if (s[0] < GENERATOR.maxFuel - 5) out.push('refuel');
    if (s[2] < 100) out.push('repair');
    return out.length ? out : ['toggle'];
  }
  if (kind === 'rain_collector') return ['fill'];
  if (kind === 'farm_plot') {
    const stage = stageOf(s);
    if (stage === 'empty') return ['plant', 'water'];
    if (stage === 'ripe') return ['harvest', 'water'];
    if (stage === 'rotten' || stage === 'dead') return ['clear'];
    return ['water', 'clear'];
  }
  if (kind === 'snare_trap') return s[0] >= 0 ? ['collect'] : s[1] ? [] : ['bait'];
  return ['stoke'];
}

/**
 * Host: applies an action. Returns the new state (and anything it hands
 * over: a harvest, a catch), or a reason it can't. `level` is the relevant
 * skill (Electrical for repairs, Farming for harvests); `param` the crop to plant.
 */
export function applyUtilityAction(
  kind: UtilityKind,
  s: number[],
  a: UtilityAction,
  level = 0,
  param = 0
): { state: number[]; gives?: { def: ItemDefId; qty: number }[] } | { error: string } {
  if (kind === 'farm_plot') {
    if (a !== 'plant' && a !== 'water' && a !== 'harvest' && a !== 'clear') return { error: "You can't do that" };
    const r = applyPlot(s, a, param);
    if ('error' in r) return r;
    if (a === 'harvest') return { state: r.state, gives: [{ def: CROPS[CROP_IDS[s[0]]].produce, qty: harvestYield(s, level) }] };
    return r;
  }
  if (kind === 'snare_trap') {
    if (a !== 'bait' && a !== 'collect') return { error: "You can't do that" };
    const r = applyTrap(s, a);
    if ('error' in r) return r;
    if (a === 'collect') return { state: r.state, gives: [{ def: ANIMALS[ANIMAL_IDS[s[0]]].item, qty: 1 }] };
    return r;
  }
  const electricalLevel = level;
  if (kind === 'generator') {
    if (a === 'toggle') {
      if (s[1] === 1) return { state: [s[0], 0, s[2]] };
      if (s[0] <= 0) return { error: 'No fuel' };
      if (s[2] <= 0) return { error: 'It needs repairing' };
      return { state: [s[0], 1, s[2]] };
    }
    if (a === 'refuel') {
      if (s[0] >= GENERATOR.maxFuel - 5) return { error: 'The tank is full' };
      return { state: [Math.min(GENERATOR.maxFuel, s[0] + GENERATOR.canFuel), s[1], s[2]] };
    }
    if (a === 'repair') {
      if (s[2] >= 100) return { error: "It doesn't need repairing" };
      return { state: [s[0], s[1], Math.min(100, s[2] + GENERATOR.repair + 5 * electricalLevel)] };
    }
    return { error: "You can't do that" };
  }
  if (kind === 'rain_collector') {
    if (a !== 'fill') return { error: "You can't do that" };
    if (s[0] < 1) return { error: "There's no water in it" };
    return { state: [s[0] - 1] };
  }
  if (a !== 'stoke') return { error: "You can't do that" };
  if (s[0] >= CAMPFIRE.maxSeconds - 60) return { error: 'The fire is big enough' };
  return { state: [Math.min(CAMPFIRE.maxSeconds, s[0] + CAMPFIRE.secondsPerPlank)] };
}

export const ACTION_LABEL: Record<UtilityAction, (kind: UtilityKind, s: number[]) => string> = {
  toggle: (_k, s) => (s[1] === 1 ? 'Turn off' : 'Turn on'),
  refuel: () => 'Refuel',
  repair: () => 'Repair',
  fill: () => 'Fill bottle',
  stoke: (_k, s) => (s[0] > 0 ? 'Add fuel' : 'Relight'),
  plant: () => 'Plant',
  water: () => 'Water',
  harvest: () => 'Harvest',
  clear: () => 'Clear',
  bait: () => 'Bait',
  collect: (_k, s) => `Take the ${ANIMAL_IDS[s[0]] ?? 'catch'}`,
};

/** One line of status for the HUD. */
export function utilityStatus(kind: UtilityKind, s: number[]): string {
  if (kind === 'generator') {
    const run = generatorRunning(s) ? 'Running' : s[0] <= 0 ? 'Out of fuel' : s[2] <= 0 ? 'Broken' : 'Off';
    return `${run} · fuel ${Math.ceil(s[0])}% · condition ${Math.ceil(s[2])}%`;
  }
  if (kind === 'rain_collector') return `${Math.floor(s[0])} / ${COLLECTOR.capacity} bottles of rainwater`;
  if (kind === 'farm_plot') {
    const stage = stageOf(s);
    if (stage === 'empty') return `${STAGE_LABEL.empty} · water ${Math.round(s[2])}%`;
    const crop = CROPS[CROP_IDS[s[0]]];
    const grow = stage === 'ripe' || stage === 'rotten' || stage === 'dead' ? '' : ` ${Math.floor(s[1] * 100)}%`;
    return `${crop.label}: ${STAGE_LABEL[stage]}${grow} · water ${Math.round(s[2])}% · health ${Math.round(s[3])}%`;
  }
  if (kind === 'snare_trap') return s[0] >= 0 ? `Caught a ${ANIMAL_IDS[s[0]]}!` : s[1] ? 'Set and baited' : 'Set, no bait';
  return s[0] > 0 ? `Burning · about ${Math.max(1, Math.round(s[0] / 150))} h left` : 'Burnt out';
}
