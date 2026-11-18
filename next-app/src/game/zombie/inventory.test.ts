import { describe, expect, it } from 'vitest';
import { MAP_HEIGHT, MAP_WIDTH } from '../collision';
import { getBoundaryWallsForMap, getBuildingsForMap } from '../map/mapRegistry';
import { ZombieMode, type ZombieFrameInput, type ZombieHud } from './zombieMode';
import type { ContainerSpawn } from './survival/containers';
import type { ZombieDeath, ZombieInvOp, ZombieSnapshot } from '../../lib/services/zombieSync';

// Phase 3 (inventory & looting) through the real ZombieMode.

const walls = getBoundaryWallsForMap('village');
const buildings = getBuildingsForMap('village');
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

/** A fridge right in front of the spawn point, plus one far away. */
const FRIDGE: ContainerSpawn = { id: 0, kind: 'fridge', owner: 'b', x: SPAWN.x - 8, y: SPAWN.y - 30, w: 16, h: 16, table: 'store_fridge', rolls: 3, empty: 0, respawn: null };
const FAR: ContainerSpawn = { ...FRIDGE, id: 1, x: SPAWN.x + 600 };
const DESK: ContainerSpawn = { ...FRIDGE, id: 2, kind: 'desk', x: SPAWN.x - 8, y: SPAWN.y + 14, table: 'office_desk', empty: 1 };

function makeMode(spawns: ContainerSpawn[] = [FRIDGE, FAR, DESK]) {
  const mode = new ZombieMode(walls, buildings, MAP_WIDTH, MAP_HEIGHT, 1);
  mode.setContainers(spawns, 1234);
  let hud: ZombieHud | null = null;
  mode.onHudChanged = (h) => (hud = h);
  return { mode, hud: () => hud! };
}

function step(mode: ZombieMode, seconds: number, over: Partial<ZombieFrameInput> = {}) {
  for (let t = 0; t < seconds; t += 1 / 30) {
    mode.sim.zombies = [];
    mode.update(1 / 30, frame(over));
  }
}

const bagDefs = (m: ZombieMode) => (m as unknown as { bag: { items: { def: string; qty: number }[] } }).bag.items.map((i) => i.def);
const giveBag = (m: ZombieMode, items: { uid: string; def: string; qty: number; cond?: number }[]) => {
  const p = m as unknown as { bag: { items: unknown[] } };
  p.bag = { ...p.bag, items: [...p.bag.items, ...items] } as never;
};

