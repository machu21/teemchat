import type { Season, Weather } from './world';
import type { ItemDefId } from './types';
import type { IconName } from '@/lib/icons';

// ============================================================
// ZOMBIE MODE — FOOD PRODUCTION (pure)
// Farming (plots, crops, water, health, growth stages, harvest),
// trapping (snares that catch small animals over time), fishing (casting
// at water with a rod and bait) and foraging (searching grass and park
// land). Farm plots and traps are built structures whose state syncs with
// the structure list (like generators); fishing and foraging are personal
// and run on the player's own client.
// Time is in game hours (world.ts: one real hour is one game day).
// ============================================================

// ---------------------------------------------------------------- farming

export type CropId = 'tomato' | 'carrot' | 'potato' | 'cabbage';
/** Wire order (plot state[0]). Append only. */
export const CROP_IDS: readonly CropId[] = ['tomato', 'carrot', 'potato', 'cabbage'];

export interface CropSpec {
  label: string;
  icon: IconName;
  seed: ItemDefId;
  produce: ItemDefId;
  /** Game hours from seed to ripe (at full health, in season). */
  growHours: number;
  /** Produce per harvest at full health and Farming 0. */
  yield: number;
  /** Seasons it grows well in (others: slowly; winter: barely). */
  seasons: readonly Season[];
}

export const CROPS: Record<CropId, CropSpec> = {
  tomato: { label: 'Tomatoes', icon: 'tomato', seed: 'tomato_seeds', produce: 'tomato', growHours: 72, yield: 4, seasons: ['summer'] },
  carrot: { label: 'Carrots', icon: 'carrot', seed: 'carrot_seeds', produce: 'carrot', growHours: 60, yield: 4, seasons: ['spring', 'summer', 'autumn'] },
  potato: { label: 'Potatoes', icon: 'potato', seed: 'potato_seeds', produce: 'potato', growHours: 84, yield: 5, seasons: ['spring', 'summer'] },
  cabbage: { label: 'Cabbages', icon: 'cabbage', seed: 'cabbage_seeds', produce: 'cabbage', growHours: 54, yield: 2, seasons: ['spring', 'autumn'] },
};

export const FARM = {
  /** Water lost per game hour (dry, sunny); rain tops it up. */
  thirstPerHour: 1.6,
  /** Water gained per game hour in full rain (outdoors). */
  rainPerHour: 12,
  /** One bottle of water poured on. */
  bottleWater: 35,
  /** Health lost per game hour when bone dry (water < 15) or waterlogged (> 95 for long). */
  dryDamage: 2.5,
  soakDamage: 0.6,
  /** Health regained per hour when watered well. */
  recover: 0.8,
  /** Ripe crops rot after this many game hours unharvested. */
  rotAfter: 48,
  /** Growth multipliers: out of season / winter. */
  offSeason: 0.5,
  winter: 0.15,
  /** Frost on winter nights hurts (per game hour below 0 °C). */
  frost: 1.5,
} as const;

export type GrowthStage = 'empty' | 'seedling' | 'young' | 'growing' | 'ripe' | 'rotten' | 'dead';

/**
 * Plot state: [crop index (-1 = empty), growth 0–1 (≥ 1 ripe), water 0–100,
 * health 0–100, hours ripe].
 */
export type PlotState = number[];

export function emptyPlot(): PlotState {
  return [-1, 0, 50, 100, 0];
}

export function stageOf(s: PlotState): GrowthStage {
  if (s[0] < 0) return 'empty';
  if (s[3] <= 0) return 'dead';
  if (s[1] >= 1) return s[4] >= FARM.rotAfter ? 'rotten' : 'ripe';
  return s[1] < 0.2 ? 'seedling' : s[1] < 0.55 ? 'young' : 'growing';
}

export const STAGE_LABEL: Record<GrowthStage, string> = {
  empty: 'Dug and ready',
  seedling: 'Seedlings',
  young: 'Young plants',
  growing: 'Growing',
  ripe: 'Ripe',
  rotten: 'Rotten',
  dead: 'Dead',
};

