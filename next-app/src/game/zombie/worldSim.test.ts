import { describe, expect, it } from 'vitest';
import { MAP_HEIGHT, MAP_WIDTH } from '../collision';
import { getBoundaryWallsForMap, getBuildingsForMap } from '../map/mapRegistry';
import { ZombieMode, type ZombieFrameInput, type ZombieHud } from './zombieMode';
import { STRUCTURE_KINDS } from './survival/structures';
import { clockAt, powerOffHour, waterOffHour, weatherAt } from './survival/world';
import { SPOIL } from './survival/spoilage';
import { GENERATOR } from './survival/utilities';
import { freshCondition, tickCondition } from './survival/condition';
import { freshVitals } from './survival/vitals';
import type { WorldFixture } from './survival/utilities';
import type { ZombieBuildOp, ZombieSnapshot, ZombieStrike } from '../../lib/services/zombieSync';

// Phase 6 (world simulation) through the real ZombieMode.

const walls = getBoundaryWallsForMap('village');
const buildings = getBuildingsForMap('village');
const SPAWN = { x: 436, y: 328 };
const SEED = 4242;
const COLS = Math.ceil(MAP_WIDTH / 16);
const EAST = { tile: Math.floor((SPAWN.y - 4) / 16) * COLS + Math.floor((SPAWN.x + 16) / 16) };
const frame = (over: Partial<ZombieFrameInput> = {}): ZombieFrameInput => ({
  feetX: SPAWN.x,
  feetY: SPAWN.y,
  moveX: 0,
  moveY: 0,
  insideBuildingId: null,
  others: [],
  ...over,
});

type Priv = {
  owned: Set<string>;
  bag: { items: { uid: string; def: string; qty: number; rot?: number }[] };
  built: Map<number, { kind: string; container?: number; state?: number[] }>;
  elapsed: number;
  clockSkip: number;
  vitals: ReturnType<typeof freshVitals>;
  pendingNoises: { x: number; y: number; radius: number }[];
  poweredAt(x: number, y: number): boolean;
  remoteBuild: { op: ZombieBuildOp; from: string }[];
};
const p = (m: ZombieMode) => m as unknown as Priv;
const give = (m: ZombieMode, items: Record<string, number>, weapons: string[] = []) => {
  const x = p(m);
  for (const w of weapons) x.owned.add(w);
  x.bag = { ...x.bag, items: [...x.bag.items, ...Object.entries(items).map(([def, qty], i) => ({ uid: `g${def}${i}`, def, qty }))] } as never;
};
const count = (m: ZombieMode, def: string) => p(m).bag.items.filter((i) => i.def === def).reduce((s, i) => s + i.qty, 0);

/** A tap right next to the spawn (and a toilet / pump a little further along). */
const TAP: WorldFixture = { kind: 'tap', x: SPAWN.x + 8, y: SPAWN.y - 20, w: 16, h: 10 };

function makeMode(fixtures: WorldFixture[] = [TAP]) {
  const mode = new ZombieMode(walls, buildings, MAP_WIDTH, MAP_HEIGHT, 1, []);
  let hud: ZombieHud | null = null;
  mode.onHudChanged = (h) => (hud = h);
  mode.setWorld(SEED, fixtures);
  return { mode, hud: () => hud! };
}

function step(mode: ZombieMode, seconds: number, over: Partial<ZombieFrameInput> = {}) {
  for (let t = 0; t < seconds; t += 1 / 30) {
    mode.sim.zombies = [];
    mode.update(1 / 30, frame(over));
  }
}

/** Jump the match clock to a game hour (0 = the start, 08:00 on day 1). */
const at = (m: ZombieMode, hours: number) => {
  p(m).elapsed = clockAt(hours);
};

/** The first summer hour (after the start) with this weather. */
function hourWith(w: string): number {
  for (let h = 1; h < 140; h += 0.5) if (weatherAt(SEED, h) === w && weatherAt(SEED, h + 1) === w) return h;
  throw new Error(`no ${w} in the first week`);
}