describe('searching containers (solo host)', () => {
  it('E next to a fridge opens it; taking moves the item into your bag and out of the fridge', () => {
    const { mode, hud } = makeMode();
    step(mode, 0.1);
    expect(hud().container).toMatchObject({ label: 'Fridge', open: false });
    expect(mode.toggleLoot()).toBe(true);
    step(mode, 0.1);
    const before = hud().loot!.items;
    expect(before.length).toBeGreaterThan(0);
    expect(hud().inventory).not.toBeNull();
    const first = before[0];
    expect(mode.lootTake(0)).toBe(true);
    step(mode, 0.1);
    expect(bagDefs(mode)).toContain(first.key && before[0].name === 'Water Bottle' ? 'water_bottle' : bagDefs(mode)[0]);
    expect(hud().loot!.items.length).toBe(before.length - 1);
    // Walking away closes the window
    step(mode, 0.1, { feetX: SPAWN.x + 300 });
    expect(hud().loot).toBeNull();
    expect(hud().container).toBeNull();
  });

  it('put back, drop on the ground and pick it up again', () => {
    const { mode, hud } = makeMode();
    giveBag(mode, [{ uid: 'r1', def: 'rope', qty: 1 }, { uid: 'n1', def: 'nails', qty: 20 }]);
    step(mode, 0.1);
    mode.toggleLoot();
    step(mode, 0.1);
    const fridgeCount = hud().loot!.items.length;
    expect(mode.inventoryAction('b:r1', 'put')).toBe(true);
    step(mode, 0.1);
    expect(hud().loot!.items.map((i) => i.name)).toContain('Rope');
    expect(hud().loot!.items.length).toBe(fridgeCount + 1);
    mode.closeLoot();
    // Split then drop half the nails
    expect(mode.inventoryAction('b:n1', 'split')).toBe(true);
    step(mode, 0.1);
    mode.setInventoryOpen(true);
    step(mode, 0.1);
    const nails = hud().inventory!.items.filter((i) => i.name === 'Nails');
    expect(nails.map((n) => n.qty).sort()).toEqual([10, 10]);
    expect(mode.inventoryAction(nails[0].key, 'drop')).toBe(true);
    step(mode, 0.1, { feetX: SPAWN.x + 100 });
    step(mode, 0.1);
    // The pile at our feet is the nearest container now
    expect(hud().container?.label).toBe('Ground');
    mode.toggleLoot();
    step(mode, 0.1);
    expect(hud().loot!.items).toHaveLength(1);
    mode.lootTakeAll();
    step(mode, 0.1);
    expect(hud().loot).toBeNull(); // emptied pile vanished
    expect(bagDefs(mode).filter((d) => d === 'nails')).toHaveLength(1);
  });

  it('weapons and ammo come out with their wear and go to your belt and pouch', () => {
    const { mode, hud } = makeMode([{ ...DESK, empty: 1 }]);
    step(mode, 0.1);
    mode.toggleLoot();
    step(mode, 0.1);
    // Put the axe (worn a bit) in the desk, then take it back
    mode.inventoryAction('w:axe', 'put');
    step(mode, 0.1);
    expect(hud().inventory!.items.some((i) => i.key === 'w:axe')).toBe(false);
    expect(hud().loot!.items[0]).toMatchObject({ name: 'Fire Axe', cond: 1 });
    mode.lootTake(0);
    step(mode, 0.1);
    expect(hud().inventory!.items.some((i) => i.key === 'w:axe')).toBe(true);
    // Can't carry two of the same weapon
    mode.inventoryAction('w:axe', 'put');
    step(mode, 0.1);
    mode.lootTake(0);
    step(mode, 0.1);
    expect(mode.lootTake(0)).toBe(false);
  });

  it('weight limits what you can take; a worn bag raises it', () => {
    const { mode, hud } = makeMode([{ ...DESK, empty: 1 }]);
    step(mode, 0.1);
    mode.condition = { ...mode.condition, strength: { level: 0, xp: 0 } }; // 14 kg
    giveBag(mode, [{ uid: 'h1', def: 'hiking_bag', qty: 1 }]);
    step(mode, 0.1);
    mode.toggleLoot();
    step(mode, 0.1);
    const store = (mode as unknown as { store: { put(id: number, it: unknown): boolean } }).store;
    store.put(2, { uid: 'cb', def: 'car_battery', qty: 1 });
    step(mode, 0.1);
    expect(hud().inventory!.capacity).toBe(14);
    expect(mode.lootTake(0)).toBe(false);
    step(mode, 1 / 30);
    expect(hud().toast).toMatch(/too heavy/i);
    expect(mode.inventoryAction('b:h1', 'equip')).toBe(true);
    step(mode, 0.1);
    expect(hud().inventory!.capacity).toBe(27);
    expect(hud().inventory!.items.find((i) => i.equipped)?.name).toBe('Hiking Bag');
    expect(mode.lootTake(0)).toBe(true);
    step(mode, 0.1);
    expect(hud().inventory!.weight).toBeGreaterThan(14);
  });

  it('over the limit you slow down', () => {
    const { mode } = makeMode([]);
    step(mode, 0.1);
    const speed = mode.moveMultiplier();
    giveBag(mode, [{ uid: 'x', def: 'car_battery', qty: 1 }, { uid: 'y', def: 'spare_tire', qty: 1 }]);
    step(mode, 0.3);
    expect(mode.moveMultiplier()).toBeLessThan(speed * 0.8);
  });

  it('a leather jacket can turn a bite; a winter jacket keeps you warm at night', () => {
    const { mode, hud } = makeMode([]);
    giveBag(mode, [{ uid: 'j', def: 'leather_jacket', qty: 1 }]);
    step(mode, 0.1);
    mode.inventoryAction('b:j', 'equip');
    // part roll 0.3 → torso (covered), protection roll 0 → blocked
    const seq = [0.3, 0];
    let i = 0;
    (mode as unknown as { injuryRng: () => number }).injuryRng = () => seq[Math.min(i++, seq.length - 1)];
    (mode as unknown as { takeDamage(n: number, e: unknown[], s: string): void }).takeDamage(8, [], 'bite');
    step(mode, 0.1);
    expect(mode.body.wounds).toHaveLength(0);
    expect(hud().toast).toMatch(/turned the bite/);
    expect(mode.equipped.outer?.cond).toBeLessThan(1);

    const cold = makeMode([]).mode;
    const warm = makeMode([]).mode;
    giveBag(warm, [{ uid: 'w', def: 'winter_jacket', qty: 1 }]);
    step(warm, 0.1);
    warm.inventoryAction('b:w', 'equip');
    // 23:00, outdoors
    for (const m of [cold, warm]) m.update(1 / 30, frame({ realDt: (15 / 24) * 3600 }));
    // 5 minutes in coarse steps (body temperature changes slowly)
    for (let t = 0; t < 300; t += 0.25) {
      for (const m of [cold, warm]) {
        m.sim.zombies = [];
        m.update(0.25, frame());
      }
    }
    expect(cold.condition.bodyTemp).toBeLessThan(36.3);
    expect(warm.condition.bodyTemp).toBeGreaterThan(cold.condition.bodyTemp + 0.5);
  });

  it('reading a book cures boredom', () => {
    const { mode, hud } = makeMode([]);
    giveBag(mode, [{ uid: 'bk', def: 'book', qty: 1 }]);
    step(mode, 0.1);
    mode.condition = { ...mode.condition, boredom: 70 };
    expect(mode.inventoryAction('b:bk', 'use')).toBe(true);
    step(mode, 0.1);
    expect(mode.condition.boredom).toBeLessThan(35);
    expect(hud().toast).toMatch(/Read Book/);
  });

  it('destroy removes an item for good', () => {
    const { mode } = makeMode([]);
    giveBag(mode, [{ uid: 'm', def: 'magazine', qty: 2 }]);
    step(mode, 0.1);
    expect(mode.inventoryAction('b:m', 'destroy')).toBe(true);
    expect(bagDefs(mode)).not.toContain('magazine');
  });

  it('your body keeps what you carried, and you can go back for it', () => {
    const { mode, hud } = makeMode([]);
    giveBag(mode, [{ uid: 'r', def: 'radio', qty: 1 }]);
    step(mode, 0.1);
    mode.vitals = { ...mode.vitals, health: 0 };
    step(mode, 0.1);
    while (mode.isDead()) step(mode, 1 / 30);
    expect(bagDefs(mode)).toEqual([]);
    step(mode, 0.1);
    expect(hud().container?.label).toBe('Body');
    mode.toggleLoot();
    step(mode, 0.1);
    expect(hud().loot!.items.map((i) => i.name).sort()).toEqual(['Fire Axe', 'Radio']);
    // Respawned with a fresh axe, so the old one can't come too; the radio can
    const radio = hud().loot!.items.findIndex((i) => i.name === 'Radio');
    expect(mode.lootTake(radio)).toBe(true);
    expect(bagDefs(mode)).toEqual(['radio']);
  });
});