export interface PlotWeather {
  /** 0–1 rain falling on it. */
  rain: number;
  season: Season;
  /** °C. */
  temp: number;
}

/** Host: grows a plot by `hours` game hours of weather. */
export function tickPlot(s: PlotState, hours: number, w: PlotWeather): PlotState {
  if (hours <= 0) return s;
  const crop = s[0];
  let [, growth, water, health, ripeHours] = s;
  water = Math.max(0, Math.min(100, water + (w.rain > 0 ? FARM.rainPerHour * w.rain : -FARM.thirstPerHour * (w.temp > 22 ? 1.5 : 1)) * hours));
  if (crop < 0 || health <= 0) return [crop, growth, water, health, ripeHours];
  const spec = CROPS[CROP_IDS[crop]];
  if (!spec) return s;
  // Health: thirst, waterlogging and frost hurt; good water heals
  if (water < 15) health -= FARM.dryDamage * hours;
  else if (water > 95) health -= FARM.soakDamage * hours;
  else health += FARM.recover * hours;
  if (w.temp < 0) health -= FARM.frost * hours;
  health = Math.max(0, Math.min(100, health));
  if (growth >= 1) {
    ripeHours += hours;
  } else if (health > 0 && water >= 15) {
    const seasonMul = w.season === 'winter' ? FARM.winter : spec.seasons.includes(w.season) ? 1 : FARM.offSeason;
    growth = Math.min(1, growth + (hours / spec.growHours) * seasonMul * (0.5 + 0.5 * (health / 100)));
  }
  return [crop, growth, water, health, ripeHours];
}

/** How many vegetables a ripe plot gives (health and Farming help). */
export function harvestYield(s: PlotState, farming: number): number {
  const crop = CROP_IDS[s[0]];
  if (!crop || stageOf(s) !== 'ripe') return 0;
  return Math.max(1, Math.round(CROPS[crop].yield * (s[3] / 100) * (1 + 0.1 * farming)));
}

export type PlotAction = 'plant' | 'water' | 'harvest' | 'clear';

export function applyPlot(s: PlotState, a: PlotAction, param = 0): { state: PlotState } | { error: string } {
  const stage = stageOf(s);
  if (a === 'plant') {
    if (stage !== 'empty') return { error: 'Something is already growing here' };
    if (!CROP_IDS[param]) return { error: 'No seeds' };
    return { state: [param, 0, s[2], 100, 0] };
  }
  if (a === 'water') {
    if (s[2] >= 95) return { error: "It's wet enough" };
    return { state: [s[0], s[1], Math.min(100, s[2] + FARM.bottleWater), s[3], s[4]] };
  }
  if (a === 'harvest') {
    if (stage !== 'ripe') return { error: stage === 'empty' ? 'Nothing planted' : 'Not ripe yet' };
    return { state: [-1, 0, s[2], 100, 0] };
  }
  if (stage === 'empty') return { error: 'Nothing to clear' };
  return { state: [-1, 0, s[2], 100, 0] };
}

// ---------------------------------------------------------------- trapping

export type AnimalId = 'rabbit' | 'squirrel' | 'bird' | 'rat';
/** Wire order (trap state[0]). Append only. */
export const ANIMAL_IDS: readonly AnimalId[] = ['rabbit', 'squirrel', 'bird', 'rat'];

export const ANIMALS: Record<AnimalId, { item: ItemDefId; weight: number }> = {
  rabbit: { item: 'dead_rabbit', weight: 3 },
  squirrel: { item: 'dead_squirrel', weight: 3 },
  bird: { item: 'dead_bird', weight: 2 },
  rat: { item: 'dead_rat', weight: 2 },
};

export const TRAP = {
  /** Chance per game hour, unbaited / baited (before Trapping). */
  perHour: 0.03,
  baitedMul: 2.5,
  /** Trapping level adds this much per level (×). */
  skillMul: 0.12,
  /** Weather: animals hide in storms and snow. */
  stormMul: 0.3,
} as const;

