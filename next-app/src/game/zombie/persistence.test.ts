import { describe, expect, it } from 'vitest';
import { WORLD_SAVE_VERSION, pickWorldSave, slotFor, validatePlayerSave, validateWorldSave, type PlayerSave, type WorldSave } from './persistence';
import { SurvivalSaveService, type SaveStore } from '@/lib/services/survivalSave';
import { NORMAL_RULES, PRESETS, RULE_RANGES, applyRules, sanitizeRules, type WorldRules } from './survival/balance';
import { powerOffHour, weatherAt } from './survival/world';
import { HostGuard, REQUEST_LIMITS } from './hostGuard';
import { START_HOUR } from './survival/daycycle';

// Phase 9: save format, slot recovery, the save service, world rules, host rate limits.

const world = (over: Partial<WorldSave> = {}): WorldSave => ({
  v: WORLD_SAVE_VERSION,
  elapsed: 120,
  skip: 30,
  snap: { s: 0, z: [[1, 10, 20, 10, 20, 0, 100, 0]] },
  alarms: [],
  at: 1,
  ...over,
});

describe('world save format', () => {
  it('accepts a good save and rejects junk', () => {
    expect(validateWorldSave(world())).not.toBeNull();
    expect(validateWorldSave(null)).toBeNull();
    expect(validateWorldSave({ ...world(), v: 99 })).toBeNull();
    expect(validateWorldSave({ ...world(), elapsed: 'x' })).toBeNull();
    expect(validateWorldSave({ ...world(), snap: { s: 0, z: [['bad']] } })).toBeNull();
    expect(validateWorldSave({ ...world(), snap: { s: 0, z: [], bs: 'nope' } })).toBeNull();
    // A world running slower than real time has a negative skip
    expect(validateWorldSave(world({ skip: -40 }))).not.toBeNull();
  });

  it('two slots alternate; the newest valid one wins and a corrupt one falls back', () => {
    expect([slotFor(0), slotFor(1), slotFor(2)]).toEqual([0, 1, 0]);
    const good = world({ elapsed: 50 });
    const newer = world({ elapsed: 90 });
    expect(pickWorldSave([{ slot: 0, seq: 4, state: good }, { slot: 1, seq: 5, state: newer }])).toEqual({ save: newer, nextSeq: 6 });
    // The newest was cut off mid-write: use the older one, still write after the newest seq
    expect(pickWorldSave([{ slot: 0, seq: 4, state: good }, { slot: 1, seq: 5, state: { v: 1, broken: true } }])).toEqual({ save: good, nextSeq: 6 });
    expect(pickWorldSave([])).toEqual({ save: null, nextSeq: 0 });
  });
});

describe('survivor save format', () => {
  const player = (): PlayerSave => ({
    v: 1,
    survivor: { name: 'Ana', occupation: 'nurse', traits: [] },
    pos: { x: 10, y: 20 },
    vitals: { health: 80 },
    condition: { fatigue: 10 },
    body: { wounds: [], fractures: [] },
    skills: {},
    booksRead: {},
    recipes: ['tear_rags'],
    bag: [
      { uid: 'a', def: 'planks', qty: 2 },
      { uid: 'b', def: 'not_an_item' as never, qty: 1 },
      { uid: 'c', def: 'apple', qty: 1, rot: 3 },
    ],
    equipped: { outer: { uid: 'e', def: 'hoodie', qty: 1, cond: 0.5 } },
    weapons: { owned: ['axe'], current: 'axe', durability: { axe: 40 }, mags: {}, reserve: { '9mm': 12 } },
    at: 1,
  });

  it('keeps good items, drops unknown ones, rejects broken saves', () => {
    const s = validatePlayerSave(player())!;
    expect(s.bag.map((i) => i.def)).toEqual(['planks', 'apple']);
    expect(s.equipped.outer?.def).toBe('hoodie');
    expect(validatePlayerSave({ ...player(), pos: null })).toBeNull();
    expect(validatePlayerSave({ ...player(), v: 2 })).toBeNull();
    expect(validatePlayerSave({ ...player(), survivor: { name: 3 } })).toBeNull();
  });
});

/** An in-memory store with switchable failures. */
function memoryStore() {
  const slots = new Map<number, { seq: number; state: unknown }>();
  let player: unknown = null;
  let rules: unknown = null;
  const ctl = { fail: null as string | null, writes: [] as number[] };
  const check = () => {
    if (ctl.fail) throw new Error(ctl.fail);
  };
  const store: SaveStore = {
    async worldSlots() {
      check();
      return [...slots].map(([slot, r]) => ({ slot, ...r }));
    },
    async writeWorld(_s, slot, seq, state) {
      check();
      ctl.writes.push(slot);
      slots.set(slot, { seq, state: JSON.parse(JSON.stringify(state)) });
    },
    async readPlayer() {
      check();
      return player;
    },
    async writePlayer(_s, state) {
      check();
      player = JSON.parse(JSON.stringify(state));
    },
    async deletePlayer() {
      check();
      player = null;
    },
    async readRules() {
      check();
      return rules;
    },
    async writeRules(_s, r) {
      check();
      rules = r;
    },
  };
  return { store, ctl, slots };
}

