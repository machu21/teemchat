import { describe, expect, it } from 'vitest';
import {
  ANIMAL_IDS,
  CROPS,
  CROP_IDS,
  FARM,
  FISH,
  FISHING,
  FORAGE_TABLES,
  applyPlot,
  applyTrap,
  castLine,
  catchChance,
  emptyPlot,
  emptyTrap,
  forage,
  forageChance,
  harvestYield,
  stageOf,
  tickPlot,
  tickTrap,
  type PlotState,
  type PlotWeather,
} from './food';
import { ITEM_DEFS } from './inventory';
import { SPOIL } from './spoilage';

// Phase 7: farming, trapping, fishing and foraging.

const summer = { rain: 0, season: 'summer' as const, temp: 22 };
const plant = (crop: number): PlotState => {
  const r = applyPlot(emptyPlot(), 'plant', crop);
  if ('error' in r) throw new Error(r.error);
  return r.state;
};
/** Grows hour by hour, watering whenever it gets dry. */
const tend = (s: PlotState, hours: number, w: PlotWeather = summer) => {
  for (let h = 0; h < hours; h++) {
    s = tickPlot(s, 1, w);
    if (s[2] < 40) s = (applyPlot(s, 'water') as { state: PlotState }).state;
  }
  return s;
};

describe('farming', () => {
  it('every crop has seeds, produce and a spoil time', () => {
    for (const id of CROP_IDS) {
      const c = CROPS[id];
      expect(ITEM_DEFS[c.seed]).toBeDefined();
      expect(ITEM_DEFS[c.produce].consume).toBeDefined();
      expect(SPOIL[c.produce]).toBeDefined();
    }
  });

  it('a tended crop goes seedling → young → growing → ripe in its time', () => {
    const carrot = CROP_IDS.indexOf('carrot');
    let s = plant(carrot);
    expect(stageOf(s)).toBe('seedling');
    s = tend(s, 20);
    expect(['young', 'growing']).toContain(stageOf(s));
    s = tend(s, CROPS.carrot.growHours);
    expect(stageOf(s)).toBe('ripe');
    expect(harvestYield(s, 0)).toBe(CROPS.carrot.yield);
    expect(harvestYield(s, 5)).toBeGreaterThan(CROPS.carrot.yield);
  });

  it('left dry it stops growing and dies; rain waters it', () => {
    let s = plant(0);
    for (let h = 0; h < 120; h++) s = tickPlot(s, 1, summer);
    expect(stageOf(s)).toBe('dead');
    const rained = tickPlot([0, 0.2, 10, 80, 0], 3, { ...summer, rain: 1 });
    expect(rained[2]).toBeGreaterThan(10 + 2 * FARM.rainPerHour);
  });

  it('winter barely grows anything, and frost hurts', () => {
    const warm = tend(plant(1), 24);
    const cold = tend(plant(1), 24, { rain: 0, season: 'winter', temp: -3 });
    expect(cold[1]).toBeLessThan(warm[1] * 0.3);
    expect(cold[3]).toBeLessThan(warm[3]);
  });

  it('ripe crops rot if nobody harvests them', () => {
    // Cabbages are a spring / autumn crop
    const spring = { rain: 0, season: 'spring' as const, temp: 16 };
    let s = tend(plant(CROP_IDS.indexOf('cabbage')), CROPS.cabbage.growHours + 5, spring);
    expect(stageOf(s)).toBe('ripe');
    s = tend(s, FARM.rotAfter + 1, spring);
    expect(stageOf(s)).toBe('rotten');
    expect(harvestYield(s, 3)).toBe(0);
    expect(applyPlot(s, 'harvest')).toEqual({ error: 'Not ripe yet' });
    const cleared = applyPlot(s, 'clear');
    expect('state' in cleared && cleared.state.slice(0, 2)).toEqual([-1, 0]);
  });

  it("can't plant over a crop or harvest an empty plot", () => {
    expect(applyPlot(plant(0), 'plant', 1)).toEqual({ error: 'Something is already growing here' });
    expect(applyPlot(emptyPlot(), 'harvest')).toEqual({ error: 'Nothing planted' });
  });
});