describe('world timeline in game', () => {
  it('the HUD shows weather, temperature, power and water, and toasts the power cut', () => {
    const { mode, hud } = makeMode();
    step(mode, 0.1);
    expect(hud().world).toMatchObject({ power: true, water: true, season: 'Summer' });
    expect(typeof hud().world.tempC).toBe('number');
    // Just before the cut (any day / night toast fires here), then past it
    at(mode, powerOffHour(SEED) - 0.01);
    step(mode, 0.1);
    at(mode, powerOffHour(SEED) + 0.01);
    step(mode, 0.1);
    expect(hud().world.power).toBe(false);
    expect(hud().toast).toMatch(/power has gone out/i);
  });

  it('rain soaks you outdoors and you dry off indoors', () => {
    const { mode } = makeMode();
    at(mode, hourWith('rain'));
    step(mode, 20);
    const wet = mode.condition.wet;
    expect(wet).toBeGreaterThan(5);
    step(mode, 20, { insideBuildingId: buildings[0].id });
    expect(mode.condition.wet).toBeLessThan(wet);
  });

  it('wet clothes make the cold bite harder', () => {
    const base = { dt: 1, timeScale: 1, intent: 'idle' as const, sleep: null, indoors: false, light: 1, hunters: 0, nearestHunterTiles: Infinity, safe: false, vitals: freshVitals(), load: 0, swings: 0, shots: 0, ambient: 0, insulation: 8 };
    let dry = freshCondition();
    let soaked = { ...freshCondition(), wet: 100 };
    for (let i = 0; i < 300; i++) {
      dry = tickCondition(dry, base).condition;
      soaked = tickCondition(soaked, { ...base, precipitation: 1 }).condition;
    }
    expect(soaked.bodyTemp).toBeLessThan(dry.bodyTemp - 0.3);
  });

  it('fog and storms shorten zombie senses on the host', () => {
    const { mode } = makeMode();
    at(mode, hourWith('storm'));
    step(mode, 0.1);
    expect(mode.sim.hearingMul).toBeLessThan(1);
    expect(mode.sim.sightMul).toBeLessThan(1);
  });
});

describe('water', () => {
  it('a tap fills empty bottles while the water runs; after the shut-off it is dry', () => {
    const { mode, hud } = makeMode();
    give(mode, { empty_bottle: 2 });
    step(mode, 0.1);
    expect(hud().worldAction?.label).toBe('Kitchen Tap');
    expect(mode.worldAction('f:fill')).toBe(true);
    expect(count(mode, 'water_bottle')).toBe(2);
    expect(count(mode, 'empty_bottle')).toBe(0);
    at(mode, waterOffHour(SEED) + 0.1);
    step(mode, 1);
    expect(hud().worldAction?.status).toBe('The water is off');
    expect(hud().worldAction?.actions).toEqual([]);
  });

  it('drinking a bottle leaves the empty bottle; tainted water makes you ill until boiled', () => {
    const { mode } = makeMode();
    give(mode, { water_bottle: 1, tainted_water: 1 });
    step(mode, 0.1);
    expect(mode.useSupply('water_bottle')).toBe(true);
    expect(count(mode, 'empty_bottle')).toBe(1);
    step(mode, 1);
    expect(mode.useSupply('tainted_water')).toBe(true);
    expect(p(mode).vitals.effects.some((e) => e.kind === 'poison' && e.source === 'tainted_water')).toBe(true);
  });

  it('a toilet tank gives a few tainted bottles once the mains are off', () => {
    const toilet: WorldFixture = { ...TAP, kind: 'toilet' };
    const { mode, hud } = makeMode([toilet]);
    give(mode, { empty_bottle: 6 });
    at(mode, waterOffHour(SEED) + 1);
    step(mode, 0.1);
    let fills = 0;
    for (let i = 0; i < 6; i++) {
      step(mode, 1);
      if (hud().worldAction?.actions[0].ok && mode.worldAction()) fills++;
    }
    expect(fills).toBe(3);
    expect(count(mode, 'tainted_water')).toBe(3);
  });
});