describe('save service', () => {
  it('saves alternate between the slots and load picks the newest', async () => {
    const { store, ctl } = memoryStore();
    const svc = new SurvivalSaveService('space', store);
    expect(await svc.loadWorld()).toBeNull();
    expect(svc.worldReady).toBe(true);
    await svc.saveWorld(world({ elapsed: 1 }));
    await svc.saveWorld(world({ elapsed: 2 }));
    await svc.saveWorld(world({ elapsed: 3 }));
    expect(ctl.writes).toEqual([0, 1, 0]);
    const again = new SurvivalSaveService('space', store);
    expect((await again.loadWorld())?.elapsed).toBe(3);
    expect(svc.lastWorld?.ok).toBe(true);
  });

  it('fails soft: an unavailable server is reported, never thrown', async () => {
    const { store, ctl } = memoryStore();
    ctl.fail = 'relation "public.survival_world_saves" does not exist';
    const svc = new SurvivalSaveService('space', store);
    expect(await svc.loadWorld()).toBeNull();
    expect(svc.worldReady).toBe(false);
    expect(svc.lastWorld).toMatchObject({ ok: false, error: 'Saving is not set up on the server yet' });
    expect(await svc.saveWorld(world())).toBe(false);
    ctl.fail = 'new row violates row-level security policy';
    expect(await svc.saveRules(NORMAL_RULES)).toBe('Not allowed to save here');
    expect(await svc.loadRules()).toEqual(NORMAL_RULES);
  });

  it('survivor saves round-trip; permadeath deletes them', async () => {
    const { store } = memoryStore();
    const svc = new SurvivalSaveService('space', store);
    expect(await svc.loadPlayer()).toBeNull();
    const p = validatePlayerSave({
      v: 1, survivor: { name: 'Bo', occupation: 'unemployed', traits: [] }, pos: { x: 1, y: 2 }, vitals: { health: 50 },
      condition: {}, body: { wounds: [], fractures: [] }, skills: {}, booksRead: {}, recipes: [], bag: [], equipped: {},
      weapons: { owned: [], current: 'axe', durability: {}, mags: {}, reserve: {} }, at: 0,
    })!;
    expect(await svc.savePlayer(p)).toBe(true);
    expect((await svc.loadPlayer())?.survivor.name).toBe('Bo');
    await svc.deletePlayer();
    expect(await svc.loadPlayer()).toBeNull();
  });
});

describe('world rules', () => {
  it('presets are exact; anything else is clamped into Custom', () => {
    expect(sanitizeRules({ preset: 'hardcore', population: 99 })).toEqual(PRESETS.hardcore);
    expect(sanitizeRules(null)).toEqual(NORMAL_RULES);
    const custom = sanitizeRules({ preset: 'custom', population: 99, xp: -5, powerOffDays: [9, 3], weather: 'tornado', timeSpeed: 2 });
    expect(custom.preset).toBe('custom');
    expect(custom.population).toBe(RULE_RANGES.population.max);
    expect(custom.xp).toBe(RULE_RANGES.xp.min);
    expect(custom.powerOffDays).toEqual([3, 9]);
    expect(custom.weather).toBe('normal');
    expect(custom.timeSpeed).toBe(2);
  });

  it('harder presets mean more, sharper zombies, scarcer loot, earlier outages', () => {
    const d = { populationMul: 1, spawnIntervalSeconds: 60, aggroMul: 1, lootMul: 1, level: 0 };
    const easy = applyRules(d, PRESETS.beginner);
    const hard = applyRules(d, PRESETS.hardcore);
    expect(hard.populationMul).toBeGreaterThan(easy.populationMul);
    expect(hard.spawnIntervalSeconds).toBeLessThan(easy.spawnIntervalSeconds);
    expect(hard.aggroMul).toBeGreaterThan(easy.aggroMul);
    expect(hard.lootMul).toBeLessThan(easy.lootMul);
    expect(applyRules(d, { ...NORMAL_RULES, respawn: 0 } as WorldRules).spawnIntervalSeconds).toBe(Infinity);
    // Hardcore loses power on day 1; Beginner keeps it for days
    const day = (h: number) => Math.floor((START_HOUR + h) / 24) + 1;
    expect(day(powerOffHour(5, PRESETS.hardcore.powerOffDays))).toBe(1);
    expect(day(powerOffHour(5, PRESETS.beginner.powerOffDays))).toBeGreaterThanOrEqual(6);
  });

  it('stormy worlds rain far more than calm ones', () => {
    let calm = 0;
    let stormy = 0;
    for (let h = 0; h < 24 * 30; h += 3) {
      if (['rain', 'storm'].includes(weatherAt(11, h, 'calm'))) calm++;
      if (['rain', 'storm'].includes(weatherAt(11, h, 'stormy'))) stormy++;
    }
    expect(stormy).toBeGreaterThan(calm * 2);
  });
});

describe('host request limits', () => {
  it('a burst is fine, a flood is dropped and counted, and the bucket refills', () => {
    const g = new HostGuard();
    const { burst, rate } = REQUEST_LIMITS.inv;
    let allowed = 0;
    for (let i = 0; i < burst + 20; i++) if (g.allow('c', 'inv', 0)) allowed++;
    expect(allowed).toBe(burst);
    expect(g.droppedTotal).toBe(20);
    // Another client and another kind have their own buckets
    expect(g.allow('d', 'inv', 0)).toBe(true);
    expect(g.allow('c', 'door', 0)).toBe(true);
    // A second later, `rate` more
    let later = 0;
    for (let i = 0; i < 20; i++) if (g.allow('c', 'inv', 1)) later++;
    expect(later).toBe(rate);
    g.forget('c');
    expect(g.allow('c', 'inv', 1)).toBe(true);
  });
});