describe('trapping', () => {
  it('bait raises the odds; a catch is an animal and the bait is gone', () => {
    const baited = (applyTrap(emptyTrap(), 'bait') as { state: number[] }).state;
    expect(baited[1]).toBe(1);
    expect(applyTrap(baited, 'bait')).toEqual({ error: 'Already baited' });
    // Same dice: the baited snare catches where the bare one doesn't
    const roll = 0.1;
    expect(tickTrap(emptyTrap(), 1, 'clear', roll, 0.2)[0]).toBe(-1);
    const caught = tickTrap(baited, 1, 'clear', roll / 2, 0.2);
    expect(caught[0]).toBeGreaterThanOrEqual(0);
    expect(caught[1]).toBe(0);
    expect(ANIMAL_IDS[caught[0]]).toBeDefined();
    expect(applyTrap(caught, 'collect')).toEqual({ state: [-1, 0, 0] });
    expect(applyTrap(emptyTrap(), 'collect')).toEqual({ error: 'Nothing caught yet' });
  });

  it('over a day an unbaited snare usually catches something; storms keep animals in', () => {
    let calm = 0;
    let storm = 0;
    for (let i = 0; i < 200; i++) {
      const r = ((i * 7919) % 1000) / 1000;
      if (tickTrap(emptyTrap(), 24, 'clear', r, 0.5)[0] >= 0) calm++;
      if (tickTrap(emptyTrap(), 24, 'storm', r, 0.5)[0] >= 0) storm++;
    }
    expect(calm).toBeGreaterThan(100);
    expect(storm).toBeLessThan(calm / 2);
  });
});

describe('fishing', () => {
  const ctx = { level: 0, baited: false, light: 1, weather: 'clear' as const, stock: FISHING.stock };

  it('bait, skill, twilight and rain help; a fished-out spot gives nothing', () => {
    const base = catchChance(ctx);
    expect(catchChance({ ...ctx, baited: true })).toBeGreaterThan(base);
    expect(catchChance({ ...ctx, level: 5 })).toBeGreaterThan(base);
    expect(catchChance({ ...ctx, light: 0.4 })).toBeGreaterThan(base);
    expect(catchChance({ ...ctx, weather: 'rain' })).toBeGreaterThan(base);
    expect(catchChance({ ...ctx, stock: 0 })).toBe(0);
    expect(castLine({ ...ctx, stock: 0 }, 0, 0)).toBeNull();
  });

  it('big fish need skill', () => {
    const seen = new Set<string>();
    for (let r = 0; r < 1; r += 0.01) seen.add(castLine(ctx, 0, r)!);
    expect([...seen].sort()).toEqual(['minnow', 'perch']);
    for (let r = 0; r < 1; r += 0.01) seen.add(castLine({ ...ctx, level: FISH.catfish.minLevel }, 0, r)!);
    expect(seen.has('catfish')).toBe(true);
  });
});

describe('foraging', () => {
  const ctx = { ground: 'park' as const, season: 'summer' as const, level: 0, light: 1, flashlight: false };

  it('finds what grows in the season, on that ground', () => {
    const found = new Set<string>();
    for (let r = 0; r < 1; r += 0.02) found.add(forage(ctx, [0, r, 0.5])!.def);
    expect(found.has('berries')).toBe(true);
    expect(found.has('mushrooms')).toBe(false); // autumn / spring, and Foraging 1
    const autumn = new Set<string>();
    for (let r = 0; r < 1; r += 0.02) autumn.add(forage({ ...ctx, season: 'autumn', level: 1 }, [0, r, 0.5])!.def);
    expect(autumn.has('mushrooms')).toBe(true);
    for (const e of FORAGE_TABLES.dirt) expect(ITEM_DEFS[e.def]).toBeDefined();
  });

  it('the dark (without a light) and winter make it harder; skill makes it easier', () => {
    const base = forageChance(ctx);
    expect(forageChance({ ...ctx, light: 0 })).toBeLessThan(base);
    expect(forageChance({ ...ctx, light: 0, flashlight: true })).toBe(base);
    expect(forageChance({ ...ctx, season: 'winter' })).toBeLessThan(base);
    expect(forageChance({ ...ctx, level: 6 })).toBeGreaterThan(base);
    expect(forage(ctx, [0.99, 0, 0])).toBeNull();
  });
});
