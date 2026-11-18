import { describe, expect, it } from 'vitest';
import { MAP_HEIGHT, MAP_WIDTH } from '../collision';
import { getBoundaryWallsForMap, getBuildingsForMap } from '../map/mapRegistry';
import { ZombieMode, type ZombieFrameInput, type ZombieHud } from './zombieMode';
import { DOOR_HP, type Entrance } from './entrances';
import { TILE_OPAQUE, TILE_SOLID } from './grid';
import { STRUCTURE_KINDS } from './survival/structures';
import type { ZombieBuildOp, ZombieSnapshot, ZombieStrike } from '../../lib/services/zombieSync';

// Phase 5 (crafting, building, safehouses) through the real ZombieMode.

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

function makeMode(entrances: Entrance[] = []) {
  const mode = new ZombieMode(walls, buildings, MAP_WIDTH, MAP_HEIGHT, 1, entrances);
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

type Priv = {
  owned: Set<string>;
  bag: { items: { uid: string; def: string; qty: number }[] };
  built: Map<number, { kind: string; container?: number }>;
  remoteBuild: { op: ZombieBuildOp; from: string }[];
  pendingNoises: { radius: number }[];
  claims: Map<string, { owner: string }>;
};
const p = (m: ZombieMode) => m as unknown as Priv;
const give = (m: ZombieMode, items: Record<string, number>, weapons: string[] = []) => {
  const x = p(m);
  for (const w of weapons) x.owned.add(w);
  x.bag = { ...x.bag, items: [...x.bag.items, ...Object.entries(items).map(([def, qty], i) => ({ uid: `g${def}${i}`, def, qty }))] } as never;
};
const count = (m: ZombieMode, def: string) => p(m).bag.items.filter((i) => i.def === def).reduce((s, i) => s + i.qty, 0);
const skilled = (m: ZombieMode, skill: 'carpentry' | 'metalworking' | 'electrical', level: number) => {
  m.skills = { ...m.skills, [skill]: { level, xp: 0 } };
};
/** The tile east of the spawn (facing east). */
const EAST = (() => {
  const col = Math.floor((SPAWN.x + 16) / 16);
  const row = Math.floor((SPAWN.y - 4) / 16);
  return { col, row, tile: row * Math.ceil(MAP_WIDTH / 16) + col };
})();

/** Places and builds one structure on the tile east of the spawn. */
function buildEast(mode: ZombieMode, recipe: 'wood_wall' | 'crate' | 'workbench' | 'fence') {
  mode.setAim(0);
  step(mode, 0.05);
  expect(mode.craft(recipe)).toBe(true);
  expect(mode.isPlacing()).toBe(true);
  step(mode, 0.05);
  expect(mode.confirmPlacement()).toBe(true);
  step(mode, 10);
}

describe('crafting items', () => {
  it('tearing a hoodie into rags takes a moment, spends the hoodie and trains Tailoring', () => {
    const { mode, hud } = makeMode();
    give(mode, { hoodie: 1 });
    step(mode, 0.1);
    expect(mode.craft('tear_rags')).toBe(true);
    step(mode, 0.5);
    expect(hud().build.progress?.label).toBe('Rip into rags');
    step(mode, 3);
    expect(count(mode, 'hoodie')).toBe(0);
    expect(count(mode, 'rags')).toBe(4);
    expect(mode.skills.tailoring.xp).toBeGreaterThan(0);
  });

  it('walking away interrupts and keeps the materials', () => {
    const { mode } = makeMode();
    give(mode, { hoodie: 1 });
    step(mode, 0.1);
    mode.craft('tear_rags');
    step(mode, 0.5, { moveX: 1 });
    step(mode, 3);
    expect(count(mode, 'hoodie')).toBe(1);
    expect(count(mode, 'rags')).toBe(0);
  });

  it('a magazine teaches its recipes; you keep it', () => {
    const { mode, hud } = makeMode();
    give(mode, { 'mag:electronics': 1, electronics_scrap: 1, battery: 1, duct_tape: 1, screwdriver: 1 });
    skilled(mode, 'electrical', 1);
    step(mode, 0.1);
    expect(mode.craft('noise_maker')).toBe(false);
    expect(mode.useSupply('mag:electronics')).toBe(true);
    expect(count(mode, 'mag:electronics')).toBe(1);
    mode.setCraftOpen(true);
    step(mode, 1);
    expect(hud().recipes?.find((r) => r.id === 'noise_maker')).toMatchObject({ known: true, ok: true });
    expect(mode.craft('noise_maker')).toBe(true);
    step(mode, 8);
    expect(count(mode, 'noise_maker')).toBe(1);
    expect(count(mode, 'screwdriver')).toBe(1); // tools are kept
  });
});

describe('building', () => {
  it('a wooden wall goes up on the tile you face, blocks movement and sight, and costs its materials', () => {
    const { mode } = makeMode();
    give(mode, { planks: 3, nails: 6 }, ['hammer']);
    skilled(mode, 'carpentry', 2);
    buildEast(mode, 'wood_wall');
    const g = mode.sim.grid;
    expect(p(mode).built.get(EAST.tile)?.kind).toBe('wood_wall');
    expect(g.flags[EAST.tile] & TILE_SOLID).toBeTruthy();
    expect(g.flags[EAST.tile] & TILE_OPAQUE).toBeTruthy();
    expect(mode.isBlocked({ x: EAST.col * 16 + 2, y: EAST.row * 16 + 2, w: 8, h: 8 })).toBe(true);
    expect(count(mode, 'planks')).toBe(0);
    expect(mode.skills.carpentry.xp).toBeGreaterThan(0);
    // Out of materials: placement mode ends
    expect(mode.isPlacing()).toBe(false);
  });

  it('the tile in front is buildable whichever way you face (never under your own feet)', () => {
    const { mode, hud } = makeMode();
    give(mode, { planks: 3, nails: 6 }, ['hammer']);
    skilled(mode, 'carpentry', 2);
    step(mode, 0.1);
    mode.craft('wood_wall');
    // Standing at different spots within a tile, facing each way
    for (const dx of [0, 5, -5]) {
      for (const dy of [0, 5, -6]) {
        for (const aim of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
          mode.setAim(aim);
          mode.sim.zombies = [];
          mode.update(1 / 30, frame({ feetX: SPAWN.x + dx, feetY: SPAWN.y + dy }));
          expect(hud().build.placing, `aim ${aim} at ${dx},${dy}`).toMatchObject({ valid: true });
        }
      }
    }
  });

  it("you can't build without the skill, or on a tile someone is standing on", () => {
    const { mode, hud } = makeMode();
    give(mode, { planks: 3, nails: 6 }, ['hammer']);
    step(mode, 0.1);
    expect(mode.craft('wood_wall')).toBe(false); // carpentry 0 < 2
    skilled(mode, 'carpentry', 2);
    mode.setAim(0);
    expect(mode.craft('wood_wall')).toBe(true);
    step(mode, 0.1);
    expect(hud().build.placing).toMatchObject({ valid: true, reason: null });
    // A zombie on the target tile
    mode.sim.zombies = [];
    mode.sim.add(EAST.col * 16 + 8, EAST.row * 16 + 8);
    mode.update(1 / 30, frame());
    expect(hud().build.placing).toMatchObject({ valid: false, reason: 'Someone is standing there' });
    expect(mode.confirmPlacement()).toBe(true);
    mode.update(1 / 30, frame());
    expect(hud().build.progress).toBeNull();
    mode.cancelCraft();
    expect(mode.isPlacing()).toBe(false);
  });

  it('a crate is storage; dismantling it spills what was inside and gives some wood back', () => {
    const { mode, hud } = makeMode();
    give(mode, { planks: 3, nails: 4, rope: 1 }, ['hammer']);
    skilled(mode, 'carpentry', 1);
    buildEast(mode, 'crate');
    const crate = p(mode).built.get(EAST.tile);
    expect(crate?.container).toBeGreaterThan(0);
    step(mode, 0.1);
    expect(hud().container?.label).toBe('Crate');
    mode.toggleLoot();
    step(mode, 0.1);
    const rope = p(mode).bag.items.find((i) => i.def === 'rope')!;
    expect(mode.inventoryAction(`b:${rope.uid}`, 'put')).toBe(true);
    step(mode, 0.1);
    expect(hud().loot?.items.map((i) => i.name)).toEqual(['Rope']);
    mode.closeLoot();
    step(mode, 0.1);
    expect(hud().build.near?.label).toBe('Wooden Crate');
    expect(mode.dismantleNear()).toBe(true);
    step(mode, 0.1);
    expect(p(mode).built.has(EAST.tile)).toBe(false);
    expect(count(mode, 'planks')).toBe(1);
    expect(hud().container?.label).toBe('Ground'); // the rope spilled
  });

  it('a workbench speeds crafting and enables metalwork', () => {
    const { mode, hud } = makeMode();
    give(mode, { planks: 5, nails: 8, saw: 1, scrap_metal: 3, blowtorch: 1 }, ['hammer']);
    skilled(mode, 'carpentry', 2);
    step(mode, 0.1);
    expect(mode.craft('metal_sheet')).toBe(false);
    buildEast(mode, 'workbench');
    mode.setCraftOpen(true);
    step(mode, 0.2);
    expect(hud().recipes?.find((r) => r.id === 'metal_sheet')?.ok).toBe(true);
    expect(mode.craft('metal_sheet')).toBe(true);
    step(mode, 6);
    expect(count(mode, 'metal_sheet')).toBe(1);
  });
});

describe('boarding up costs materials', () => {
  const door = (): Entrance => ({ id: 'b:door', kind: 'door', col: 27, row: 19, state: 'closed', planks: 0, hp: DOOR_HP });
  const at = { feetX: 27 * 16 + 8, feetY: 19 * 16 + 8 + 16 };

  it('needs a hammer, a plank and two nails; pulling a plank off gives it back', () => {
    const { mode, hud } = makeMode([door()]);
    step(mode, 0.1, at);
    expect(mode.doorAction('addPlank')).toBe(false);
    step(mode, 0.05, at);
    expect(hud().toast).toMatch(/hammer, a plank and 2 nails/);
    give(mode, { planks: 1, nails: 2 }, ['hammer']);
    expect(mode.doorAction('addPlank')).toBe(true);
    step(mode, 3, at);
    expect(mode.sim.grid.entrances.values().next().value?.state).toBe('barricaded');
    expect(count(mode, 'planks')).toBe(0);
    expect(count(mode, 'nails')).toBe(0);
    expect(mode.doorAction('removePlank')).toBe(true);
    expect(count(mode, 'planks')).toBe(1);
  });
});

describe('noise maker', () => {
  it('dropped, it buzzes after a few seconds and keeps pulling noise', () => {
    const { mode } = makeMode();
    give(mode, { noise_maker: 1 });
    step(mode, 0.1);
    expect(mode.useSupply('noise_maker')).toBe(true);
    let loud = 0;
    for (let t = 0; t < 10; t += 1 / 30) {
      mode.sim.zombies = [];
      if (p(mode).pendingNoises.some((n) => n.radius === 20)) loud++;
      mode.update(1 / 30, frame());
    }
    expect(loud).toBeGreaterThanOrEqual(3);
  });
});

describe('safehouse', () => {
  const b = buildings[0];
  const inside = { feetX: b.footprint.x + b.footprint.w / 2, feetY: b.footprint.y + b.footprint.h / 2, insideBuildingId: b.id };

  it('claim the building you are in: no zombies spawn inside it', () => {
    const { mode, hud } = makeMode();
    step(mode, 0.1, inside);
    expect(hud().build.safehouse?.owner).toBeNull();
    expect(mode.claimSafehouse()).toBe(true);
    step(mode, 0.1, inside);
    expect(hud().build.safehouse?.owner).toBe('you');
    expect(mode.sim.spawnBlocked?.(inside.feetX, inside.feetY)).toBe(true);
    expect(mode.sim.spawnBlocked?.(b.footprint.x - 50, b.footprint.y - 50)).toBe(false);
    expect(mode.releaseSafehouse()).toBe(true);
    expect(mode.sim.spawnBlocked?.(inside.feetX, inside.feetY)).toBe(false);
  });

  it('someone else cannot build inside your safehouse', () => {
    const { mode } = makeMode();
    mode.attachNet({ selfId: 'h', isReady: () => true, isHost: () => true, getHostId: () => 'h', isMember: () => true, memberCount: () => 2, sendLoot() {}, sendShot() {}, sendStrike() {}, sendDoor() {}, sendSnapshot() {} } as never);
    step(mode, 0.1, inside);
    mode.claimSafehouse();
    const col = Math.floor(inside.feetX / 16) + 1;
    const row = Math.floor(inside.feetY / 16);
    const tile = row * Math.ceil(MAP_WIDTH / 16) + col;
    p(mode).remoteBuild.push({ op: { r: 1, o: 'b', k: STRUCTURE_KINDS.indexOf('crate'), t: tile }, from: 'c' });
    step(mode, 0.1, { ...inside, others: [{ id: 'c', x: inside.feetX + 4, y: inside.feetY }] });
    expect(p(mode).built.has(tile)).toBe(false);
  });
});

describe('multiplayer building', () => {
  function party() {
    const host = makeMode();
    const client = makeMode();
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

  it("a client's wall is built by the host and appears for everyone; it blocks on the client too", () => {
    const { host, client, tick } = party();
    give(client.mode, { planks: 3, nails: 6 }, ['hammer']);
    skilled(client.mode, 'carpentry', 2);
    client.mode.setAim(0);
    tick(0.2);
    client.mode.craft('wood_wall');
    tick(0.05);
    client.mode.confirmPlacement();
    tick(10);
    expect(p(host.mode).built.get(EAST.tile)?.kind).toBe('wood_wall');
    expect(p(client.mode).built.get(EAST.tile)?.kind).toBe('wood_wall');
    expect(client.mode.sim.grid.flags[EAST.tile] & TILE_SOLID).toBeTruthy();
    expect(count(client.mode, 'planks')).toBe(0);
    // Dismantling goes through the host too, and the client gets its share back on the ack
    expect(client.mode.dismantleNear()).toBe(true);
    tick(0.6);
    expect(p(host.mode).built.has(EAST.tile)).toBe(false);
    expect(p(client.mode).built.has(EAST.tile)).toBe(false);
    expect(client.mode.sim.grid.flags[EAST.tile] & TILE_SOLID).toBeFalsy();
    expect(count(client.mode, 'planks')).toBe(2);
    expect(count(client.mode, 'nails')).toBe(3);
  });

  it('a refused build refunds the materials', () => {
    const { host, client, tick } = party();
    give(client.mode, { planks: 3, nails: 6 }, ['hammer']);
    skilled(client.mode, 'carpentry', 2);
    client.mode.setAim(0);
    tick(0.2);
    // The host already has something on that tile
    p(host.mode).built.set(EAST.tile, { kind: 'workbench' });
    host.mode.sim.grid.flags[EAST.tile] |= TILE_SOLID;
    client.mode.craft('wood_wall');
    tick(0.05);
    client.mode.confirmPlacement();
    tick(10);
    expect(count(client.mode, 'planks')).toBeGreaterThan(0);
  });

  it('safehouse claims reach clients', () => {
    const { host, client, tick } = party();
    const b = buildings[0];
    host.mode.update(1 / 30, frame({ feetX: b.footprint.x + 20, feetY: b.footprint.y + 20, insideBuildingId: b.id }));
    host.mode.claimSafehouse();
    tick(0.5);
    expect(p(client.mode).claims.get(b.id)?.owner).toBe('h');
  });
});
