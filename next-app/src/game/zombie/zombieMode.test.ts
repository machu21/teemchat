import { describe, expect, it } from 'vitest';
import { MAP_HEIGHT, MAP_WIDTH } from '../collision';
import { getBoundaryWallsForMap, getBuildingsForMap } from '../map/mapRegistry';
import { ZombieMode, ZombieFrameInput, PLAYER_MAX_HP, INTEREST_RADIUS } from './zombieMode';
import { DOOR_HP, Entrance } from './entrances';
import { ZombieDoorAction, ZombieShot, ZombieSnapshot, ZombieStrike, ZombieSyncService } from '../../lib/services/zombieSync';

// In-memory stand-in for the Realtime channel: delivers broadcasts synchronously.
class FakeBus {
  nets: FakeNet[] = [];
  hostId: string | null = null;
}

class FakeNet {
  onSnapshot?: (snap: ZombieSnapshot, from: string) => void;
  onStrike?: (strike: ZombieStrike, from: string) => void;
  constructor(private bus: FakeBus, readonly selfId: string) {
    bus.nets.push(this);
  }
  isReady() {
    return !!this.bus.hostId;
  }
  isHost() {
    return this.bus.hostId === this.selfId;
  }
  getHostId() {
    return this.bus.hostId;
  }
  memberCount() {
    return this.bus.nets.length;
  }
  isMember(id: string) {
    return this.bus.nets.some((n) => n.selfId === id);
  }
  sendSnapshot(snap: ZombieSnapshot) {
    for (const n of this.bus.nets) if (n !== this) n.onSnapshot?.(structuredClone(snap), this.selfId);
  }
  sendStrike(strike: ZombieStrike) {
    for (const n of this.bus.nets) if (n !== this && n.isHost()) n.onStrike?.({ ...strike }, this.selfId);
  }
  onDoor?: (door: ZombieDoorAction, from: string) => void;
  onShot?: (shot: ZombieShot, from: string) => void;
  onLoot?: (id: number, from: string) => void;
  sendShot(shot: ZombieShot) {
    for (const n of this.bus.nets) if (n !== this && n.isHost()) n.onShot?.(structuredClone(shot), this.selfId);
  }
  sendLoot(id: number) {
    for (const n of this.bus.nets) if (n !== this && n.isHost()) n.onLoot?.(id, this.selfId);
  }
  sendDoor(door: ZombieDoorAction) {
    for (const n of this.bus.nets) if (n !== this && n.isHost()) n.onDoor?.({ ...door }, this.selfId);
  }
}

const walls = getBoundaryWallsForMap('village');
const buildings = getBuildingsForMap('village');

function makeMode(bus: FakeBus, id: string, seed: number, entrances: Entrance[] = []) {
  const mode = new ZombieMode(walls, buildings, MAP_WIDTH, MAP_HEIGHT, seed, entrances);
  mode.attachNet(new FakeNet(bus, id) as unknown as ZombieSyncService);
  return mode;
}

const SPAWN = { x: 436, y: 328 };
const frame = (over: Partial<ZombieFrameInput> = {}): ZombieFrameInput => ({
  feetX: SPAWN.x,
  feetY: SPAWN.y,
  moveX: 0,
  moveY: 0,
  insideBuildingId: null,
  others: [],
  ...over,
});

function step(modes: [ZombieMode, ZombieFrameInput][], seconds: number) {
  for (let t = 0; t < seconds; t += 1 / 30) for (const [m, f] of modes) m.update(1 / 30, f);
}


