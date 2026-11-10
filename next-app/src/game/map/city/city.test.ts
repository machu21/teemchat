import { describe, it, expect } from 'vitest';
import { checkAABB, type Rect } from '../../collision';
import { CITY_SEED, cityPropCollider, generateCity } from './cityPlan';
import { FT, type CityFloor, type CityPlan } from './types';
import { renderCityChunk, renderCityEntrance, renderCityFloor, renderCityProp, renderCityRoof } from './renderCity';

const plan = generateCity();

function hashPlan(p: CityPlan): number {
  let h = 0x811c9dc5;
  const mix = (n: number) => {
    h ^= n & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (n >>> 8) & 0xff;
    h = Math.imul(h, 0x01000193);
  };
  const json = JSON.stringify(p, (_k, v) => {
    if (v instanceof Uint8Array || v instanceof Int16Array) {
      let a = 0x811c9dc5;
      for (let i = 0; i < v.length; i++) a = Math.imul(a ^ (v[i] & 0xffff), 0x01000193);
      return `typed:${v.length}:${a >>> 0}`;
    }
    return v;
  });
  for (let i = 0; i < json.length; i++) mix(json.charCodeAt(i));
  return h >>> 0;
}

/** Tiles overlapped by a world-px rect. */
function tilesOf(r: Rect, t: number): [number, number, number, number] {
  return [Math.floor(r.x / t), Math.floor(r.y / t), Math.ceil((r.x + r.w) / t) - 1, Math.ceil((r.y + r.h) / t) - 1];
}

function solidGrid(p: CityPlan): Uint8Array {
  const g = new Uint8Array(p.cols * p.rows);
  const mark = (r: Rect) => {
    const [c0, r0, c1, r1] = tilesOf(r, p.tile);
    for (let y = Math.max(0, r0); y <= Math.min(p.rows - 1, r1); y++)
      for (let x = Math.max(0, c0); x <= Math.min(p.cols - 1, c1); x++) g[y * p.cols + x] = 1;
  };
  p.walls.forEach(mark);
  for (const b of p.buildings) b.floors[0].furniture.forEach(mark);
  for (const pr of p.props) {
    const c = cityPropCollider(pr);
    if (c) mark(c);
  }
  // Doors and windows count as walkable for reachability.
  for (const e of p.entrances) g[e.row * p.cols + e.col] = 0;
  return g;
}

function bfs(cols: number, rows: number, solid: Uint8Array, start: number): Uint8Array {
  const seen = new Uint8Array(cols * rows);
  if (solid[start]) return seen;
  const q = new Int32Array(cols * rows);
  let head = 0;
  let tail = 0;
  q[tail++] = start;
  seen[start] = 1;
  while (head < tail) {
    const i = q[head++];
    const c = i % cols;
    const r = (i - c) / cols;
    const nbs = [c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1, r > 0 ? i - cols : -1, r < rows - 1 ? i + cols : -1];
    for (const j of nbs) {
      if (j < 0 || seen[j] || solid[j]) continue;
      seen[j] = 1;
      q[tail++] = j;
    }
  }
  return seen;
}

function floorSolid(f: CityFloor, t: number): Uint8Array {
  const g = new Uint8Array(f.cols * f.rows);
  for (let i = 0; i < g.length; i++) {
    const v = f.tiles[i];
    g[i] = v === FT.WALL || v === FT.WINDOW || (f.index > 0 && v === FT.DOOR) ? 1 : 0;
  }
  for (const fu of f.furniture) {
    const [c0, r0, c1, r1] = tilesOf({ x: fu.x - f.bounds.x, y: fu.y - f.bounds.y, w: fu.w, h: fu.h }, t);
    for (let y = r0; y <= r1; y++) for (let x = c0; x <= c1; x++) g[y * f.cols + x] = 1;
  }
  return g;
}

function floorTile(f: CityFloor, pt: { x: number; y: number }, t: number): number {
  return Math.floor((pt.y - f.bounds.y) / t) * f.cols + Math.floor((pt.x - f.bounds.x) / t);
}

