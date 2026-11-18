import { describe, expect, it } from 'vitest';
import { MAP_HEIGHT, MAP_WIDTH } from '../collision';
import { getBoundaryWallsForMap, getBuildingsForMap } from '../map/mapRegistry';
import { ZombieMode, type ZombieFrameInput, type ZombieHud } from './zombieMode';
import { STRUCTURE_KINDS } from './survival/structures';
import { validatePlayerSave, validateWorldSave } from './persistence';
import { PRESETS } from './survival/balance';
import { GAME_DAY_SECONDS } from './survival/daycycle';
import type { VehicleSystem } from './vehicleSystem';
import type { ZombieBuildOp, ZombieSnapshot, ZombieStrike } from '../../lib/services/zombieSync';

// Phase 9 through the real ZombieMode: world and survivor save / load, rules, multiplayer sleep, limits.

const walls = getBoundaryWallsForMap('village');
const buildings = getBuildingsForMap('village');
const SPAWN = { x: 436, y: 328 };
const COLS = Math.ceil(MAP_WIDTH / 16);
const EAST = Math.floor((SPAWN.y - 4) / 16) * COLS + Math.floor((SPAWN.x + 16) / 16);
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
  bag: { items: { uid: string; def: string; qty: number }[] };
  built: Map<number, { kind: string; state?: number[] }>;
  vehicles: VehicleSystem;
  taken: Set<number>;
  elapsed: number;
  clockSkip: number;
  vitals: { health: number; hunger: number };
  remoteBuild: { op: ZombieBuildOp; from: string }[];
  placeStructure(kind: string, tile: number, owner: string): boolean;
};
const p = (m: ZombieMode) => m as unknown as Priv;

function makeMode() {
  const mode = new ZombieMode(walls, buildings, MAP_WIDTH, MAP_HEIGHT, 1, []);
  let hud: ZombieHud | null = null;
  mode.onHudChanged = (h) => (hud = h);
  mode.setWorld(9, []);
  mode.setVehicles([{ id: 0, kind: 'sedan', variant: 2, x: 300, y: 600, angle: 0 }], 3);
  return { mode, hud: () => hud! };
}

function step(mode: ZombieMode, seconds: number, over: Partial<ZombieFrameInput> = {}) {
  for (let t = 0; t < seconds; t += 1 / 30) mode.update(1 / 30, frame(over));
}

/** Through JSON, like the database does. */
const viaJson = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

describe('world save and load', () => {
  it('a fresh host picks up the saved world: clock, zombies, structures, cars, taken loot', () => {
    const a = makeMode().mode;
    step(a, 1);
    a.sim.zombies = [];
    for (let i = 0; i < 12; i++) a.sim.add(600 + i * 20, 900);
    expect(p(a).placeStructure('generator', EAST, 'x')).toBe(true);
    p(a).built.get(EAST)!.state = [42, 1, 77];
    const car = p(a).vehicles.get(0)!;
    p(a).vehicles.set({ ...car, x: 340, fuel: 12.5, parts: { ...car.parts, engine: 33 } });
    p(a).taken.add(3);
    p(a).elapsed = 4000;
    p(a).clockSkip = 900;
    const save = validateWorldSave(viaJson(a.exportWorld()))!;
    expect(save).not.toBeNull();
    expect(save.snap.z).toHaveLength(12);
    // Small enough for one database row
    expect(JSON.stringify(save).length).toBeLessThan(200_000);

    const b = makeMode().mode;
    b.offerWorldSave(save);
    b.update(1 / 30, frame());
    // Every saved zombie is back where it was (the host may top the horde up as usual)
    for (const row of save.snap.z) {
      const z = b.sim.zombies.find((o) => o.id === row[0]);
      expect(z).toBeDefined();
      expect(Math.abs(z!.x - row[1])).toBeLessThan(4);
    }
    expect(p(b).built.get(EAST)).toMatchObject({ kind: 'generator', state: [42, 1, 77] });
    expect(p(b).vehicles.get(0)).toMatchObject({ x: 340, fuel: 12.5 });
    expect(p(b).vehicles.get(0)!.parts.engine).toBe(33);
    expect(p(b).taken.has(3)).toBe(true);
    expect(Math.round(p(b).elapsed)).toBe(4000);
    expect(p(b).clockSkip).toBe(900);
    // The loaded world is "changed" for the next save, which carries it all again
    const again = b.exportWorld();
    expect(again.snap.bs).toHaveLength(1);
    expect(again.snap.vh).toHaveLength(1);
  });

  it('a save never replaces a world someone is already running', () => {
    const host = makeMode().mode;
    const client = makeMode().mode;
    const clientNet: Record<string, unknown> = { selfId: 'c', isReady: () => true, isHost: () => false, getHostId: () => 'h', isMember: () => true, memberCount: () => 2, sendLoot() {}, sendShot() {}, sendDoor() {}, sendSnapshot() {}, sendStrike() {}, sendBuild() {}, sendVehicle() {} };
    const hostNet = { ...clientNet, selfId: 'h', isHost: () => true, sendSnapshot: (s: ZombieSnapshot) => (clientNet.onSnapshot as (s: unknown, f: string) => void)(viaJson(s), 'h') };
    host.attachNet(hostNet as never);
    client.attachNet(clientNet as never);
    for (let i = 0; i < 30; i++) {
      host.update(1 / 30, frame());
      client.update(1 / 30, frame());
    }
    const old = makeMode().mode;
    expect(p(old).placeStructure('crate', EAST, 'x')).toBe(true);
    client.offerWorldSave(validateWorldSave(viaJson(old.exportWorld()))!);
    client.update(1 / 30, frame());
    expect(p(client).built.size).toBe(0);
  });
});