describe('ZombieMode multiplayer', () => {
  it('only the host spawns; the client mirrors the same horde', () => {
    const bus = new FakeBus();
    bus.hostId = 'host';
    const host = makeMode(bus, 'host', 1);
    const client = makeMode(bus, 'client', 2);
    step([[host, frame()], [client, frame()]], 1);

    expect(host.getAuthority()).toBe('host');
    expect(client.getAuthority()).toBe('client');
    expect(host.sim.zombies.length).toBeGreaterThan(0);
    // Interest management: the client only receives zombies near some player
    const nearHost = host.sim.zombies.filter((z) => Math.hypot(z.x - SPAWN.x, z.y - SPAWN.y) <= INTEREST_RADIUS + 24);
    const mirrored = client.sim.zombies.map((z) => z.id);
    expect(mirrored.length).toBeGreaterThan(0);
    expect(mirrored.length).toBeLessThanOrEqual(host.sim.zombies.length);
    for (const z of nearHost) {
      if (Math.hypot(z.x - SPAWN.x, z.y - SPAWN.y) < INTEREST_RADIUS - 24) expect(mirrored).toContain(z.id);
    }
    for (const z of client.sim.zombies) {
      const h = host.sim.zombies.find((hz) => hz.id === z.id)!;
      expect(Math.hypot(h.x - z.x, h.y - z.y)).toBeLessThan(24);
    }
  });

  it("applies a client's strike on the host and credits the kill back to the client", () => {
    const bus = new FakeBus();
    bus.hostId = 'host';
    const host = makeMode(bus, 'host', 1);
    const client = makeMode(bus, 'client', 2);
    step([[host, frame()], [client, frame()]], 0.5);

    // Park a zombie right in front (south) of the client and make it nearly dead
    const target = host.sim.zombies[0];
    const clientFeet = { x: 900, y: 600 };
    target.x = clientFeet.x;
    target.y = clientFeet.y + 14;
    target.hp = 30;
    target.state = 'idle';
    target.timer = 99;
    step([[host, frame()], [client, frame({ feetX: clientFeet.x, feetY: clientFeet.y })]], 0.4);

    client.attack();
    step([[host, frame()], [client, frame({ feetX: clientFeet.x, feetY: clientFeet.y })]], 0.5);

    expect(host.sim.zombies.find((z) => z.id === target.id)).toBeUndefined();
    expect(client.sim.zombies.find((z) => z.id === target.id)).toBeUndefined();
    expect(client.kills).toBe(1);
    expect(host.kills).toBe(0);
  });

  it('delivers bites from the host to the bitten client only', () => {
    const bus = new FakeBus();
    bus.hostId = 'host';
    const host = makeMode(bus, 'host', 1);
    const client = makeMode(bus, 'client', 2);
    step([[host, frame()], [client, frame()]], 0.5);

    const clientFeet = { x: 900, y: 600 };
    const z = host.sim.zombies[0];
    z.x = clientFeet.x + 8;
    z.y = clientFeet.y;
    const hostFrame = frame({ feetX: 200, feetY: 900, others: [{ id: 'client', ...clientFeet }] });
    step([[host, hostFrame], [client, frame({ feetX: clientFeet.x, feetY: clientFeet.y })]], 2);

    expect(client.hp).toBeLessThan(PLAYER_MAX_HP);
  });

  it('a promoted client continues the existing horde instead of spawning a new one', () => {
    const bus = new FakeBus();
    bus.hostId = 'host';
    const host = makeMode(bus, 'host', 1);
    const client = makeMode(bus, 'client', 2);
    step([[host, frame()], [client, frame()]], 1);
    const ids = client.sim.zombies.map((z) => z.id);
    expect(ids.length).toBeGreaterThan(0);

    // Host leaves
    bus.nets = bus.nets.filter((n) => n.selfId !== 'host');
    bus.hostId = 'client';
    step([[client, frame()]], 0.2);

    expect(client.getAuthority()).toBe('host');
    // Every zombie the client already knew survives the handover (the trickle may add more)
    const after = client.sim.zombies.map((z) => z.id);
    for (const id of ids) expect(after).toContain(id);
  });

  it('plays solo when there is no network', () => {
    const solo = new ZombieMode(walls, buildings, MAP_WIDTH, MAP_HEIGHT, 3);
    solo.update(1 / 30, frame());
    expect(solo.getAuthority()).toBe('host');
    expect(solo.sim.zombies.length).toBeGreaterThan(0);
  });
});

