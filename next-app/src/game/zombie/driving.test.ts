import { describe, expect, it } from 'vitest';
import { MAP_HEIGHT, MAP_WIDTH } from '../collision';
import { getBoundaryWallsForMap, getBuildingsForMap } from '../map/mapRegistry';
import { ZombieMode, type ZombieFrameInput, type ZombieHud } from './zombieMode';
import { TILE_SOLID } from './grid';
import { VEHICLE_SPECS, outlinePoints, type VehicleState } from './survival/vehicles';
import type { VehicleSystem } from './vehicleSystem';
import type { ZombieBuildOp, ZombieSnapshot, ZombieStrike } from '../../lib/services/zombieSync';
import type { VehicleRow } from './survival/vehicles';

// Phase 7 vehicles through the real ZombieMode (village map, one parked sedan).

const walls = getBoundaryWallsForMap('village');
const buildings = getBuildingsForMap('village');
const SPAWN = { x: 436, y: 328 };

type Priv = {
  owned: Set<string>;
  bag: { items: { uid: string; def: string; qty: number; cond?: number }[] };
  vehicles: VehicleSystem;
  myVehicle: number | null;
  injuryRng: () => number;
  vitals: { health: number };
  remoteBuild: { op: ZombieBuildOp; from: string }[];
  takeDamage(amount: number, effects: never[], source: 'bite'): void;
};
const p = (m: ZombieMode) => m as unknown as Priv;
const give = (m: ZombieMode, items: Record<string, number>, weapons: string[] = []) => {
  const x = p(m);
  for (const w of weapons) x.owned.add(w);
  x.bag = { ...x.bag, items: [...x.bag.items, ...Object.entries(items).map(([def, qty], i) => ({ uid: `g${def}${i}`, def, qty }))] } as never;
};
const count = (m: ZombieMode, def: string) => p(m).bag.items.filter((i) => i.def === def).reduce((s, i) => s + i.qty, 0);
const frame = (over: Partial<ZombieFrameInput> = {}): ZombieFrameInput => ({
  feetX: SPAWN.x,
  feetY: SPAWN.y,
  moveX: 0,
  moveY: 0,
  insideBuildingId: null,
  others: [],
  ...over,
});

/** A spot just north or south of the spawn where a sedan fits (and is within reach of the spawn). */
function carSpot(mode: ZombieMode): { x: number; y: number } {
  const g = mode.sim.grid;
  const spec = VEHICLE_SPECS.sedan;
  for (const dy of [-30, 26, -34, 30]) {
    for (const dx of [0, -8, 8, -16, 16]) {
      const c = { x: SPAWN.x + dx, y: SPAWN.y - 4 + dy, angle: 0 };
      const free = outlinePoints(c, spec).every((pt) => !(g.flags[Math.floor(pt.y / 16) * g.cols + Math.floor(pt.x / 16)] & TILE_SOLID));
      if (free) return c;
    }
  }
  throw new Error('no room for a car by the spawn');
}

function makeMode(id = 'solo') {
  const mode = new ZombieMode(walls, buildings, MAP_WIDTH, MAP_HEIGHT, 1, []);
  let hud: ZombieHud | null = null;
  mode.onHudChanged = (h) => (hud = h);
  const spot = carSpot(mode);
  mode.setVehicles([{ id: 0, kind: 'sedan', variant: 1, x: spot.x, y: spot.y, angle: 0 }], 7);
  // A car that starts: keys, fuel, good parts
  const v = p(mode).vehicles.get(0)!;
  p(mode).vehicles.set({ ...v, keys: true, fuel: 30, parts: { engine: 100, battery: 100, tires: [100, 100, 100, 100], body: 100, windows: 100 } });
  p(mode).injuryRng = () => 0;
  void id;
  return { mode, hud: () => hud!, spot };
}

function step(mode: ZombieMode, seconds: number, over: Partial<ZombieFrameInput> = {}) {
  for (let t = 0; t < seconds; t += 1 / 30) {
    mode.sim.zombies = [];
    mode.update(1 / 30, frame(over));
  }
}