describe('food', () => {
  it('rotten food barely feeds you and gives food poisoning; the freshest-but-safe stack is eaten first', () => {
    const { mode, hud } = makeMode();
    at(mode, 300);
    step(mode, 0.1);
    const now = 300;
    p(mode).bag = { ...p(mode).bag, items: [
      { uid: 'old', def: 'bread', qty: 1, rot: now - SPOIL.bread!.rotten - 1 },
      { uid: 'ok', def: 'bread', qty: 1, rot: now - 1 },
    ] } as never;
    mode.setInventoryOpen(true);
    step(mode, 0.1);
    expect(hud().inventory?.items.find((i) => i.key === 'b:old')?.freshness).toBe('rotten');
    expect(hud().inventory?.items.find((i) => i.key === 'b:ok')?.freshness).toBe('fresh');
    p(mode).vitals = { ...p(mode).vitals, hunger: 20 };
    expect(mode.useSupply('bread')).toBe(true);
    expect(p(mode).bag.items.map((i) => i.uid)).toEqual(['old']);
    const fed = p(mode).vitals.hunger;
    step(mode, 1);
    // Now the rotten one, on purpose
    expect(mode.inventoryAction('b:old', 'use')).toBe(true);
    expect(p(mode).vitals.hunger - fed).toBeLessThan(15);
    expect(p(mode).vitals.effects.some((e) => e.source === 'food_poisoning')).toBe(true);
  });

  it('new food gets its age stamped when it lands in the bag', () => {
    const { mode } = makeMode();
    at(mode, 10);
    give(mode, { raw_meat: 1 });
    step(mode, 0.1);
    expect(p(mode).bag.items[0].rot).toBeCloseTo(10, 0);
  });
});

describe('fire and cooking', () => {
  it('a campfire lets you cook, warms you and burns out', () => {
    const { mode, hud } = makeMode([]);
    give(mode, { planks: 3, raw_meat: 1, lighter: 1 });
    mode.setAim(0);
    step(mode, 0.05);
    expect(mode.craft('cook_meat')).toBe(false);
    expect(mode.craft('campfire')).toBe(true);
    step(mode, 0.05);
    expect(mode.confirmPlacement()).toBe(true);
    step(mode, 6);
    const fire = p(mode).built.get(EAST.tile);
    expect(fire?.kind).toBe('campfire');
    expect(fire?.state?.[0]).toBeGreaterThan(0);
    expect(hud().worldAction?.label).toBe('Campfire');
    expect(mode.craft('cook_meat')).toBe(true);
    step(mode, 8);
    expect(count(mode, 'cooked_meat')).toBe(1);
    expect(mode.skills.cooking.xp).toBeGreaterThan(0);
    // Add the last plank, then let it burn out
    expect(mode.worldAction('u:stoke')).toBe(true);
    expect(count(mode, 'planks')).toBe(0);
    p(mode).built.get(EAST.tile)!.state = [1];
    step(mode, 1);
    expect(p(mode).built.get(EAST.tile)!.state![0]).toBe(0);
  });
});

describe('power', () => {
  it('a running generator powers its surroundings after the mains fail, and is loud', () => {
    const { mode } = makeMode([]);
    give(mode, { generator: 1, screwdriver: 1, gas_can_full: 1 });
    mode.skills = { ...mode.skills, electrical: { level: 1, xp: 0 } };
    at(mode, powerOffHour(SEED) + 1);
    mode.setAim(0);
    step(mode, 0.1);
    expect(p(mode).poweredAt(SPAWN.x, SPAWN.y)).toBe(false);
    expect(mode.craft('place_generator')).toBe(true);
    step(mode, 0.05);
    mode.confirmPlacement();
    step(mode, 6);
    expect(p(mode).built.get(EAST.tile)?.kind).toBe('generator');
    expect(mode.worldAction('u:refuel')).toBe(true);
    expect(count(mode, 'gas_can')).toBe(1);
    step(mode, 1);
    expect(mode.worldAction('u:toggle')).toBe(true);
    step(mode, 0.2);
    expect(p(mode).poweredAt(SPAWN.x, SPAWN.y)).toBe(true);
    expect(p(mode).poweredAt(SPAWN.x + 30 * 16, SPAWN.y)).toBe(false);
    p(mode).pendingNoises = [];
    let loud = false;
    for (let i = 0; i < 4 * 30 && !loud; i++) {
      mode.sim.zombies = [];
      mode.update(1 / 30, frame());
      loud = p(mode).pendingNoises.some((n) => n.radius === GENERATOR.noiseRadius);
    }
    // The hum is queued for the zombies' next tick
    expect(loud).toBe(true);
  });
});

