import { describe, expect, it } from 'vitest';
import { MAP_HEIGHT, MAP_WIDTH } from '../collision';
import { getBoundaryWallsForMap, getBuildingsForMap, type GroundType } from '../map/mapRegistry';
import { ZombieMode, type ZombieFrameInput, type ZombieHud } from './zombieMode';
import { TILE_SOLID } from './grid';
import { STRUCTURE_KINDS } from './survival/structures';
import { CROP_IDS } from './survival/food';
import type { WorldFixture } from './survival/utilities';
import type { ZombieBuildOp, ZombieSnapshot, ZombieStrike } from '../../lib/services/zombieSync';

// Phase 7 food production through the real ZombieMode: farm plots, snares, fishing, foraging.

const walls = getBoundaryWallsForMap('village');
const buildings = getBuildingsForMap('village');
const SPAWN = { x: 436, y: 328 };
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
  bag: { items: { uid: string; def: string; qty: number; cond?: number }[] };
  built: Map<number, { kind: string; state?: number[] }>;
  injuryRng: () => number;
  clockSkip: number;
  remoteBuild: { op: ZombieBuildOp; from: string }[];
  placeStructure(kind: string, tile: number, owner: string): boolean;
};
const p = (m: ZombieMode) => m as unknown as Priv;
const give = (m: ZombieMode, items: Record<string, number>, weapons: string[] = []) => {
  const x = p(m);
  for (const w of weapons) x.owned.add(w);
  x.bag = { ...x.bag, items: [...x.bag.items, ...Object.entries(items).map(([def, qty], i) => ({ uid: `g${def}${i}`, def, qty }))] } as never;
};
const count = (m: ZombieMode, def: string) => p(m).bag.items.filter((i) => i.def === def).reduce((s, i) => s + i.qty, 0);

function makeMode(ground: GroundType = 'grass', fixtures: WorldFixture[] = []) {
  const mode = new ZombieMode(walls, buildings, MAP_WIDTH, MAP_HEIGHT, 1, []);
  let hud: ZombieHud | null = null;
  mode.onHudChanged = (h) => (hud = h);
  mode.setWorld(77, fixtures);
  mode.setGround(() => ground);
  return { mode, hud: () => hud! };
}

function step(mode: ZombieMode, seconds: number, over: Partial<ZombieFrameInput> = {}) {
  for (let t = 0; t < seconds; t += 1 / 30) {
    mode.sim.zombies = [];
    mode.update(1 / 30, frame(over));
  }
}

function buildEast(mode: ZombieMode, recipe: 'farm_plot' | 'snare_trap') {
  mode.setAim(0);
  step(mode, 0.05);
  expect(mode.craft(recipe)).toBe(true);
  step(mode, 0.05);
  expect(mode.confirmPlacement()).toBe(true);
  step(mode, 8);
}