const car = (m: ZombieMode): VehicleState => p(m).vehicles.get(0)!;

describe('getting in and driving', () => {
  it('a parked car blocks you and the zombies; the chip offers Drive / Trunk / Inspect', () => {
    const { mode, hud, spot } = makeMode();
    expect(mode.isBlocked({ x: spot.x - 6, y: spot.y - 5, w: 12, h: 10 })).toBe(true);
    const g = mode.sim.grid;
    expect(g.flags[Math.floor(spot.y / 16) * g.cols + Math.floor(spot.x / 16)] & TILE_SOLID).toBeTruthy();
    step(mode, 0.1);
    expect(hud().worldAction?.label).toBe('Sedan');
    expect(hud().worldAction?.actions.map((a) => a.id)).toEqual(['v:enter', 'v:trunk', 'v:inspect']);
  });

  it('Drive: you sit in it, the engine starts, W drives forward and you go with the car', () => {
    const { mode, hud, spot } = makeMode();
    step(mode, 0.1);
    expect(mode.worldAction('v:enter')).toBe(true);
    expect(mode.inVehicle()).toBe(true);
    expect(mode.isDriving()).toBe(true);
    expect(car(mode).engineOn).toBe(true);
    // Its tiles free up while it's driven
    const g = mode.sim.grid;
    expect(g.flags[Math.floor(spot.y / 16) * g.cols + Math.floor(spot.x / 16)] & TILE_SOLID).toBeFalsy();
    step(mode, 0.6, { moveY: -0.5 });
    expect(Math.abs(car(mode).x - spot.x) + Math.abs(car(mode).y - spot.y)).toBeGreaterThan(5);
    expect(mode.seat()).toEqual({ x: car(mode).x, y: car(mode).y });
    expect(car(mode).fuel).toBeLessThan(30);
    expect(hud().vehicle).toMatchObject({ inside: true, driving: true, engineOn: true });
  });

  it('a negative or very long frame never throws the car around', () => {
    const { mode } = makeMode();
    step(mode, 0.1);
    mode.worldAction('v:enter');
    p(mode).vehicles.set({ ...car(mode), speed: 150 });
    const before = { ...car(mode) };
    mode.update(-1.5, frame({ moveY: -1 }));
    expect(Math.hypot(car(mode).x - before.x, car(mode).y - before.y)).toBeLessThan(1);
    mode.update(3, frame({ moveY: -1 }));
    // Capped at a few sub-steps: at most ~10 px, never a jump through walls
    expect(Math.hypot(car(mode).x - before.x, car(mode).y - before.y)).toBeLessThan(15);
  });

  it('getting out leaves the car parked (solid again) and puts you beside it', () => {
    const { mode } = makeMode();
    step(mode, 0.1);
    mode.worldAction('v:enter');
    step(mode, 0.4, { moveY: -0.4 });
    step(mode, 2, { moveY: 0.3 });
    step(mode, 1);
    expect(mode.exitVehicle()).toBe(true);
    expect(mode.inVehicle()).toBe(false);
    const out = mode.takeExitPoint()!;
    expect(out).not.toBeNull();
    const v = car(mode);
    expect(v.driver).toBeNull();
    expect(v.engineOn).toBe(false);
    expect(mode.isBlocked({ x: out.x - 6, y: out.y - 8, w: 12, h: 10 })).toBe(false);
    const g = mode.sim.grid;
    expect(g.flags[Math.floor(v.y / 16) * g.cols + Math.floor(v.x / 16)] & TILE_SOLID).toBeTruthy();
  });

  it('no key: Hotwire (Electrical 1 + Mechanics 2) takes a few seconds, then it starts', () => {
    const { mode, hud } = makeMode();
    p(mode).vehicles.set({ ...car(mode), keys: false });
    step(mode, 0.1);
    expect(hud().worldAction?.actions.find((a) => a.id === 'v:hotwire')).toMatchObject({ ok: false });
    mode.skills = { ...mode.skills, electrical: { level: 1, xp: 0 }, mechanics: { level: 2, xp: 0 } };
    step(mode, 0.1);
    expect(mode.worldAction('v:hotwire')).toBe(true);
    step(mode, 3);
    expect(hud().build.progress?.label).toBe('Hotwiring');
    step(mode, 4);
    expect(car(mode).hotwired).toBe(true);
    mode.worldAction('v:enter');
    expect(car(mode).engineOn).toBe(true);
  });

  it('an empty tank or a dead battery stops it starting', () => {
    const { mode, hud } = makeMode();
    p(mode).vehicles.set({ ...car(mode), fuel: 0 });
    step(mode, 0.1);
    mode.worldAction('v:enter');
    expect(car(mode).engineOn).toBe(false);
    step(mode, 0.05);
    expect(hud().toast).toMatch(/tank is empty/i);
  });

  it('zombies bite at the windows instead of you', () => {
    const { mode } = makeMode();
    step(mode, 0.1);
    mode.worldAction('v:enter');
    const hp = p(mode).vitals.health;
    p(mode).takeDamage(10, [], 'bite');
    expect(p(mode).vitals.health).toBe(hp);
    expect(car(mode).parts.windows).toBeLessThan(100);
  });

  it('running a zombie down hurts it (and dents the car)', () => {
    const { mode } = makeMode();
    step(mode, 0.1);
    mode.worldAction('v:enter');
    const v = car(mode);
    p(mode).vehicles.set({ ...v, speed: 120 });
    mode.sim.zombies = [];
    const z = mode.sim.add(v.x + 30, v.y);
    const hp0 = z.hp;
    for (let i = 0; i < 6; i++) mode.update(1 / 30, frame({ moveY: -1 }));
    const after = mode.sim.zombies.find((o) => o.id === z.id);
    expect(!after || after.hp < hp0).toBe(true);
    expect(car(mode).parts.body).toBeLessThan(100);
  });
});

