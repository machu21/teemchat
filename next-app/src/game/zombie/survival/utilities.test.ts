import { describe, expect, it } from 'vitest';
import {
  CAMPFIRE,
  COLLECTOR,
  GENERATOR,
  applyUtilityAction,
  generatorRunning,
  initialState,
  sanitizeState,
  tickUtility,
  utilityActions,
  wireState,
} from './utilities';
import { RECIPES, recipeStatus, type CraftContext } from './crafting';
import { freshSkills } from './skills';
import type { ItemDefId } from './types';

// Phase 6: generators, rain collectors, campfires, and cooking's need for heat.

const ok = (r: ReturnType<typeof applyUtilityAction>) => {
  if ('error' in r) throw new Error(r.error);
  return r.state;
};

describe('generator', () => {
  it('needs fuel to start, burns it while running, and stops when empty', () => {
    let s = initialState('generator');
    expect(applyUtilityAction('generator', s, 'toggle')).toEqual({ error: 'No fuel' });
    s = ok(applyUtilityAction('generator', s, 'refuel'));
    expect(s[0]).toBe(GENERATOR.canFuel);
    s = ok(applyUtilityAction('generator', s, 'toggle'));
    expect(generatorRunning(s)).toBe(true);
    s = tickUtility('generator', s, 5, 0, 0).state;
    expect(s[0]).toBeCloseTo(GENERATOR.canFuel - 5 * GENERATOR.fuelPerHour);
    expect(s[2]).toBeCloseTo(100 - 5 * GENERATOR.wearPerHour);
    const out = tickUtility('generator', s, 100, 0, 0);
    expect(out.event).toBe('outOfFuel');
    expect(generatorRunning(out.state)).toBe(false);
    // Off: nothing burns
    const off = ok(applyUtilityAction('generator', [50, 0, 80], 'toggle'));
    expect(ok(applyUtilityAction('generator', off, 'toggle'))[1]).toBe(0);
    expect(tickUtility('generator', [50, 0, 80], 10, 0, 0).state).toEqual([50, 0, 80]);
  });

  it('wears out and breaks down; a repair (better with Electrical) brings it back', () => {
    const broke = tickUtility('generator', [90, 1, 2], 5, 0, 0);
    expect(broke.event).toBe('brokeDown');
    expect(applyUtilityAction('generator', broke.state, 'toggle')).toEqual({ error: 'It needs repairing' });
    const novice = ok(applyUtilityAction('generator', broke.state, 'repair', 0));
    const expert = ok(applyUtilityAction('generator', broke.state, 'repair', 6));
    expect(novice[2]).toBe(GENERATOR.repair);
    expect(expert[2]).toBeGreaterThan(novice[2]);
    expect(applyUtilityAction('generator', [50, 0, 100], 'repair')).toEqual({ error: "It doesn't need repairing" });
    expect(applyUtilityAction('generator', [99, 0, 100], 'refuel')).toEqual({ error: 'The tank is full' });
  });

  it('offers the actions that make sense', () => {
    expect(utilityActions('generator', [0, 0, 100])).toEqual(['refuel']);
    expect(utilityActions('generator', [60, 0, 100])).toEqual(['toggle', 'refuel']);
    expect(utilityActions('generator', [60, 1, 50])).toEqual(['toggle', 'refuel', 'repair']);
  });
});

describe('rain collector', () => {
  it('fills only while it rains on it, up to its capacity', () => {
    expect(tickUtility('rain_collector', [0], 3, 0, 0).state).toEqual([0]);
    const one = tickUtility('rain_collector', [0], 1, 0, 1).state;
    expect(one[0]).toBeCloseTo(COLLECTOR.fillPerHour);
    const full = tickUtility('rain_collector', [0], 100, 0, 1);
    expect(full.state[0]).toBe(COLLECTOR.capacity);
    expect(full.event).toBe('full');
    expect(ok(applyUtilityAction('rain_collector', [3], 'fill'))).toEqual([2]);
    expect(applyUtilityAction('rain_collector', [0.5], 'fill')).toEqual({ error: "There's no water in it" });
  });
});

describe('campfire', () => {
  it('burns down, faster in the rain, and takes planks', () => {
    const s = initialState('campfire');
    expect(s[0]).toBe(CAMPFIRE.startSeconds);
    expect(tickUtility('campfire', s, 0, 100, 0).state[0]).toBe(CAMPFIRE.startSeconds - 100);
    expect(tickUtility('campfire', s, 0, 100, 1).state[0]).toBe(CAMPFIRE.startSeconds - 300);
    const out = tickUtility('campfire', [10], 0, 20, 0);
    expect(out).toMatchObject({ state: [0], event: 'burntOut' });
    expect(ok(applyUtilityAction('campfire', [0], 'stoke'))[0]).toBe(CAMPFIRE.secondsPerPlank);
    expect(applyUtilityAction('campfire', [CAMPFIRE.maxSeconds], 'stoke')).toEqual({ error: 'The fire is big enough' });
  });
});

describe('wire state', () => {
  it('clamps junk and rounds so small drifts do not resend', () => {
    expect(sanitizeState('generator', [500, 7, -3])).toEqual([GENERATOR.maxFuel, 1, 0]);
    expect(sanitizeState('rain_collector', ['x'])).toEqual([0]);
    expect(sanitizeState('campfire', [1e9])).toEqual([CAMPFIRE.maxSeconds]);
    expect(wireState('generator', [59.2, 1, 99.1])).toEqual([60, 1, 100]);
    expect(wireState('campfire', [401])).toEqual(wireState('campfire', [419]));
  });
});

describe('cooking needs heat', () => {
  const ctx = (have: Partial<Record<ItemDefId, number>>, nearHeat: boolean): CraftContext => ({
    count: (d) => have[d] ?? 0,
    skills: freshSkills(),
    known: new Set(),
    nearWorkbench: false,
    nearHeat,
  });
  const nameOf = (d: ItemDefId) => d;

  it('boiling water and cooking meat need a working stove or a campfire', () => {
    const cold = recipeStatus(RECIPES.boil_water, ctx({ tainted_water: 1 }, false), nameOf);
    expect(cold.ok).toBe(false);
    expect(cold.missing).toContain('A working stove or campfire');
    expect(recipeStatus(RECIPES.boil_water, ctx({ tainted_water: 1 }, true), nameOf).ok).toBe(true);
    expect(recipeStatus(RECIPES.cook_meat, ctx({ raw_meat: 1 }, true), nameOf).ok).toBe(true);
    // Soup needs Cooking 1
    expect(recipeStatus(RECIPES.make_soup, ctx({ canned_beans: 1, water_bottle: 1 }, true), nameOf).missing).toEqual(['Cooking 1']);
  });

  it('a campfire needs planks and a lighter; a generator needs Electrical and a screwdriver', () => {
    expect(recipeStatus(RECIPES.campfire, ctx({ planks: 2 }, false), nameOf).missing).toEqual(['lighter']);
    expect(recipeStatus(RECIPES.campfire, ctx({ planks: 2, lighter: 1 }, false), nameOf).ok).toBe(true);
    expect(recipeStatus(RECIPES.place_generator, ctx({ generator: 1, screwdriver: 1 }, false), nameOf).missing).toEqual(['Electrical 1']);
  });
});