describe('zombie city generator', () => {
  it('is deterministic for the same seed', () => {
    const again = generateCity(CITY_SEED);
    expect(hashPlan(again)).toBe(hashPlan(plan));
    expect(hashPlan(generateCity(CITY_SEED + 1))).not.toBe(hashPlan(plan));
  });

  it('has a sensible size and contents', () => {
    expect(plan.size).toEqual({ w: 6720, h: 4320 });
    expect(plan.buildings.length).toBeGreaterThan(150);
    const kinds = new Set(plan.buildings.map((b) => b.kind));
    for (const k of ['house', 'shop', 'grocery', 'pharmacy', 'office', 'apartment', 'police', 'hospital', 'gasStation']) {
      expect(kinds.has(k as never), k).toBe(true);
    }
    expect(plan.buildings.some((b) => b.floors.length === 4)).toBe(true);
    expect(plan.zones.some((z) => z.district === 'park')).toBe(true);
  });

  it('has no overlapping footprints and nothing outside bounds', () => {
    const { w, h } = plan.size;
    const inCity = (r: Rect) => r.x >= 0 && r.y >= 0 && r.x + r.w <= w && r.y + r.h <= h;
    const bs = plan.buildings;
    for (let i = 0; i < bs.length; i++) {
      expect(inCity(bs[i].footprint), bs[i].id).toBe(true);
      for (let j = i + 1; j < bs.length; j++) {
        expect(checkAABB(bs[i].footprint, bs[j].footprint), `${bs[i].id} vs ${bs[j].id}`).toBe(false);
      }
    }
    for (const r of plan.walls) expect(inCity(r)).toBe(true);
    for (const p of plan.props) {
      const c = cityPropCollider(p);
      if (c) expect(inCity(c), `${p.type}@${p.x},${p.y}`).toBe(true);
    }
    // Upper floors: inside the band below the city, never overlapping each other.
    const uppers = bs.flatMap((b) => b.floors.filter((f) => f.index > 0).map((f) => f.bounds));
    for (let i = 0; i < uppers.length; i++) {
      const u = uppers[i];
      expect(u.y).toBeGreaterThanOrEqual(h + 320);
      expect(u.x >= 0 && u.x + u.w <= w).toBe(true);
      for (let j = i + 1; j < uppers.length; j++) expect(checkAABB(u, uppers[j])).toBe(false);
    }
    // Furniture stays inside its floor.
    for (const b of bs) {
      for (const f of b.floors) {
        for (const fu of f.furniture) {
          expect(fu.x >= f.bounds.x && fu.y >= f.bounds.y && fu.x + fu.w <= f.bounds.x + f.bounds.w && fu.y + fu.h <= f.bounds.y + f.bounds.h).toBe(true);
        }
      }
    }
  });

  it('spawns on a walkable tile and every front door is reachable from spawn', () => {
    const solid = solidGrid(plan);
    const s = Math.floor(plan.defaultSpawn.y / plan.tile) * plan.cols + Math.floor(plan.defaultSpawn.x / plan.tile);
    expect(solid[s]).toBe(0);
    const seen = bfs(plan.cols, plan.rows, solid, s);
    const unreachable = plan.buildings.filter((b) => !seen[(b.frontDoor.y / plan.tile) * plan.cols + b.frontDoor.x / plan.tile]);
    expect(unreachable.map((b) => b.id)).toEqual([]);
  });

  it('reaches every floor through the stairs chain', () => {
    const t = plan.tile;
    for (const b of plan.buildings) {
      expect(b.floors.length).toBeGreaterThanOrEqual(1);
      for (const f of b.floors) {
        const solid = floorSolid(f, t);
        const start =
          f.index === 0
            ? floorTile(f, b.insideSpawn, t)
            : floorTile(f, b.floors[f.index - 1].up!.arrival, t);
        const seen = bfs(f.cols, f.rows, solid, start);
        expect(seen[start], `${b.id} ${f.label} start`).toBe(1);
        if (f.index < b.floors.length - 1) {
          expect(f.up, `${b.id} ${f.label} up`).toBeDefined();
          expect(f.up!.toFloor).toBe(f.index + 1);
          expect(seen[floorTile(f, f.up!.rect, t)], `${b.id} ${f.label} up reachable`).toBe(1);
        } else expect(f.up).toBeUndefined();
        if (f.index > 0) {
          expect(f.down!.toFloor).toBe(f.index - 1);
          expect(seen[floorTile(f, f.down!.rect, t)], `${b.id} ${f.label} down reachable`).toBe(1);
          // Arriving downstairs lands on a walkable tile of the floor below.
          const below = b.floors[f.index - 1];
          expect(floorSolid(below, t)[floorTile(below, f.down!.arrival, t)]).toBe(0);
        } else expect(f.down).toBeUndefined();
      }
    }
  });

  it('places entrances in wall gaps on building shells', () => {
    const t = plan.tile;
    const ids = new Set<string>();
    for (const e of plan.entrances) {
      expect(ids.has(e.id)).toBe(false);
      ids.add(e.id);
      const tileRect = { x: e.col * t + 1, y: e.row * t + 1, w: t - 2, h: t - 2 };
      expect(plan.walls.some((w) => checkAABB(w, tileRect)), e.id).toBe(false);
      expect(e.state === 'closed' || e.state === 'locked').toBe(true);
      if (e.kind === 'window') expect(e.state).toBe('closed');
      const b = plan.buildings.find((bb) => e.id.startsWith(`${bb.id}:`))!;
      const f = b.floors[0];
      const lc = e.col - f.bounds.x / t;
      const lr = e.row - f.bounds.y / t;
      const onEdge = lc === 0 || lr === 0 || lc === f.cols - 1 || lr === f.rows - 1;
      expect(onEdge, e.id).toBe(true);
      // Flanked by shell wall along the wall line.
      const horiz = lr === 0 || lr === f.rows - 1;
      const n1 = horiz ? f.tiles[lr * f.cols + lc - 1] : f.tiles[(lr - 1) * f.cols + lc];
      const n2 = horiz ? f.tiles[lr * f.cols + lc + 1] : f.tiles[(lr + 1) * f.cols + lc];
      expect(n1 === FT.WALL || n1 === FT.WINDOW || n1 === FT.DOOR).toBe(true);
      expect(n2 === FT.WALL || n2 === FT.WINDOW || n2 === FT.DOOR).toBe(true);
    }
    for (const b of plan.buildings) expect(ids.has(b.frontDoorEntranceId)).toBe(true);
    expect(plan.entrances.some((e) => e.state === 'locked')).toBe(true);
  });

  // ~165 ms on its own; the bound is loose because the full suite runs files in parallel
  it('generates in well under a second', () => {
    let best = Infinity;
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      generateCity();
      best = Math.min(best, performance.now() - t0);
    }
    expect(best).toBeLessThan(800);
  });

  it('renders chunks, floors, roofs, props and entrances without throwing', () => {
    let fills = 0;
    const ctx = {
      fillStyle: '',
      fillRect: () => { fills++; },
      save: () => {}, restore: () => {}, translate: () => {}, beginPath: () => {}, rect: () => {}, clip: () => {},
      // Storefront signs: ~6 px per character at the sign font
      font: '', textAlign: 'left', textBaseline: 'alphabetic',
      measureText: (t: string) => ({ width: t.length * 6 }),
      fillText: () => { texts++; },
      arc: () => {}, fill: () => {},
    } as unknown as CanvasRenderingContext2D;
    let texts = 0;
    renderCityChunk(ctx, plan, { x: 3584, y: 2560, w: 512, h: 512 });
    expect(fills).toBeGreaterThan(1024);
    const tall = plan.buildings.find((b) => b.floors.length >= 3)!;
    for (let k = 0; k < tall.floors.length; k++) renderCityFloor(ctx, plan, tall, k);
    for (const b of plan.buildings.slice(0, 20)) renderCityRoof(ctx, b);
    renderCityRoof(ctx, plan.buildings.find((b) => b.kind === 'hospital')!);
    const before = texts;
    for (const b of plan.buildings.filter((x) => x.sign).slice(0, 10)) renderCityRoof(ctx, b);
    expect(texts - before).toBeGreaterThanOrEqual(10); // every store roof prints its name
    expect(plan.props.filter((p) => renderCityProp(ctx, p)).length).toBeGreaterThan(100);
    for (const e of plan.entrances.slice(0, 50)) renderCityEntrance(ctx, plan, e);
  });
});