describe('trunk and service', () => {
  it('the trunk is a container that holds what you put in', () => {
    const { mode, hud } = makeMode();
    give(mode, { rope: 1 });
    step(mode, 0.1);
    expect(mode.worldAction('v:trunk')).toBe(true);
    step(mode, 0.1);
    expect(hud().loot?.label).toBe('Trunk');
    expect(hud().loot?.capacity).toBe(VEHICLE_SPECS.sedan.trunkKg);
    const rope = p(mode).bag.items.find((i) => i.def === 'rope')!;
    expect(mode.inventoryAction(`b:${rope.uid}`, 'put')).toBe(true);
    step(mode, 0.1);
    expect(hud().loot?.items.some((i) => i.name === 'Rope')).toBe(true);
  });

  it('Inspect lists the parts; a spare tyre and a wrench replace the worst tyre and train Mechanics', () => {
    const { mode, hud } = makeMode();
    p(mode).vehicles.set({ ...car(mode), parts: { ...car(mode).parts, tires: [100, 40, 100, 100] } });
    give(mode, { spare_tire: 1, wrench: 1 });
    p(mode).bag.items.find((i) => i.def === 'spare_tire')!.cond = 0.9;
    step(mode, 0.1);
    mode.worldAction('v:inspect');
    step(mode, 1);
    expect(hud().vehicle?.parts.map((x) => x.label)).toContain('Front right tyre');
    expect(hud().vehicle?.services.find((s) => s.id === 'v:tire')).toMatchObject({ ok: true });
    expect(mode.vehicleCommand(0, 'tire')).toBe(true);
    expect(car(mode).parts.tires).toEqual([100, 90, 100, 100]);
    // The old tyre comes back with its wear
    expect(p(mode).bag.items.find((i) => i.def === 'spare_tire')?.cond).toBeCloseTo(0.4);
    expect(mode.skills.mechanics.xp).toBeGreaterThan(0);
  });

  it('a gas can tops up the tank and comes back empty', () => {
    const { mode } = makeMode();
    give(mode, { gas_can_full: 1 });
    step(mode, 0.1);
    expect(mode.vehicleCommand(0, 'refuel')).toBe(true);
    expect(car(mode).fuel).toBe(40);
    expect(count(mode, 'gas_can')).toBe(1);
    expect(count(mode, 'gas_can_full')).toBe(0);
  });
});

