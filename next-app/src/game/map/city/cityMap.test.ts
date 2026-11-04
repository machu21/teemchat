import { describe, expect, it } from 'vitest';
import { WallIndex } from '../../collision';
import { getAllMapConfigs, getMapConfig, getMapSize } from '../mapRegistry';
import { findLevelAt, findStairAt, getStairLinks } from '../buildings';
import { buildZombieGrid } from '../../zombie/zombieGrid';
import { TILE_ENTRANCE, TILE_OPAQUE, TILE_SOLID, tileIndex } from '../../zombie/grid';
import { Zombie, ZombieSim, ZOMBIE } from '../../zombie/zombieSim';
import { FurnitureEntity } from '../../entities/furniture';
import { generateCity } from './cityPlan';

const plan = generateCity();

const city = getMapConfig('zombie_city');
const size = getMapSize('zombie_city');
const buildings = city.buildings ?? [];

describe('zombie_city map config', () => {
  it('is a hidden ~4× map with buildings, entrances and chunk rendering', () => {
    expect(city.id).toBe('zombie_city');
    expect(size).toEqual({ w: 6720, h: 4320 });
    expect(city.hiddenFromPicker).toBe(true);
    expect(getAllMapConfigs().some((c) => c.id === 'zombie_city')).toBe(false);
    expect(typeof city.renderChunk).toBe('function');
    expect(buildings.length).toBeGreaterThan(20);
    expect(city.entrances?.length ?? 0).toBeGreaterThan(buildings.length);
  });

  it('spawns the player on open ground', () => {
    const walls = new WallIndex(city.boundaryWalls);
    const { x, y } = city.defaultSpawn;
    expect(walls.hits({ x: x + 8, y: y + 16, w: 16, h: 16 })).toBe(false);
  });

  it('chains tall buildings floor by floor with stairs both ways', () => {
    const tall = buildings.find((b) => (b.levels?.length ?? 0) >= 2)!;
    expect(tall).toBeTruthy();
    expect(tall.groundStairs?.toLevelId).toBe(tall.levels![0].id);
    expect(tall.levels![0].stairs.toLevelId).toBeNull();
    expect(tall.levels![0].stairsUp?.toLevelId).toBe(tall.levels![1].id);
    expect(tall.levels![1].stairs.toLevelId).toBe(tall.levels![0].id);
    // Every arrival lands on the destination floor and outside any trigger (no ping-pong)
    for (const link of getStairLinks(tall)) {
      const feet = { x: link.arrival.x + 16, y: link.arrival.y + 28 };
      const level = findLevelAt([tall], feet.x, feet.y);
      expect(level?.level.id ?? null).toBe(link.toLevelId);
      expect(findStairAt([tall], feet.x, feet.y)).toBeNull();
    }
  });

  it('builds a zombie grid with every entrance and stairs portal', () => {
    const grid = buildZombieGrid(city.boundaryWalls, buildings, size.w, size.h, city.entrances);
    for (const e of city.entrances ?? []) {
      const f = grid.flags[tileIndex(grid, e.col, e.row)];
      expect(f & TILE_ENTRANCE).toBeTruthy();
      if (e.state === 'closed' || e.state === 'locked') expect(f & TILE_SOLID).toBeTruthy();
    }
    expect(grid.portalOut.size).toBeGreaterThan(0);
  });

  it('a zombie follows a player to the top floor of a tall building', () => {
    const grid = buildZombieGrid(city.boundaryWalls, buildings, size.w, size.h, city.entrances);
    const tall = buildings.find((b) => (b.levels?.length ?? 0) >= 2)!;
    const top = tall.levels![tall.levels!.length - 1];
    const sim = new ZombieSim(grid, { x: 0, y: 0, w: size.w, h: size.h }, 5);
    const stairs = tall.groundStairs!.rect;
    const z: Zombie = {
      id: 1,
      x: stairs.x + stairs.w / 2,
      y: stairs.y + stairs.h + 20,
      hp: ZOMBIE.maxHp,
      state: 'chase',
      goalX: 0,
      goalY: 0,
      facing: 0,
      timer: 999,
      attackCooldown: 0,
      senseCooldown: 99,
      targetId: 'p',
      sinceHit: 99,
      moving: false,
      variant: 0,
    };
    sim.zombies.push(z);
    const player = { id: 'p', x: top.bounds.x + top.bounds.w / 2, y: top.bounds.y + top.bounds.h / 2 };
    const onTop = () => z.x >= top.bounds.x && z.x <= top.bounds.x + top.bounds.w && z.y >= top.bounds.y && z.y <= top.bounds.y + top.bounds.h;
    for (let t = 0; t < 90 && !onTop(); t += 0.05) sim.tick(0.05, [player]);
    expect(onTop()).toBe(true);
  });
});