/** Trap state: [caught animal index (-1 none), baited 0/1, Trapping level of whoever set it]. */
export type TrapState = number[];

export function emptyTrap(level = 0): TrapState {
  return [-1, 0, level];
}

/** Host: one roll per call; `roll`s are 0–1 random numbers. */
export function tickTrap(s: TrapState, hours: number, weather: Weather, rollCatch: number, rollAnimal: number): TrapState {
  if (s[0] >= 0 || hours <= 0) return s;
  const mul = (s[1] ? TRAP.baitedMul : 1) * (1 + TRAP.skillMul * (s[2] ?? 0)) * (weather === 'storm' || weather === 'snow' ? TRAP.stormMul : 1);
  const p = 1 - Math.pow(1 - Math.min(0.9, TRAP.perHour * mul), hours);
  if (rollCatch >= p) return s;
  const total = ANIMAL_IDS.reduce((t, a) => t + ANIMALS[a].weight, 0);
  let x = rollAnimal * total;
  let pick = 0;
  for (let i = 0; i < ANIMAL_IDS.length; i++) {
    x -= ANIMALS[ANIMAL_IDS[i]].weight;
    if (x < 0) {
      pick = i;
      break;
    }
  }
  // The bait is gone either way
  return [pick, 0, s[2]];
}

export type TrapAction = 'bait' | 'collect';

export function applyTrap(s: TrapState, a: TrapAction): { state: TrapState } | { error: string } {
  if (a === 'bait') {
    if (s[0] >= 0) return { error: 'Empty it first' };
    if (s[1]) return { error: 'Already baited' };
    return { state: [s[0], 1, s[2]] };
  }
  if (s[0] < 0) return { error: 'Nothing caught yet' };
  return { state: [-1, 0, s[2]] };
}

/** Food that works as bait. */
export const BAIT_ITEMS: readonly ItemDefId[] = ['worms', 'berries', 'carrot', 'apple', 'bread', 'cabbage'];

// ---------------------------------------------------------------- fishing

export type FishId = 'minnow' | 'perch' | 'carp' | 'catfish';
export const FISH: Record<FishId, { item: ItemDefId; weight: number; minLevel: number }> = {
  minnow: { item: 'fish_minnow', weight: 5, minLevel: 0 },
  perch: { item: 'fish_perch', weight: 4, minLevel: 0 },
  carp: { item: 'fish_carp', weight: 2, minLevel: 2 },
  catfish: { item: 'fish_catfish', weight: 1, minLevel: 4 },
};

export const FISHING = {
  /** Seconds a cast takes. */
  castSeconds: 6,
  /** Base catch chance per cast; bait, Fishing level, dawn / dusk and rain raise it. */
  base: 0.3,
  bait: 0.2,
  perLevel: 0.04,
  twilight: 0.1,
  rain: 0.08,
  /** Casts a spot can give before it's fished out, and game hours to recover one. */
  stock: 6,
  recoverHours: 8,
  /** A rod can snap on a big catch. */
  snapChance: 0.04,
} as const;

export interface FishingContext {
  level: number;
  baited: boolean;
  /** Daylight 0–1 (dawn and dusk are best). */
  light: number;
  weather: Weather;
  /** Casts left in this spot. */
  stock: number;
}

export function catchChance(c: FishingContext): number {
  if (c.stock <= 0) return 0;
  let p = FISHING.base + (c.baited ? FISHING.bait : 0) + FISHING.perLevel * c.level;
  if (c.light > 0.15 && c.light < 0.7) p += FISHING.twilight;
  if (c.weather === 'rain' || c.weather === 'storm') p += FISHING.rain;
  return Math.min(0.95, p);
}