describe('survivor save and load', () => {
  it('your survivor comes back as you left them; death is reported once', () => {
    const a = makeMode().mode;
    a.createSurvivor({ name: 'Ana', occupation: 'carpenter', traits: [] });
    step(a, 0.2);
    a.skills = { ...a.skills, cooking: { level: 4, xp: 12 } };
    p(a).vitals = { ...p(a).vitals, health: 63, hunger: 41 };
    p(a).bag = { ...p(a).bag, items: [...p(a).bag.items, { uid: 'x', def: 'planks', qty: 7 }] } as never;
    p(a).owned.add('pistol');
    const save = validatePlayerSave(viaJson(a.exportPlayer()))!;
    expect(save.pos).toEqual({ x: SPAWN.x, y: SPAWN.y });

    const b = makeMode().mode;
    b.setRequireCharacterCreation(true);
    expect(b.importPlayer(save)).toBe(true);
    expect(b.survivor).toMatchObject({ name: 'Ana', occupation: 'carpenter' });
    expect(b.skills.cooking).toEqual({ level: 4, xp: 12 });
    expect(p(b).vitals.health).toBe(63);
    expect(p(b).bag.items.find((i) => i.def === 'planks')?.qty).toBe(7);
    expect(p(b).owned.has('pistol')).toBe(true);
    // Only into a survivor-less session
    expect(b.importPlayer(save)).toBe(false);

    p(b).vitals = { ...p(b).vitals, health: 0 };
    b.update(1 / 30, frame());
    expect(b.takeDeath()).toBe(true);
    expect(b.takeDeath()).toBe(false);
    expect(b.exportPlayer()).toBeNull();
  });

  it('while the save is being fetched the creator waits', () => {
    const { mode, hud } = makeMode();
    mode.setRequireCharacterCreation(true);
    mode.setLoadingSurvivor(true);
    step(mode, 0.05);
    expect(hud()).toMatchObject({ creating: false, loadingSurvivor: true });
    mode.setLoadingSurvivor(false);
    step(mode, 0.05);
    expect(hud()).toMatchObject({ creating: true, loadingSurvivor: false });
  });
});