describe('ZombieMode doors and barricades', () => {
  // The cottage doorway gap (x 164..204, y 180..196) holds a door at tile (11, 11)
  const door = (): Entrance => ({ id: 'cottage-door', kind: 'door', col: 11, row: 11, state: 'closed', planks: 0, hp: DOOR_HP });
  const doorBox = { x: 178, y: 178, w: 12, h: 12 };
  const clientFeet = { feetX: 184, feetY: 202 };

  function setup() {
    const bus = new FakeBus();
    bus.hostId = 'host';
    const host = makeMode(bus, 'host', 1, [door()]);
    const client = makeMode(bus, 'client', 2, [door()]);
    const hostFrame = frame({ others: [{ id: 'client', x: clientFeet.feetX, y: clientFeet.feetY }] });
    const clientFrame = frame(clientFeet);
    step([[host, hostFrame], [client, clientFrame]], 0.4);
    return { bus, host, client, hostFrame, clientFrame };
  }

  it('closed doors block the player; a client opens one optimistically and the host confirms', () => {
    const { host, client, hostFrame, clientFrame } = setup();
    expect(client.isBlocked(doorBox)).toBe(true);
    expect(client.doorAction('toggle')).toBe(true);
    expect(client.isBlocked(doorBox)).toBe(false);
    step([[host, hostFrame], [client, clientFrame]], 0.1);
    expect(host.isBlocked(doorBox)).toBe(false);
  });

  it('boarding up takes BARRICADE_SECONDS, syncs, and reaches late joiners', () => {
    const { bus, host, client, hostFrame, clientFrame } = setup();
    expect(client.doorAction('addPlank')).toBe(true);
    step([[host, hostFrame], [client, clientFrame]], 0.8);
    expect(host.sim.grid.entrances.values().next().value?.state).toBe('closed');
    step([[host, hostFrame], [client, clientFrame]], 1.2);
    const hostDoor = [...host.sim.grid.entrances.values()][0];
    expect(hostDoor.state).toBe('barricaded');
    expect(hostDoor.planks).toBe(1);

    const late = makeMode(bus, 'late', 3, [door()]);
    step([[host, hostFrame], [client, clientFrame], [late, frame()]], 6);
    expect([...late.sim.grid.entrances.values()][0].state).toBe('barricaded');
  });

  it('a host ignores door actions from players out of reach', () => {
    const { host, client, clientFrame } = setup();
    const farHostFrame = frame({ others: [{ id: 'client', x: 900, y: 600 }] });
    client.doorAction('toggle');
    step([[host, farHostFrame], [client, clientFrame]], 0.1);
    expect(host.isBlocked(doorBox)).toBe(true);
  });
});

describe('ZombieMode double doors', () => {
  it('opens and boards both leaves of a double door together', () => {
    const leaf = (col: number, id: string): Entrance => ({ id, kind: 'door', col, row: 11, state: 'closed', planks: 0, hp: DOOR_HP });
    const mode = new ZombieMode(walls, buildings, MAP_WIDTH, MAP_HEIGHT, 1, [leaf(10, 'front:door'), leaf(11, 'front:door:2')]);
    const f = frame({ feetX: 176, feetY: 202 });
    mode.update(1 / 30, f);
    const states = () => [...mode.sim.grid.entrances.values()].map((e) => e.state);
    expect(mode.doorAction('toggle')).toBe(true);
    expect(states()).toEqual(['open', 'open']);
    expect(mode.isBlocked({ x: 166, y: 178, w: 20, h: 12 })).toBe(false);
    mode.doorAction('toggle');
    mode.doorAction('addPlank');
    for (let t = 0; t < 2; t += 1 / 30) mode.update(1 / 30, f);
    expect(states()).toEqual(['barricaded', 'barricaded']);
  });
});