describe('farming', () => {
  it('a plot goes in grass (not on paving), is walkable, and grows what you plant to harvest', () => {
    const { mode, hud } = makeMode('grass');
    give(mode, { shovel: 1, carrot_seeds: 2 });
    buildEast(mode, 'farm_plot');
    const plot = p(mode).built.get(EAST.tile)!;
    expect(plot.kind).toBe('farm_plot');
    // Flat on the ground: you walk over it
    expect(mode.sim.grid.flags[EAST.tile] & TILE_SOLID).toBeFalsy();
    step(mode, 1);
    expect(hud().worldAction?.label).toBe('Farm Plot');
    const plantCarrots = `u:plant:${CROP_IDS.indexOf('carrot')}`;
    expect(hud().worldAction?.actions.map((a) => a.id)).toContain(plantCarrots);
    expect(mode.worldAction(plantCarrots)).toBe(true);
    expect(count(mode, 'carrot_seeds')).toBe(1);
    expect(plot.state?.[0]).toBe(CROP_IDS.indexOf('carrot'));
    // Fast-forward three game days, keeping it watered
    for (let i = 0; i < 40; i++) {
      p(mode).clockSkip += 300; // 2 game hours
      plot.state![2] = 70;
      step(mode, 1 / 30);
    }
    expect(hud().worldAction?.status).toMatch(/Ripe/);
    step(mode, 1);
    expect(mode.worldAction('u:harvest')).toBe(true);
    expect(count(mode, 'carrot')).toBeGreaterThanOrEqual(3);
    expect(mode.skills.farming.xp).toBeGreaterThan(0);
  });

  it('no plots on paving or indoors', () => {
    const { mode, hud } = makeMode('paved');
    give(mode, { shovel: 1 });
    mode.setAim(0);
    step(mode, 0.05);
    mode.craft('farm_plot');
    step(mode, 0.1);
    expect(hud().build.placing).toMatchObject({ valid: false, reason: 'Needs grass or dirt, outdoors' });
  });

  it("a client's harvest comes back from the host in the ack", () => {
    const host = makeMode('grass');
    const client = makeMode('grass');
    const clientNet: Record<string, unknown> = {
      selfId: 'c', isReady: () => true, isHost: () => false, getHostId: () => 'h', isMember: () => true, memberCount: () => 2,
      sendLoot() {}, sendShot() {}, sendDoor() {}, sendSnapshot() {}, sendVehicle() {},
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
    tick(0.2);
    p(host.mode).remoteBuild.push({ op: { r: 1, o: 'b', k: STRUCTURE_KINDS.indexOf('farm_plot'), t: EAST.tile }, from: 'c' });
    tick(0.6);
    expect(p(client.mode).built.get(EAST.tile)?.kind).toBe('farm_plot');
    // Ripe potatoes on the host
    p(host.mode).built.get(EAST.tile)!.state = [CROP_IDS.indexOf('potato'), 1, 60, 100, 0];
    tick(0.6);
    expect(client.mode.worldAction('u:harvest')).toBe(true);
    tick(0.6);
    expect(count(client.mode, 'potato')).toBeGreaterThanOrEqual(4);
    expect(p(host.mode).built.get(EAST.tile)?.state?.[0]).toBe(-1);
  });
});

describe('trapping', () => {
  it('set a snare, bait it, empty it, butcher the catch', () => {
    const { mode, hud } = makeMode('park');
    give(mode, { branch: 2, thread: 1, worms: 2 }, ['knife']);
    buildEast(mode, 'snare_trap');
    const trap = p(mode).built.get(EAST.tile)!;
    expect(trap.kind).toBe('snare_trap');
    step(mode, 1);
    expect(mode.worldAction('u:bait')).toBe(true);
    expect(trap.state?.[1]).toBe(1);
    expect(count(mode, 'worms')).toBe(1);
    // Overnight: a rabbit
    trap.state = [0, 0, 0];
    step(mode, 1);
    expect(hud().worldAction?.status).toMatch(/Caught a rabbit/);
    expect(mode.worldAction('u:collect')).toBe(true);
    expect(count(mode, 'dead_rabbit')).toBe(1);
    expect(mode.skills.trapping.xp).toBeGreaterThan(0);
    step(mode, 1);
    expect(mode.craft('butcher')).toBe(true);
    step(mode, 6);
    expect(count(mode, 'raw_meat')).toBe(2);
  });

  it('a snare left alone catches something over a couple of days', () => {
    const { mode } = makeMode('park');
    give(mode, { branch: 2, thread: 1 });
    buildEast(mode, 'snare_trap');
    const trap = p(mode).built.get(EAST.tile)!;
    let caught = false;
    for (let i = 0; i < 60 && !caught; i++) {
      p(mode).clockSkip += 300;
      step(mode, 1 / 30);
      caught = (trap.state?.[0] ?? -1) >= 0;
    }
    expect(caught).toBe(true);
  });
});

describe('fishing and foraging', () => {
  const FOUNTAIN: WorldFixture = { kind: 'fountain', x: SPAWN.x + 8, y: SPAWN.y - 26, w: 30, h: 16 };

  it('casting at a fountain with a rod (and bait) catches fish and trains Fishing', () => {
    const { mode, hud } = makeMode('paved', [FOUNTAIN]);
    p(mode).injuryRng = () => 0;
    step(mode, 0.1);
    expect(hud().worldAction?.actions.find((a) => a.id === 'f:fish')).toMatchObject({ ok: false, reason: 'Needs a fishing rod' });
    give(mode, { fishing_rod: 1, worms: 1 });
    step(mode, 0.1);
    expect(mode.worldAction('f:fish')).toBe(true);
    step(mode, 3);
    expect(hud().build.progress?.label).toBe('Fishing');
    step(mode, 4);
    expect(count(mode, 'fish_minnow') + count(mode, 'fish_perch')).toBe(1);
    expect(count(mode, 'worms')).toBe(0);
    expect(p(mode).bag.items.find((i) => i.def === 'fishing_rod')?.cond).toBeLessThan(1);
    expect(mode.skills.fishing.xp).toBeGreaterThan(0);
  });

  it('walking off stops the cast', () => {
    const { mode } = makeMode('paved', [FOUNTAIN]);
    give(mode, { fishing_rod: 1 });
    step(mode, 0.1);
    mode.worldAction('f:fish');
    step(mode, 1, { moveX: 1 });
    step(mode, 7);
    expect(count(mode, 'fish_minnow') + count(mode, 'fish_perch')).toBe(0);
  });

  it('foraging park land turns things up, then the patch is picked over for a while', () => {
    const { mode, hud } = makeMode('park');
    p(mode).injuryRng = () => 0;
    step(mode, 0.1);
    expect(hud().worldAction?.label).toBe('Park land');
    expect(mode.worldAction('f:forage')).toBe(true);
    step(mode, 5);
    const total = p(mode).bag.items.reduce((s, i) => s + i.qty, 0);
    expect(total).toBeGreaterThan(0);
    expect(mode.skills.foraging.xp).toBeGreaterThan(0);
    step(mode, 1);
    expect(hud().worldAction?.actions[0]).toMatchObject({ ok: false });
  });
});