describe('rules in play', () => {
  it('hardcore drains hunger faster and time speed runs the clock faster (host)', () => {
    const normal = makeMode().mode;
    const hard = makeMode().mode;
    hard.setRules(PRESETS.hardcore);
    step(normal, 10);
    step(hard, 10);
    expect(p(hard).vitals.hunger).toBeLessThan(p(normal).vitals.hunger);
    const fast = makeMode().mode;
    fast.setRules({ ...PRESETS.normal, preset: 'custom', timeSpeed: 3 });
    step(fast, 2);
    expect(p(fast).clockSkip).toBeGreaterThan(3.5);
    expect((p(fast).clockSkip / GAME_DAY_SECONDS) * 24).toBeGreaterThan(0);
  });

  it("the host's rules reach clients, who play by them", () => {
    const host = makeMode().mode;
    const { mode: client, hud } = makeMode();
    const clientNet: Record<string, unknown> = { selfId: 'c', isReady: () => true, isHost: () => false, getHostId: () => 'h', isMember: () => true, memberCount: () => 2, sendLoot() {}, sendShot() {}, sendDoor() {}, sendSnapshot() {}, sendStrike() {}, sendBuild() {}, sendVehicle() {} };
    const hostNet = { ...clientNet, selfId: 'h', isHost: () => true, sendSnapshot: (s: ZombieSnapshot) => (clientNet.onSnapshot as (s: unknown, f: string) => void)(viaJson(s), 'h') };
    host.attachNet(hostNet as never);
    client.attachNet(clientNet as never);
    host.setRules(PRESETS.survival);
    for (let i = 0; i < 30; i++) {
      host.update(1 / 30, frame({ others: [{ id: 'c', x: SPAWN.x, y: SPAWN.y }] }));
      client.update(1 / 30, frame());
    }
    expect(hud().rules).toEqual(PRESETS.survival);
    expect(client.getRules().preset).toBe('survival');
  });
});

describe('multiplayer', () => {
  function party() {
    const host = makeMode();
    const client = makeMode();
    const clientNet: Record<string, unknown> = {
      selfId: 'c', isReady: () => true, isHost: () => false, getHostId: () => 'h', isMember: () => true, memberCount: () => 2,
      sendLoot() {}, sendShot() {}, sendDoor() {}, sendSnapshot() {}, sendVehicle() {},
      sendStrike: (s: ZombieStrike) => (hostNet.onStrike as (s: ZombieStrike, f: string) => void)(s, 'c'),
      sendBuild: (op: ZombieBuildOp) => (hostNet.onBuild as (o: ZombieBuildOp, f: string) => void)(viaJson(op), 'c'),
    };
    const hostNet: Record<string, unknown> = {
      ...clientNet, selfId: 'h', isHost: () => true,
      sendSnapshot: (s: ZombieSnapshot) => (clientNet.onSnapshot as (s: unknown, f: string) => void)(viaJson(s), 'h'),
    };
    host.mode.attachNet(hostNet as never);
    client.mode.attachNet(clientNet as never);
    const tick = (s: number) => {
      for (let t = 0; t < s; t += 1 / 30) {
        host.mode.sim.zombies = [];
        host.mode.update(1 / 30, frame({ others: [{ id: 'c', x: SPAWN.x + 40, y: SPAWN.y }] }));
        client.mode.update(1 / 30, frame({ feetX: SPAWN.x + 40 }));
      }
    };
    return { host, client, tick, hostNet };
  }

  it('time only speeds up once every survivor sleeps', () => {
    const { host, client, tick } = party();
    host.mode.condition = { ...host.mode.condition, fatigue: 90 };
    client.mode.condition = { ...client.mode.condition, fatigue: 90 };
    tick(0.2);
    host.mode.sleepAction();
    tick(2);
    expect(p(host.mode).clockSkip).toBeLessThan(1);
    expect(host.hud().sleepers).toEqual({ asleep: 1, total: 2 });
    client.mode.sleepAction();
    tick(2);
    expect(p(host.mode).clockSkip).toBeGreaterThan(30);
    expect(client.hud().sleepers).toEqual({ asleep: 2, total: 2 });
  });

  it('a client flooding the host with build requests gets cut off', () => {
    const { host, tick, hostNet } = party();
    tick(0.1);
    const onBuild = hostNet.onBuild as (o: ZombieBuildOp, f: string) => void;
    for (let i = 0; i < 100; i++) onBuild({ r: i, o: 'b', k: STRUCTURE_KINDS.indexOf('crate'), t: EAST }, 'c');
    expect(p(host.mode).remoteBuild.length).toBeLessThan(20);
    expect(host.mode.netStats().droppedRequests).toBeGreaterThan(80);
  });
});