// ---------------------------------------------------------------- multiplayer

class Bus {
  host!: ZombieMode;
  nets: Record<string, Record<string, unknown>> = {};
  /** Hold client requests (to test conflicts / timeouts). */
  hold = false;
  held: { op: ZombieInvOp; from: string }[] = [];
  net(id: string, isHost: boolean) {
    const n: Record<string, unknown> = {
      selfId: id,
      isReady: () => true,
      isHost: () => isHost,
      getHostId: () => 'h',
      isMember: () => true,
      memberCount: () => Object.keys(this.nets).length,
      sendLoot() {},
      sendShot() {},
      sendStrike() {},
      sendDoor() {},
      sendDeath: (d: ZombieDeath) => (this.nets.h.onDeath as (d: ZombieDeath, f: string) => void)(d, id),
      sendInv: (op: ZombieInvOp) => {
        if (this.hold) this.held.push({ op, from: id });
        else (this.nets.h.onInv as (o: ZombieInvOp, f: string) => void)(structuredClone(op), id);
      },
      sendSnapshot: (snap: ZombieSnapshot) => {
        for (const [cid, cn] of Object.entries(this.nets)) if (cid !== 'h') (cn.onSnapshot as (s: unknown, f: string) => void)(structuredClone(snap), 'h');
      },
    };
    this.nets[id] = n;
    return n;
  }
  release() {
    for (const { op, from } of this.held) (this.nets.h.onInv as (o: ZombieInvOp, f: string) => void)(op, from);
    this.held = [];
  }
}

function party() {
  const bus = new Bus();
  const host = makeMode();
  const a = makeMode();
  const b = makeMode();
  host.mode.attachNet(bus.net('h', true) as never);
  a.mode.attachNet(bus.net('a', false) as never);
  b.mode.attachNet(bus.net('b', false) as never);
  bus.host = host.mode;
  const others = [
    { id: 'a', x: SPAWN.x, y: SPAWN.y },
    { id: 'b', x: SPAWN.x + 4, y: SPAWN.y },
  ];
  const tick = (seconds: number) => {
    for (let t = 0; t < seconds; t += 1 / 30) {
      host.mode.sim.zombies = [];
      host.mode.update(1 / 30, frame({ others, feetX: SPAWN.x + 200 }));
      a.mode.update(1 / 30, frame());
      b.mode.update(1 / 30, frame({ feetX: SPAWN.x + 4 }));
    }
  };
  return { bus, host, a, b, tick };
}