/** One cast. Rolls are 0–1. */
export function castLine(c: FishingContext, rollCatch: number, rollFish: number): FishId | null {
  if (rollCatch >= catchChance(c)) return null;
  const pool = (Object.keys(FISH) as FishId[]).filter((f) => FISH[f].minLevel <= c.level);
  const total = pool.reduce((t, f) => t + FISH[f].weight, 0);
  let x = rollFish * total;
  for (const f of pool) {
    x -= FISH[f].weight;
    if (x < 0) return f;
  }
  return pool[pool.length - 1];
}

// ---------------------------------------------------------------- foraging

export type ForageGround = 'grass' | 'park' | 'dirt';

export interface ForageEntry {
  def: ItemDefId;
  weight: number;
  min: number;
  max: number;
  /** Only in these seasons. */
  seasons?: readonly Season[];
  /** Foraging level needed to spot it. */
  level?: number;
}

/** What each kind of ground can turn up. */
export const FORAGE_TABLES: Record<ForageGround, ForageEntry[]> = {
  grass: [
    { def: 'worms', weight: 4, min: 1, max: 3 },
    { def: 'branch', weight: 3, min: 1, max: 2 },
    { def: 'stone', weight: 3, min: 1, max: 2 },
    { def: 'berries', weight: 2, min: 1, max: 3, seasons: ['summer', 'autumn'] },
    { def: 'herbs', weight: 2, min: 1, max: 2, seasons: ['spring', 'summer', 'autumn'] },
    { def: 'mushrooms', weight: 1, min: 1, max: 2, seasons: ['autumn', 'spring'], level: 1 },
  ],
  park: [
    { def: 'branch', weight: 5, min: 1, max: 3 },
    { def: 'berries', weight: 3, min: 1, max: 4, seasons: ['summer', 'autumn'] },
    { def: 'mushrooms', weight: 2, min: 1, max: 3, seasons: ['autumn', 'spring'], level: 1 },
    { def: 'herbs', weight: 3, min: 1, max: 2, seasons: ['spring', 'summer', 'autumn'] },
    { def: 'worms', weight: 3, min: 1, max: 3 },
    { def: 'stone', weight: 2, min: 1, max: 2 },
  ],
  dirt: [
    { def: 'stone', weight: 5, min: 1, max: 3 },
    { def: 'worms', weight: 3, min: 1, max: 4 },
    { def: 'branch', weight: 1, min: 1, max: 1 },
  ],
};

export const FORAGE = {
  /** Seconds a search takes. */
  searchSeconds: 4,
  /** Chance to find anything at all (Foraging adds per level; night without a light halves it). */
  base: 0.55,
  perLevel: 0.05,
  dark: 0.5,
  /** A searched patch (FORAGE.cellTiles square) is picked over for this many game hours. */
  cellTiles: 6,
  recoverHours: 24,
  /** Winter: little grows. */
  winterMul: 0.5,
} as const;

export interface ForageContext {
  ground: ForageGround;
  season: Season;
  level: number;
  /** Daylight 0–1 and whether you have a light. */
  light: number;
  flashlight: boolean;
}

export function forageChance(c: ForageContext): number {
  let p = FORAGE.base + FORAGE.perLevel * c.level;
  if (c.light < 0.25 && !c.flashlight) p *= FORAGE.dark;
  if (c.season === 'winter') p *= FORAGE.winterMul;
  return Math.min(0.95, p);
}

/** One search. Rolls are 0–1 random numbers (three of them). */
export function forage(c: ForageContext, rolls: [number, number, number]): { def: ItemDefId; qty: number } | null {
  if (rolls[0] >= forageChance(c)) return null;
  const pool = FORAGE_TABLES[c.ground].filter((e) => (!e.seasons || e.seasons.includes(c.season)) && (e.level ?? 0) <= c.level);
  const total = pool.reduce((t, e) => t + e.weight, 0);
  if (!total) return null;
  let x = rolls[1] * total;
  let e = pool[pool.length - 1];
  for (const p of pool) {
    x -= p.weight;
    if (x < 0) {
      e = p;
      break;
    }
  }
  return { def: e.def, qty: e.min + Math.floor(rolls[2] * (e.max - e.min + 1)) };
}