describe('stores are easy to find', () => {
  const STORE_KINDS = ['shop', 'grocery', 'convenience', 'pharmacy', 'gasStation'];
  const stores = plan.buildings.filter((b) => STORE_KINDS.includes(b.kind));

  it('every building name is unique', () => {
    const names = plan.buildings.map((b) => b.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('has a convenience store in every other suburban block, plus some downtown', () => {
    const conv = plan.buildings.filter((b) => b.kind === 'convenience');
    expect(conv.length).toBeGreaterThanOrEqual(6);
    expect(conv.some((b) => b.district === 'residential')).toBe(true);
    expect(conv.some((b) => b.district === 'commercial')).toBe(true);
    // Shops no longer pretend to be corner stores
    expect(plan.buildings.some((b) => b.kind === 'shop' && /corner store/i.test(b.name))).toBe(false);
  });

  it('convenience stores look like one inside: a till, shelves and drinks fridges', () => {
    for (const b of plan.buildings.filter((x) => x.kind === 'convenience')) {
      const kinds = new Set(b.floors[0].furniture.map((f) => f.kind));
      expect(kinds.has('checkout'), b.name).toBe(true);
      expect(kinds.has('fridge') || kinds.has('shelf'), b.name).toBe(true);
    }
  });

  it('every store has a storefront sign; shop types have their own icon and colour', () => {
    for (const s of stores) expect(s.sign?.text, s.id).toBeTruthy();
    const shops = plan.buildings.filter((b) => b.kind === 'shop');
    expect(new Set(shops.map((b) => b.icon)).size).toBeGreaterThanOrEqual(5);
    expect(new Set(shops.map((b) => b.color)).size).toBeGreaterThanOrEqual(5);
  });

  it('suburban corner stores sit on an open forecourt, not behind a yard fence', () => {
    for (const b of plan.buildings.filter((x) => x.kind === 'convenience' && x.district === 'residential')) {
      const d = b.frontDoor;
      const outside = { x: d.x + 4, y: b.facing === 'n' ? d.y - 40 : d.y + 40, w: 8, h: 8 };
      expect(plan.fences.some((f) => checkAABB(f, outside)), b.name).toBe(false);
    }
  });
});