describe('multiplayer utilities', () => {
  function party() {
    const host = makeMode([]);
    const client = makeMode([]);
    const clientNet: Record<string, unknown> = {
      selfId: 'c', isReady: () => true, isHost: () => false, getHostId: () => 'h', isMember: () => true, memberCount: () => 2,
      sendLoot() {}, sendShot() {}, sendDoor() {}, sendSnapshot() {},
      sendStrike: (s: ZombieStrike) => (hostNet.onStrike as (s: ZombieStrike, f: string) => void)(s, 'c'),
      sendBuild: (op: ZombieBuildOp) => (hostNet.onBuild as (o: ZombieBuildOp, f: string) => void)(structuredClone(op), 'c'),
    };
    const hostNet: Record<string, unknown> = {
      ...clientNet, selfId: 'h', isHost: () => true,
      sendSnapshot: (snap: ZombieSnapshot) => (clientNet.onSnapshot as (s: unknown, f: string) => void)(structuredClone(snap), 'h'),
    };
    host.mode.attachNet(hostNet as never);
    client.mode.attachNet(clientNet as never);
    const tick = (s: number) => {
      for (let t = 0; t < s; t += 1 / 30) {
        host.mode.sim.zombies = [];
        host.mode.update(1 / 30, frame({ feetX: SPAWN.x + 300, others: [{ id: 'c', x: SPAWN.x, y: SPAWN.y }] }));
        client.mode.update(1 / 30, frame());
      }
    };
    return { host, client, tick };
  }

  it("a client fuels and starts a generator through the host; its state reaches the client", () => {
    const { host, client, tick } = party();
    tick(0.2);
    // The host already has a generator east of the client
    p(host.mode).remoteBuild.push({ op: { r: 1, o: 'b', k: STRUCTURE_KINDS.indexOf('generator'), t: EAST.tile }, from: 'c' });
    tick(0.6);
    expect(p(client.mode).built.get(EAST.tile)?.kind).toBe('generator');
    expect(p(client.mode).built.get(EAST.tile)?.state).toEqual([0, 0, 100]);
    give(client.mode, { gas_can_full: 1 });
    tick(0.1);
    expect(client.mode.worldAction('u:refuel')).toBe(true);
    expect(count(client.mode, 'gas_can_full')).toBe(0);
    tick(0.6);
    expect(p(host.mode).built.get(EAST.tile)?.state?.[0]).toBe(GENERATOR.canFuel);
    expect(count(client.mode, 'gas_can')).toBe(1);
    tick(1);
    expect(client.mode.worldAction('u:toggle')).toBe(true);
    tick(0.6);
    expect(p(host.mode).built.get(EAST.tile)?.state?.[1]).toBe(1);
    expect(p(client.mode).built.get(EAST.tile)?.state?.[1]).toBe(1);
  });

  it('a refused action gives the client its fuel back', () => {
    const { host, client, tick } = party();
    tick(0.2);
    p(host.mode).remoteBuild.push({ op: { r: 1, o: 'b', k: STRUCTURE_KINDS.indexOf('generator'), t: EAST.tile }, from: 'c' });
    tick(0.6);
    // The host's tank fills up before the client's request lands
    p(host.mode).built.get(EAST.tile)!.state = [99, 0, 100];
    give(client.mode, { gas_can_full: 1 });
    tick(0.05);
    expect(client.mode.worldAction('u:refuel')).toBe(true);
    tick(0.6);
    expect(count(client.mode, 'gas_can_full')).toBe(1);
    expect(count(client.mode, 'gas_can')).toBe(0);
  });
});