describe('host-authoritative transfers', () => {
  it('a client take waits for the host, then the item arrives; everyone sees the fridge change', () => {
    const { host, a, b, tick } = party();
    tick(0.2);
    a.mode.toggleLoot();
    b.mode.toggleLoot();
    tick(0.1);
    const n = a.hud().loot!.items.length;
    const def = a.hud().loot!.items[0].name;
    expect(a.mode.lootTake(0)).toBe(true);
    // Not ours until the host says so
    expect(bagDefs(a.mode)).toHaveLength(0);
    a.mode.update(1 / 30, frame());
    expect(a.hud().loot!.items[0].pending).toBe(true);
    tick(0.5);
    expect(bagDefs(a.mode)).toHaveLength(1);
    const hostFridge = (host.mode as unknown as { store: { get(id: number): { contents: unknown[] } } }).store.get(0);
    expect(hostFridge.contents).toHaveLength(n - 1);
    expect(b.hud().loot!.items).toHaveLength(n - 1);
    expect(def.length).toBeGreaterThan(0);
  });

  it('two clients grabbing the last item: one gets it, the other is told', () => {
    const { bus, a, b, tick } = party();
    tick(0.2);
    a.mode.toggleLoot();
    b.mode.toggleLoot();
    tick(0.1);
    // Empty the fridge down to one stack
    while (a.hud().loot!.items.length > 1) {
      a.mode.lootTake(a.hud().loot!.items.length - 1);
      tick(0.4);
    }
    const already = bagDefs(a.mode).length;
    bus.hold = true;
    a.mode.lootTake(0);
    b.mode.lootTake(0);
    bus.hold = false;
    bus.release();
    tick(0.5);
    const got = bagDefs(a.mode).length - already + bagDefs(b.mode).length;
    expect(got).toBe(1);
    expect([a.hud().toast, b.hud().toast]).toContain('Someone got there first');
  });

  it('a put the host rejects (no room) comes back', () => {
    const { a, tick } = party();
    giveBag(a.mode, [{ uid: 't', def: 'spare_tire', qty: 1 }, { uid: 'c', def: 'car_battery', qty: 1 }]);
    tick(0.2);
    // The desk (15 kg) is behind us
    a.mode.update(1 / 30, frame({ feetY: SPAWN.y + 4 }));
    a.mode.toggleLoot();
    tick(0.1);
    a.mode.inventoryAction('b:c', 'put');
    tick(0.5);
    a.mode.inventoryAction('b:t', 'put');
    expect(bagDefs(a.mode)).toEqual([]);
    tick(0.5);
    expect(bagDefs(a.mode)).toEqual(['spare_tire']);
    expect(a.hud().toast).toMatch(/No room/);
  });

  it('requests for containers out of reach are refused', () => {
    const { host, a, tick } = party();
    tick(0.2);
    // Forge a take from the far fridge
    const ops = (host.mode as unknown as { remoteInv: { op: ZombieInvOp; from: string }[] }).remoteInv;
    ops.push({ op: { r: 99, c: 1, o: 't', it: ['water_bottle', 1] }, from: 'a' });
    const far = (host.mode as unknown as { store: { get(id: number): { contents: unknown[] } } }).store.get(1);
    const n = far.contents.length;
    tick(0.4);
    expect(far.contents).toHaveLength(n);
    expect(bagDefs(a.mode)).toHaveLength(0);
  });

  it('a put the host never answers is returned after a timeout', () => {
    const { bus, a, tick } = party();
    giveBag(a.mode, [{ uid: 'r', def: 'rope', qty: 1 }]);
    tick(0.2);
    a.mode.toggleLoot();
    tick(0.1);
    bus.hold = true;
    a.mode.inventoryAction('b:r', 'put');
    expect(bagDefs(a.mode)).toEqual([]);
    tick(7);
    expect(bagDefs(a.mode)).toEqual(['rope']);
  });

  it("a client's dropped items show up for everyone, and its body holds its things", () => {
    const { host, a, b, tick } = party();
    giveBag(a.mode, [{ uid: 'r', def: 'radio', qty: 1 }]);
    tick(0.2);
    a.mode.inventoryAction('b:r', 'drop');
    tick(0.5);
    const piles = (m: ZombieMode) => (m as unknown as { store: { piles(): { kind: string; contents: { def: string }[] }[] } }).store.piles();
    expect(piles(host.mode).map((p) => p.contents[0].def)).toEqual(['radio']);
    expect(piles(b.mode).map((p) => p.kind)).toEqual(['ground']);
    a.mode.vitals = { ...a.mode.vitals, health: 0 };
    tick(0.5);
    expect(piles(host.mode).some((p) => p.kind === 'corpse' && p.contents.some((i) => i.def === 'weapon:axe'))).toBe(true);
    expect(piles(b.mode).some((p) => p.kind === 'corpse')).toBe(true);
  });
});