describe('ZombieMode weapons and loot', () => {
  const pistolAt = (x: number, y: number) => [{ id: 0, item: { kind: 'weapon' as const, weapon: 'pistol' as const }, x, y }];
  const ammoAt = (x: number, y: number) => [{ id: 1, item: { kind: 'ammo' as const, ammo: '9mm' as const }, x, y }];

  it('walking over a gun picks it up, equips it and loads half a magazine', () => {
    const mode = new ZombieMode(walls, buildings, MAP_WIDTH, MAP_HEIGHT, 1, [], [], pistolAt(SPAWN.x, SPAWN.y - 4));
    mode.update(1 / 30, frame());
    expect(mode.getWeapon()).toBe('pistol');
  });

  it('a host shot kills a zombie in the line of fire, spends ammo, and makes noise that draws others', () => {
    const mode = new ZombieMode(walls, buildings, MAP_WIDTH, MAP_HEIGHT, 1, [], [], [...pistolAt(SPAWN.x, SPAWN.y - 4), ...ammoAt(SPAWN.x, SPAWN.y - 4)]);
    mode.update(1 / 30, frame());
    mode.sim.zombies = mode.sim.zombies.slice(0, 2);
    const [target, listener] = mode.sim.zombies;
    // Target 60 px east at torso height, nearly dead; listener ~12 tiles away, idle
    target.x = SPAWN.x + 60;
    target.y = SPAWN.y - 12 + 10;
    target.hp = 30;
    listener.x = SPAWN.x;
    listener.y = SPAWN.y + 12 * 16;
    listener.state = 'idle';
    listener.timer = 99;
    mode.setAim(0);
    mode.setTrigger(true);
    mode.update(1 / 30, frame());
    mode.setTrigger(false);
    for (let i = 0; i < 10; i++) mode.update(1 / 30, frame());
    expect(mode.sim.zombies.find((z) => z.id === target.id)).toBeUndefined();
    expect(mode.kills).toBe(1);
    expect(['investigate', 'chase']).toContain(listener.state as string);
  });

  it("a client's shots are resolved by the host, credited back, and taken loot syncs", () => {
    const bus = new FakeBus();
    bus.hostId = 'host';
    const loot = [...pistolAt(900, 596), { id: 1, item: { kind: 'ammo' as const, ammo: '12ga' as const }, x: 300, y: 300 }];
    const host = makeModeWithLoot(bus, 'host', 1, loot);
    const client = makeModeWithLoot(bus, 'client', 2, loot);
    const clientFrame = frame({ feetX: 900, feetY: 600 });
    const hostFrame = frame({ others: [{ id: 'client', x: 900, y: 600 }] });
    step([[host, hostFrame], [client, clientFrame]], 0.5);
    expect(client.getWeapon()).toBe('pistol');

    // Host can see the client picked it up
    const late = makeModeWithLoot(bus, 'late', 3, loot);
    step([[host, hostFrame], [client, clientFrame], [late, frame()]], 0.5);
    expect(host['taken'].has(0)).toBe(true);
    expect(late['taken'].has(0)).toBe(true);

    const target = host.sim.zombies[0];
    target.x = 960;
    target.y = 600 - 12 + 10;
    target.hp = 30;
    target.state = 'idle';
    target.timer = 99;
    step([[host, hostFrame], [client, clientFrame]], 0.4);
    client.setAim(0);
    client.setTrigger(true);
    step([[host, hostFrame], [client, clientFrame]], 0.05);
    client.setTrigger(false);
    step([[host, hostFrame], [client, clientFrame]], 0.8);
    expect(host.sim.zombies.find((z) => z.id === target.id)).toBeUndefined();
    expect(client.kills).toBe(1);
  });

  it('dying drops every gun (the axe stays)', () => {
    const mode = new ZombieMode(walls, buildings, MAP_WIDTH, MAP_HEIGHT, 1, [], [], pistolAt(SPAWN.x, SPAWN.y - 4));
    mode.update(1 / 30, frame());
    expect(mode.getWeapon()).toBe('pistol');
    mode.vitals = { ...mode.vitals, health: 0 };
    mode.update(1 / 30, frame());
    expect(mode.getWeapon()).toBe('axe');
  });
});

function makeModeWithLoot(bus: FakeBus, id: string, seed: number, loot: import('./weapons').LootSpawn[]) {
  const mode = new ZombieMode(walls, buildings, MAP_WIDTH, MAP_HEIGHT, seed, [], [], loot);
  mode.attachNet(new FakeNet(bus, id) as unknown as ZombieSyncService);
  return mode;
}