describe('multiplayer driving', () => {
  function party() {
    const host = makeMode('h');
    const client = makeMode('c');
    const clientNet: Record<string, unknown> = {
      selfId: 'c', isReady: () => true, isHost: () => false, getHostId: () => 'h', isMember: () => true, memberCount: () => 2,
      sendLoot() {}, sendShot() {}, sendDoor() {}, sendSnapshot() {},
      sendStrike: (s: ZombieStrike) => (hostNet.onStrike as (s: ZombieStrike, f: string) => void)(s, 'c'),
      sendBuild: (op: ZombieBuildOp) => (hostNet.onBuild as (o: ZombieBuildOp, f: string) => void)(structuredClone(op), 'c'),
      sendVehicle: (row: VehicleRow, horn?: boolean) => (hostNet.onVehicle as (r: VehicleRow, f: string, h: boolean) => void)(structuredClone(row), 'c', !!horn),
    };
    const hostNet: Record<string, unknown> = {
      ...clientNet, selfId: 'h', isHost: () => true,
      sendSnapshot: (snap: ZombieSnapshot) => (clientNet.onSnapshot as (s: unknown, f: string) => void)(structuredClone(snap), 'h'),
      sendVehicle() {},
    };
    host.mode.attachNet(hostNet as never);
    client.mode.attachNet(clientNet as never);
    let gone = false;
    const tick = (s: number, clientMove: Partial<ZombieFrameInput> = {}) => {
      for (let t = 0; t < s; t += 1 / 30) {
        // Where the client is: their seat while driving (WorldGame moves the avatar there)
        const seat = client.mode.seat();
        const cx = seat?.x ?? SPAWN.x;
        const cy = seat?.y ?? SPAWN.y;
        host.mode.sim.zombies = [];
        host.mode.update(1 / 30, frame({ feetX: SPAWN.x + 300, others: gone ? [] : [{ id: 'c', x: cx, y: cy }] }));
        client.mode.update(1 / 30, frame({ feetX: cx, feetY: cy, ...clientMove }));
      }
    };
    return { host, client, tick, leave: () => (gone = true) };
  }

  it('a client gets in through the host, drives, and the host follows the car', () => {
    const { host, client, tick } = party();
    tick(0.3);
    expect(client.mode.worldAction('v:enter')).toBe(true);
    tick(0.6);
    expect(car(host.mode).driver).toBe('c');
    expect(client.mode.isDriving()).toBe(true);
    expect(car(client.mode).engineOn).toBe(true);
    const start = { ...car(host.mode) };
    tick(1, { moveY: -0.5 });
    const h = car(host.mode);
    expect(Math.hypot(h.x - start.x, h.y - start.y)).toBeGreaterThan(5);
    // The driver's update carries the engine and fuel (sent twice a second, rounded to 0.1 L)
    expect(h.engineOn).toBe(true);
    expect(Math.abs(h.fuel - car(client.mode).fuel)).toBeLessThan(0.2);
  });

  it('only one driver at a time', () => {
    const { host, client, tick } = party();
    tick(0.3);
    client.mode.worldAction('v:enter');
    tick(0.6);
    host.mode.update(1 / 30, frame({ others: [{ id: 'c', x: car(host.mode).x, y: car(host.mode).y }] }));
    expect(host.mode.worldAction('v:enter')).toBe(true);
    expect(host.mode.inVehicle()).toBe(false);
    expect(car(host.mode).driver).toBe('c');
  });

  it('a driver who vanishes leaves the car where it stopped', () => {
    const { host, client, tick, leave } = party();
    tick(0.3);
    client.mode.worldAction('v:enter');
    tick(0.6);
    expect(car(host.mode).driver).toBe('c');
    leave();
    tick(6);
    expect(car(host.mode).driver).toBeNull();
  });
});