describe('zombie_city walkability with the real survival hitbox', () => {
  // Mirrors WorldGame.playerHitbox() in survival: 12 × 10 around the feet.
  const hitbox = (x: number, y: number) => ({ x: x + 10, y: y + 20, w: 12, h: 10 });
  const feet = (x: number, y: number) => ({ x: x + 16, y: y + 25 });
  const STEP = 4;
  const T = 16;
  const windows = (city.entrances ?? []).filter((e) => e.kind === 'window').map((e) => ({ x: e.col * T, y: e.row * T, w: T, h: T }));
  const props = city.defaultProps
    .map((p) => new FurnitureEntity('t', p.type, p.x, p.y).getHitbox())
    .filter((r): r is NonNullable<typeof r> => !!r);
  const ground = new WallIndex([
    ...city.boundaryWalls,
    ...buildings.flatMap((b) => b.groundWalls ?? []),
    ...windows, // closed glass blocks movement
    ...props,
    ...(city.lowWalls ?? []), // on foot, fences and cars are solid
  ]);

  /** 4 px flood fill of player positions inside `area`, from `start` (player top-left). */
  function reachable(walls: WallIndex, area: { x: number; y: number; w: number; h: number }, start: { x: number; y: number }) {
    const cols = Math.ceil(area.w / STEP);
    const rows = Math.ceil(area.h / STEP);
    const seen = new Uint8Array(cols * rows);
    const ok = (c: number, r: number) =>
      c >= 0 && r >= 0 && c < cols && r < rows && !walls.hits(hitbox(area.x + c * STEP, area.y + r * STEP));
    const sc = Math.round((start.x - area.x) / STEP);
    const sr = Math.round((start.y - area.y) / STEP);
    const out: { x: number; y: number }[] = [];
    if (!ok(sc, sr)) return out;
    const stack = [sr * cols + sc];
    seen[sr * cols + sc] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      const c = i % cols;
      const r = (i - c) / cols;
      out.push(feet(area.x + c * STEP, area.y + r * STEP));
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc;
        const nr = r + dr;
        const ni = nr * cols + nc;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows || seen[ni] || !ok(nc, nr)) continue;
        seen[ni] = 1;
        stack.push(ni);
      }
    }
    return out;
  }
  const inside = (pts: { x: number; y: number }[], r: { x: number; y: number; w: number; h: number }) =>
    pts.some((p) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h);

  it('every building can be entered through its front door and every room/stair reached', () => {
    const problems: string[] = [];
    for (const b of plan.buildings) {
      const def = buildings.find((d) => d.id === b.id)!;
      const d = b.frontDoor;
      const cx = d.x + d.w / 2;
      const outsideFeetY = b.facing === 'n' ? d.y - 10 : d.y + T + 10;
      const start = { x: cx - 16, y: outsideFeetY - 25 };
      const area = { x: b.footprint.x - 48, y: b.footprint.y - 48, w: b.footprint.w + 96, h: b.footprint.h + 96 };
      const pts = reachable(ground, area, start);
      if (!pts.length) {
        problems.push(`${b.id}: no room to stand outside the front door`);
        continue;
      }
      if (!inside(pts, b.footprint)) problems.push(`${b.id}: cannot get in through the front door`);
      for (const room of b.floors[0].rooms) if (!inside(pts, room.rect)) problems.push(`${b.id} 1F: ${room.kind} unreachable`);
      if (def.groundStairs && !inside(pts, def.groundStairs.rect)) problems.push(`${b.id} 1F: stairs unreachable`);

      for (const [li, level] of (def.levels ?? []).entries()) {
        const arriveFrom = li === 0 ? def.groundStairs! : def.levels![li - 1].stairsUp!;
        const lw = new WallIndex(level.walls);
        const lp = reachable(lw, level.bounds, arriveFrom.arrival);
        const f = b.floors[li + 1];
        if (!lp.length) {
          problems.push(`${b.id} ${level.label}: arrival blocked`);
          continue;
        }
        for (const room of f.rooms) if (!inside(lp, room.rect)) problems.push(`${b.id} ${level.label}: ${room.kind} unreachable`);
        if (!inside(lp, level.stairs.rect)) problems.push(`${b.id} ${level.label}: stairs down unreachable`);
        if (level.stairsUp && !inside(lp, level.stairsUp.rect)) problems.push(`${b.id} ${level.label}: stairs up unreachable`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('front doors are double doors (2 tiles wide)', () => {
    for (const b of plan.buildings) expect(b.frontDoor.w, b.id).toBeGreaterThanOrEqual(2 * T);
  });
});

describe('zombie_city jumpable obstacles', () => {
  it('fences and parked cars are low walls: solid for zombies but see-through', () => {
    const low = city.lowWalls ?? [];
    expect(low.length).toBeGreaterThan(50);
    for (const f of plan.fences) expect(city.boundaryWalls).not.toContain(f);
    const grid = buildZombieGrid(city.boundaryWalls, buildings, size.w, size.h, city.entrances, low);
    const f = plan.fences[0];
    const i = tileIndex(grid, Math.floor((f.x + f.w / 2) / 16), Math.floor((f.y + f.h / 2) / 16));
    expect(grid.flags[i] & TILE_SOLID).toBeTruthy();
    expect(grid.flags[i] & TILE_OPAQUE).toBeFalsy();
  });
});

describe('zombie_city loot', () => {
  const loot = city.loot ?? [];

  it('places a deterministic stash of guns and ammo, with the full arsenal at the police station', () => {
    expect(loot.length).toBeGreaterThan(40);
    expect(loot.map((l) => l.id)).toEqual(loot.map((_, i) => i));
    const guns = new Set<string>(loot.flatMap((l) => (l.item.kind === 'weapon' ? [l.item.weapon] : [])));
    for (const g of ['pistol', 'shotgun', 'm16', 'ak47', 'mg']) expect(guns.has(g), g).toBe(true);
    const police = plan.buildings.find((b) => b.kind === 'police')!;
    const inPolice = loot.filter((l) =>
      police.floors.some((f) => l.x >= f.bounds.x && l.x <= f.bounds.x + f.bounds.w && l.y >= f.bounds.y && l.y <= f.bounds.y + f.bounds.h)
    );
    expect(inPolice.some((l) => l.item.kind === 'weapon' && l.item.weapon === 'mg')).toBe(true);
  });

  it('puts every item on an open floor tile inside a building, clear of walls', () => {
    const walls = new WallIndex([...city.boundaryWalls, ...buildings.flatMap((b) => [...(b.groundWalls ?? []), ...(b.levels ?? []).flatMap((l) => l.walls)])]);
    for (const l of loot) {
      const inside = plan.buildings.some((b) =>
        b.floors.some((f) => l.x > f.bounds.x && l.x < f.bounds.x + f.bounds.w && l.y > f.bounds.y && l.y < f.bounds.y + f.bounds.h)
      );
      expect(inside, `loot ${l.id}`).toBe(true);
      expect(walls.hits({ x: l.x - 2, y: l.y - 2, w: 4, h: 4 }), `loot ${l.id} in a wall`).toBe(false);
    }
  });
});

describe('zombie_city hordes', () => {
  it('keeps a busy, grouped crowd around the player and recycles zombies left behind', async () => {
    const { ZombieMode } = await import('../../zombie/zombieMode');
    const mode = new ZombieMode(city.boundaryWalls, buildings, size.w, size.h, 11, city.entrances, city.lowWalls, []);
    const at = (x: number, y: number) => ({ feetX: x, feetY: y, moveX: 0, moveY: 0, insideBuildingId: null, others: [] });
    const { x: sx, y: sy } = { x: city.defaultSpawn.x + 16, y: city.defaultSpawn.y + 28 };
    mode.update(1 / 30, at(sx, sy));
    // Nothing spawns on top of the player: the first groups appear outside sight
    const nearest = Math.min(...mode.sim.zombies.map((z) => Math.hypot(z.x - sx, z.y - sy)));
    expect(nearest).toBeGreaterThan(14 * 16);

    for (let t = 0; t < 12; t += 1 / 30) mode.update(1 / 30, at(sx, sy));
    const local = mode.sim.countNear(sx, sy, 45);
    expect(local).toBeGreaterThanOrEqual(25);
    // Grouped: most zombies have a neighbour within 3 tiles
    const zs = mode.sim.zombies;
    const grouped = zs.filter((z) => zs.some((o) => o !== z && Math.hypot(o.x - z.x, o.y - z.y) < 48)).length;
    expect(grouped / zs.length).toBeGreaterThan(0.7);

    // Teleport across the city: a new crowd forms there, the old one is recycled
    const fx = size.w - 800;
    const fy = size.h - 700;
    mode.sim.calm();
    for (let t = 0; t < 30; t += 1 / 30) mode.update(1 / 30, at(fx, fy));
    expect(mode.sim.countNear(fx, fy, 45)).toBeGreaterThanOrEqual(25);
    expect(mode.sim.countNear(sx, sy, 45)).toBeLessThan(local);
    expect(mode.sim.zombies.length).toBeLessThanOrEqual(150);
  });
});