describe('ZombieMode survival layer', () => {
  type Internals = { taken: Set<number>; elapsed: number };
  const internals = (m: ZombieMode) => m as unknown as Internals;
  const huds = (m: ZombieMode) => {
    const out: import('./zombieMode').ZombieHud[] = [];
    m.onHudChanged = (h) => out.push(h);
    return out;
  };

  it('picks supplies into the bag and C uses the one you need most', () => {
    const loot = [
      { id: 0, item: { kind: 'supply' as const, supply: 'water_bottle' as const }, x: SPAWN.x, y: SPAWN.y - 4 },
      { id: 1, item: { kind: 'supply' as const, supply: 'apple' as const }, x: SPAWN.x + 6, y: SPAWN.y - 4 },
    ];
    const mode = new ZombieMode(walls, buildings, MAP_WIDTH, MAP_HEIGHT, 1, [], [], loot);
    const seen = huds(mode);
    mode.update(1 / 30, frame());
    expect(seen.at(-1)?.supplies.map((s) => s.id).sort()).toEqual(['apple', 'water_bottle']);
    mode.vitals = { ...mode.vitals, hydration: 10, hunger: 80 };
    expect(mode.useSupply()).toBe(true);
    expect(mode.vitals.hydration).toBeCloseTo(50, 0);
    mode.update(1 / 30, frame({ feetX: SPAWN.x + 200 }));
    expect(seen.at(-1)?.supplies.map((s) => s.id)).toEqual(['apple']);
  });

  it('sprinting is faster until stamina runs out; hunger and thirst drain over time', () => {
    const mode = new ZombieMode(walls, buildings, MAP_WIDTH, MAP_HEIGHT, 1);
    mode.setSprint(true);
    mode.update(1 / 30, frame({ moveX: 1 }));
    expect(mode.moveMultiplier()).toBeGreaterThan(1.3);
    for (let i = 0; i < 30 * 9; i++) mode.update(1 / 30, frame({ moveX: 1 }));
    expect(mode.vitals.exhausted).toBe(true);
    expect(mode.moveMultiplier()).toBeLessThanOrEqual(1);
    expect(mode.vitals.hunger).toBeLessThan(100);
    expect(mode.vitals.hydration).toBeLessThan(mode.vitals.hunger);
  });

  it('starts at threat 0 and the client follows the host clock', () => {
    const bus = new FakeBus();
    bus.hostId = 'host';
    const host = makeMode(bus, 'host', 1);
    const client = makeMode(bus, 'client', 2);
    const seen = huds(client);
    step([[host, frame()], [client, frame()]], 0.5);
    expect(seen.at(-1)?.threat).toBe(0);
    internals(host).elapsed = 1000;
    step([[host, frame()], [client, frame()]], 1.2);
    expect(seen.at(-1)?.threat).toBe(5);
  });

  it('replicates specials and delivers a charger knockdown to the client it hits', () => {
    const bus = new FakeBus();
    bus.hostId = 'host';
    const host = makeMode(bus, 'host', 1);
    const client = makeMode(bus, 'client', 2);
    const clientFeet = { x: 900, y: 600 };
    const hostFrame = frame({ others: [{ id: 'client', ...clientFeet }] });
    const clientFrame = frame({ feetX: clientFeet.x, feetY: clientFeet.y });
    step([[host, hostFrame], [client, clientFrame]], 0.3);

    const c = host.director.spawn('charger', clientFeet.x - 70, clientFeet.y);
    c.state = 'chase';
    c.targetId = 'client';
    if (c.ability.kind === 'charge') Object.assign(c.ability, { phase: 'charging', timer: 1, dirX: 1, dirY: 0, cooldown: 0, hit: [] });
    c.locked = true;
    step([[host, hostFrame], [client, clientFrame]], 0.7);

    const replica = client.sim.zombies.find((z) => z.id === c.id) as import('./survival/types').ZombieEntity | undefined;
    expect(replica?.kind).toBe('charger');
    expect(client.vitals.effects.some((e) => e.kind === 'knockdown')).toBe(true);
    expect(client.hp).toBeLessThan(PLAYER_MAX_HP);
  });

  it('stores restock taken supplies for everyone after their timer', () => {
    const bus = new FakeBus();
    bus.hostId = 'host';
    const loot = [{ id: 0, item: { kind: 'supply' as const, supply: 'chips' as const }, x: SPAWN.x, y: SPAWN.y - 4, respawn: 2 }];
    const host = makeModeWithLoot(bus, 'host', 1, loot);
    const client = makeModeWithLoot(bus, 'client', 2, loot);
    const away = frame({ feetX: SPAWN.x + 300 });
    step([[host, frame()], [client, away]], 0.5);
    expect(internals(host).taken.has(0)).toBe(true);
    expect(internals(client).taken.has(0)).toBe(true);
    step([[host, away], [client, away]], 3);
    expect(internals(host).taken.has(0)).toBe(false);
    expect(internals(client).taken.has(0)).toBe(false);
  });
});
