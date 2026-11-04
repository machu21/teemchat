// ============================================================
// ZOMBIE CITY — generateCity(seed)
// Fully deterministic: the same seed always yields the identical plan.
// Each lot draws from its own PRNG (seed ^ hash(lotId)), so hand-tuning one
// lot in overrides.ts never reshuffles the rest of the city.
// ============================================================

import type { Rect } from '../../collision';
import { FurnitureEntity, type FurnitureType } from '../../entities/furniture';
import { hash32, mulberry32 } from '../../art/character/appearance';
import { DOOR_HP, WINDOW_HP, type Entrance } from '../../zombie/entrances';
import {
  ALLEY_W,
  AVENUE_COLS,
  BORDER,
  CITY_COLS,
  CITY_ROWS,
  CITY_TILE,
  ROAD_W,
  STREET_ROWS,
  getBlocks,
  getRoads,
  type Block,
  type TileRect,
} from './layout';
import {
  arrivalFromAbove,
  arrivalFromBelow,
  fenceTiles,
  flipFloor,
  footprintInLot,
  layoutBuilding,
  lotRectToWorld,
  randInt,
  STAIR_H,
  DOOR_W,
  STAIR_W,
  subdivideBlock,
  type Lot,
  type Rng,
} from './lots';
import { BLOCK_OVERRIDES, LOT_OVERRIDES } from './overrides';
import {
  BUILDING_TEMPLATES,
  DISTRICT_COLORS,
  DISTRICT_KINDS,
  DISTRICT_NAMES,
  GROUND,
  type BuildingKind,
  type CityDistrict,
} from './templates';
import {
  FT,
  MARK,
  type CityBuilding,
  type CityFloor,
  type CityPlan,
  type CityProp,
  type CityRoadInfo,
  type CityStairLink,
  type CityZone,
} from './types';

/** The one fixed city. Change only together with overrides.ts. */
export const CITY_SEED = 0x5eed_c17;
export const CITY_W = CITY_COLS * CITY_TILE;
export const CITY_H = CITY_ROWS * CITY_TILE;
/** Gap between the city's south edge and the upper-floor band (px). */
export const UPPER_BAND_GAP = 320;
const UPPER_PAD = 2; // tiles between packed floors

const AVENUE_NAMES = ['West Ave', '1st Ave', '2nd Ave', '3rd Ave', '4th Ave', '5th Ave', '6th Ave', 'East Ave'];
const STREET_NAMES = ['North Rd', 'Ash St', 'Cedar St', 'Elm St', 'Grove St', 'South Rd'];

const T = CITY_TILE;
const px = (r: TileRect): Rect => ({ x: r.c * T, y: r.r * T, w: r.w * T, h: r.h * T });

/** Merges solid tiles of a cols×rows grid into rects (row runs, then stacked runs). */
export function tilesToRects(cols: number, rows: number, solid: (i: number) => boolean, ox: number, oy: number): Rect[] {
  const out: Rect[] = [];
  let open = new Map<string, Rect>();
  for (let r = 0; r < rows; r++) {
    const next = new Map<string, Rect>();
    let c = 0;
    while (c < cols) {
      if (!solid(r * cols + c)) {
        c++;
        continue;
      }
      const s = c;
      while (c < cols && solid(r * cols + c)) c++;
      const key = `${s},${c}`;
      const prev = open.get(key);
      if (prev) {
        prev.h += T;
        next.set(key, prev);
        open.delete(key);
      } else {
        const rect = { x: ox + s * T, y: oy + r * T, w: (c - s) * T, h: T };
        out.push(rect);
        next.set(key, rect);
      }
    }
    open = next;
  }
  return out;
}

function pickKind(rng: Rng, district: CityDistrict): BuildingKind {
  const opts = DISTRICT_KINDS[district];
  const total = opts.reduce((s, o) => s + o.weight, 0);
  let roll = rng() * total;
  for (const o of opts) {
    roll -= o.weight;
    if (roll < 0) return o.kind;
  }
  return opts[opts.length - 1].kind;
}

/** Collider of a prop (world px), or null if it can be walked over. */
export function cityPropCollider(p: CityProp): Rect | null {
  switch (p.type) {
    case 'car':
      return p.dir === 'v' ? { x: p.x, y: p.y, w: 28, h: 48 } : { x: p.x, y: p.y, w: 48, h: 28 };
    case 'dumpster':
      return { x: p.x, y: p.y, w: 32, h: 20 };
    case 'fuelPump':
      return { x: p.x, y: p.y, w: 16, h: 24 };
    case 'trashCan':
      return { x: p.x, y: p.y, w: 12, h: 12 };
    default:
      return new FurnitureEntity('city', p.type as FurnitureType, p.x, p.y).getHitbox();
  }
}

/** Generates the fixed Zombie Survival city. Pure and deterministic. */
export function generateCity(seed: number = CITY_SEED): CityPlan {
  const cols = CITY_COLS;
  const rows = CITY_ROWS;
  const size = { w: cols * T, h: rows * T };
  const ground = new Uint8Array(cols * rows);
  const marks = new Uint8Array(cols * rows);
  const wallOwner = new Int16Array(cols * rows);
  const idx = (c: number, r: number) => r * cols + c;
  const fillGround = (rect: TileRect, kind: number) => {
    for (let r = rect.r; r < rect.r + rect.h; r++) for (let c = rect.c; c < rect.c + rect.w; c++) ground[idx(c, r)] = kind;
  };
  const cityRng = mulberry32(seed);

  // ── Border ─────────────────────────────────────────────
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r < BORDER || c < BORDER || r >= rows - BORDER || c >= cols - BORDER) {
        wallOwner[idx(c, r)] = -2;
        ground[idx(c, r)] = GROUND.DIRT;
      }
    }
  }

  // ── Roads: sidewalks first, asphalt on top (intersections become asphalt) ──
  const roads = getRoads();
  for (const road of roads) fillGround(road.rect, GROUND.SIDEWALK);
  for (const road of roads) {
    const a = road.dir === 'v'
      ? { c: road.rect.c + 1, r: road.rect.r, w: ROAD_W - 2, h: road.rect.h }
      : { c: road.rect.c, r: road.rect.r + 1, w: road.rect.w, h: ROAD_W - 2 };
    fillGround(a, GROUND.ASPHALT);
  }
  const inAvenue = (c: number) => AVENUE_COLS.some((a) => c >= a - 1 && c <= a + ROAD_W);
  const inStreet = (r: number) => STREET_ROWS.some((s) => r >= s - 1 && r <= s + ROAD_W);
  for (const s of STREET_ROWS) {
    for (let c = BORDER; c < cols - BORDER; c++) if (!inAvenue(c)) marks[idx(c, s + 2)] |= MARK.DASH_H;
    for (const a of AVENUE_COLS) {
      for (const c of [a - 1, a + ROAD_W]) {
        if (c < BORDER || c >= cols - BORDER) continue;
        for (let r = s + 1; r < s + ROAD_W - 1; r++) marks[idx(c, r)] |= MARK.ZEBRA_H;
      }
    }
  }
  for (const a of AVENUE_COLS) {
    for (let r = BORDER; r < rows - BORDER; r++) if (!inStreet(r)) marks[idx(a + 2, r)] |= MARK.DASH_V;
    for (const s of STREET_ROWS) {
      for (const r of [s - 1, s + ROAD_W]) {
        if (r < BORDER || r >= rows - BORDER) continue;
        for (let c = a + 1; c < a + ROAD_W - 1; c++) marks[idx(c, r)] |= MARK.ZEBRA_V;
      }
    }
  }
  const roadInfo: CityRoadInfo[] = roads.map((rd) => {
    const i = rd.dir === 'v' ? AVENUE_COLS.indexOf(rd.rect.c) : STREET_ROWS.indexOf(rd.rect.r);
    return { dir: rd.dir, name: (rd.dir === 'v' ? AVENUE_NAMES : STREET_NAMES)[i] ?? 'Road', rect: px(rd.rect) };
  });

  // ── Blocks, districts, lots ──────────────────────────
  const buildings: CityBuilding[] = [];
  const entrances: Entrance[] = [];
  const props: CityProp[] = [];
  const zones: CityZone[] = [];
  const walls: Rect[] = [];
  const fenceTileList: { c: number; r: number }[] = [];
  const nameCount = new Map<BuildingKind, number>();
  let defaultSpawn = { x: size.w / 2, y: size.h / 2 };

  const blocks = getBlocks();
  for (const block of blocks) {
    const ov = BLOCK_OVERRIDES[block.id] ?? {};
    let district: CityDistrict = ov.district ?? block.district;
    const landmark = ov.landmark ?? block.landmark;
    if (landmark) district = 'landmark';
    let alleyCol = block.alleyCol;
    if (ov.alley === false) alleyCol = undefined;
    if (ov.alley === true && alleyCol === undefined) alleyCol = block.rect.c + Math.floor(block.rect.w / 2) - 1;
    if (district === 'landmark' || district === 'park') alleyCol = undefined;

    const zoneName = landmark ? BUILDING_TEMPLATES[landmark].names[0] : DISTRICT_NAMES[district];
    zones.push({
      id: block.id,
      name: zoneName,
      tag: district,
      district,
      color: DISTRICT_COLORS[district],
      rect: px(block.rect),
    });

    // Base ground for the block.
    const base = district === 'residential' ? GROUND.GRASS : district === 'park' ? GROUND.GRASS : district === 'landmark' ? GROUND.PARKING : GROUND.PLAZA;
    fillGround(block.rect, base);
    if (alleyCol !== undefined) {
      fillGround({ c: alleyCol, r: block.rect.r, w: ALLEY_W, h: block.rect.h }, GROUND.ALLEY);
      const arng = mulberry32(seed ^ hash32(`${block.id}:alley`));
      for (let k = 0; k < 2; k++) {
        const r = block.rect.r + 3 + randInt(arng, 0, block.rect.h - 7);
        props.push({ type: 'trashCan', x: alleyCol * T + 2, y: r * T + 2 });
      }
    }

    if (district === 'park') {
      defaultSpawn = buildPark(block, seed, fillGround, props);
      continue;
    }
    if (ov.vacant) {
      fillGround(block.rect, GROUND.DIRT);
      continue;
    }

    for (const lot of subdivideBlock(block, district, alleyCol)) {
      const lov = LOT_OVERRIDES[lot.id] ?? {};
      const rng = mulberry32(seed ^ hash32(lot.id));
      if (lov.skip) continue;
      if (district === 'residential' && !lov.kind && rng() < 0.08) {
        fillGround(lot.rect, GROUND.DIRT); // vacant lot
        continue;
      }
      const kind: BuildingKind = lov.kind ?? landmark ?? pickKind(rng, district);
      const tpl = BUILDING_TEMPLATES[kind];
      const floorCount = Math.max(1, Math.min(4, lov.floors ?? randInt(rng, tpl.floors[0], tpl.floors[1])));
      const canon = footprintInLot(lot, kind);
      if (canon.w < 5 || canon.h < 5) continue;
      const fpTiles = lotRectToWorld(lot, canon);
      const layout = layoutBuilding(canon.w, canon.h, floorCount, tpl, rng);
      const { fw, fh } = layout;
      const flip = lot.facing === 's';
      const toWorld = (c: number, r: number) => ({ c: fpTiles.c + c, r: fpTiles.r + (flip ? fh - 1 - r : r) });

      const bIndex = buildings.length;
      const id = `bld_${lot.id.replace(':', '_')}`;
      const n = nameCount.get(kind) ?? 0;
      nameCount.set(kind, n + 1);
      const name = lov.name ?? (kind === 'house' ? houseAddress(lot) : tpl.names[n % tpl.names.length]);

      // Floors in world orientation.
      const floors: CityFloor[] = layout.floors.map((f, k) => {
        const wf = flip ? flipFloor(f, fw, fh) : f;
        return {
          index: k,
          label: `${k + 1}F`,
          bounds: { x: 0, y: 0, w: fw * T, h: fh * T }, // placed below
          cols: fw,
          rows: fh,
          tiles: wf.tiles,
          walls: [],
          furniture: wf.furniture.map((fu) => ({ kind: fu.kind, x: fu.c * T, y: fu.r * T, w: fu.w * T, h: fu.h * T })),
          rooms: wf.rooms.map((rm) => ({ kind: rm.kind, rect: px(rm.rect) })),
        };
      });

      // Ground floor → city grid.
      const g = floors[0];
      g.bounds = px(fpTiles);
      let wi = 0;
      const doorId = `${id}:door`;
      const locked = lov.locked ?? rng() < tpl.lockChance;
      for (let r = 0; r < fh; r++) {
        for (let c = 0; c < fw; c++) {
          const t = g.tiles[r * fw + c];
          const wc = fpTiles.c + c;
          const wr = fpTiles.r + r;
          ground[idx(wc, wr)] = tpl.floor;
          if (t === FT.WALL) wallOwner[idx(wc, wr)] = bIndex + 1;
          else if (t === FT.DOOR) {
            // Double front door: one entrance per leaf (left keeps the canonical id)
            const leafId = entrances.some((e) => e.id === doorId) ? `${doorId}:2` : doorId;
            entrances.push({ id: leafId, kind: 'door', col: wc, row: wr, state: locked ? 'locked' : 'closed', planks: 0, hp: DOOR_HP });
          } else if (t === FT.WINDOW) {
            entrances.push({ id: `${id}:w${wi++}`, kind: 'window', col: wc, row: wr, state: 'closed', planks: 0, hp: WINDOW_HP });
          }
        }
      }
      for (const f of floors) {
        const ox = f.index === 0 ? g.bounds.x : 0;
        const oy = f.index === 0 ? g.bounds.y : 0;
        f.walls = tilesToRects(fw, fh, (i) => f.tiles[i] === FT.WALL || (f.index > 0 && f.tiles[i] === FT.WINDOW), ox, oy);
        if (f.index === 0) {
          for (const fu of f.furniture) {
            fu.x += ox;
            fu.y += oy;
          }
          for (const rm of f.rooms) {
            rm.rect.x += ox;
            rm.rect.y += oy;
          }
        }
      }
      walls.push(...g.walls);

      const door = toWorld(layout.doorCol, 0);
      const inside = toWorld(layout.doorCol, 1);
      const outside = toWorld(layout.doorCol, -1);
      let stairwell: Rect | undefined;
      if (layout.stair) {
        const s = layout.stair;
        const top = flip ? fh - s.sy - STAIR_H : s.sy;
        stairwell = { x: (fpTiles.c + s.sx) * T, y: (fpTiles.r + top) * T, w: STAIR_W * T, h: STAIR_H * T };
      }

      buildings.push({
        id,
        index: bIndex,
        kind,
        district,
        blockId: block.id,
        lotId: lot.id,
        name,
        icon: tpl.icon,
        color: tpl.color,
        wallFace: tpl.wallFace,
        roofColor: tpl.roof,
        floorKind: tpl.floor,
        footprint: px(fpTiles),
        facing: lot.facing,
        frontDoor: { x: door.c * T, y: door.r * T, w: DOOR_W * T, h: T },
        frontDoorEntranceId: doorId,
        insideSpawn: { x: inside.c * T, y: inside.r * T },
        outsideSpawn: { x: outside.c * T, y: outside.r * T },
        stairwell,
        floors,
      });

      // Lot dressing.
      if (district === 'residential') {
        const gate = canon.c + layout.doorCol;
        for (const ft of fenceTiles(lot, gate)) fenceTileList.push(lotRectToWorld(lot, { c: ft.c, r: ft.r, w: 1, h: 1 }));
        // Front path from gate to door.
        for (let r = 0; r < canon.r; r++) fillGround(lotRectToWorld(lot, { c: gate, r, w: 2, h: 1 }), GROUND.SIDEWALK);
        if (rng() < 0.6 && gate >= 5) {
          const t = lotRectToWorld(lot, { c: 1, r: 1, w: 2, h: 2 });
          props.push({ type: 'pineTree', x: t.c * T - 20, y: t.r * T - 50 });
        }
      } else if (district === 'commercial' && rng() < 0.6) {
        const d = lotRectToWorld(lot, { c: canon.c + 1, r: lot.rect.h - 1, w: 2, h: 1 });
        props.push({ type: 'dumpster', x: d.c * T, y: d.r * T + (lot.facing === 'n' ? -6 : 2) });
      } else if (kind === 'gasStation') {
        const pumpCols = [canon.c + 1, canon.c + canon.w - 2];
        for (const pr of [5, 10]) {
          for (const pc of pumpCols) {
            const t = lotRectToWorld(lot, { c: pc, r: pr, w: 1, h: 2 });
            props.push({ type: 'fuelPump', x: t.c * T, y: t.r * T + 4 });
          }
        }
      } else if (kind === 'police' || kind === 'hospital') {
        for (let k = 0; k < 2; k++) {
          const t = lotRectToWorld(lot, { c: canon.c + 2 + k * 5, r: 1, w: 3, h: 2 });
          props.push({ type: 'car', dir: 'h', variant: kind === 'police' ? 6 : 7, x: t.c * T, y: t.r * T + 2 });
        }
      }
    }
  }

  // ── Fences ──
  const fenceMask = new Uint8Array(cols * rows);
  for (const f of fenceTileList) {
    fenceMask[idx(f.c, f.r)] = 1;
    if (wallOwner[idx(f.c, f.r)] === 0) wallOwner[idx(f.c, f.r)] = -1;
  }
  const fences = tilesToRects(cols, rows, (i) => fenceMask[i] === 1, 0, 0);

  // ── Border colliders ──
  const border: Rect[] = [
    { x: 0, y: 0, w: size.w, h: BORDER * T },
    { x: 0, y: size.h - BORDER * T, w: size.w, h: BORDER * T },
    { x: 0, y: 0, w: BORDER * T, h: size.h },
    { x: size.w - BORDER * T, y: 0, w: BORDER * T, h: size.h },
  ];

  // ── Street furniture: lamps & parked cars ──
  addStreetProps(cityRng, props);

  // ── Upper floors: shelf-pack into the band below the city ──
  const upperBandY = size.h + UPPER_BAND_GAP;
  const uppers = buildings.flatMap((b) => b.floors.filter((f) => f.index > 0).map((f) => ({ b, f })));
  uppers.sort((a, b) => b.f.rows - a.f.rows || b.f.cols - a.f.cols || (a.b.id < b.b.id ? -1 : a.b.id > b.b.id ? 1 : a.f.index - b.f.index));
  let cx = 0;
  let cy = upperBandY / T;
  let shelfH = 0;
  for (const { f } of uppers) {
    if (cx + f.cols > cols) {
      cx = 0;
      cy += shelfH + UPPER_PAD;
      shelfH = 0;
    }
    f.bounds = { x: cx * T, y: cy * T, w: f.cols * T, h: f.rows * T };
    for (const w of f.walls) {
      w.x += f.bounds.x;
      w.y += f.bounds.y;
    }
    for (const fu of f.furniture) {
      fu.x += f.bounds.x;
      fu.y += f.bounds.y;
    }
    for (const rm of f.rooms) {
      rm.rect.x += f.bounds.x;
      rm.rect.y += f.bounds.y;
    }
    cx += f.cols + UPPER_PAD;
    shelfH = Math.max(shelfH, f.rows);
  }
  const upperBandBottom = (cy + shelfH) * T;

  // ── Stair links ──
  for (const b of buildings) {
    const flip = b.facing === 's';
    for (const f of b.floors) {
      const tileRect = (code: number): Rect | undefined => {
        let minC = Infinity, minR = Infinity, maxC = -1, maxR = -1;
        for (let i = 0; i < f.tiles.length; i++) {
          if (f.tiles[i] !== code) continue;
          const c = i % f.cols;
          const r = (i - c) / f.cols;
          minC = Math.min(minC, c); maxC = Math.max(maxC, c);
          minR = Math.min(minR, r); maxR = Math.max(maxR, r);
        }
        if (maxC < 0) return undefined;
        return { x: f.bounds.x + minC * T, y: f.bounds.y + minR * T, w: (maxC - minC + 1) * T, h: (maxR - minR + 1) * T };
      };
      const arrivalOn = (k: number, fromBelow: boolean) => {
        const target = b.floors[k];
        // Arrival tile in canonical coords, mapped to world orientation.
        const s = stairOf(target);
        const a = fromBelow ? arrivalFromBelow(s) : arrivalFromAbove(s);
        const r = flip ? target.rows - 1 - a.r : a.r;
        return { x: target.bounds.x + a.c * T, y: target.bounds.y + r * T };
      };
      const stairOf = (fl: CityFloor) => ({ sx: fl.cols - 1 - STAIR_W, sy: fl.rows - 1 - STAIR_H });
      const up = tileRect(FT.STAIR_UP);
      const down = tileRect(FT.STAIR_DOWN);
      if (up) f.up = { rect: up, toFloor: f.index + 1, arrival: arrivalOn(f.index + 1, true) } satisfies CityStairLink;
      if (down) f.down = { rect: down, toFloor: f.index - 1, arrival: arrivalOn(f.index - 1, false) } satisfies CityStairLink;
    }
  }

  return {
    seed,
    size,
    tile: T,
    cols,
    rows,
    ground,
    marks,
    wallOwner,
    roads: roadInfo,
    walls: [...border, ...fences, ...walls],
    fences,
    entrances,
    buildings,
    props,
    zones,
    defaultSpawn,
    upperBandY,
    upperBandBottom,
  };
}

function houseAddress(lot: Lot): string {
  const [bi, bj] = lot.blockId.slice(1).split('_').map(Number);
  const street = STREET_NAMES[lot.facing === 'n' ? bj : bj + 1] ?? 'Road';
  const num = (bi * 100 + lot.rect.c - AVENUE_COLS[bi]) * 2 + (lot.facing === 'n' ? 1 : 0);
  return `${num} ${street}`;
}

/** Park: grass, cross paths, central plaza with fountain, benches, trees. Returns the spawn. */
function buildPark(
  block: Block,
  seed: number,
  fillGround: (r: TileRect, k: number) => void,
  props: CityProp[],
): { x: number; y: number } {
  const { c, r, w, h } = block.rect;
  const pw = 12;
  const ph = 10;
  const plaza = { c: c + Math.floor((w - pw) / 2), r: r + Math.floor((h - ph) / 2), w: pw, h: ph };
  const midC = plaza.c + pw / 2 - 1;
  const midR = plaza.r + ph / 2 - 1;
  fillGround({ c: midC, r, w: 2, h }, GROUND.SIDEWALK);
  fillGround({ c, r: midR, w, h: 2 }, GROUND.SIDEWALK);
  fillGround(plaza, GROUND.PLAZA);

  const cx = (plaza.c + pw / 2) * T;
  const cy = (plaza.r + ph / 2) * T;
  props.push({ type: 'villageFountain', x: cx - 40, y: cy - 56 });
  props.push({ type: 'logBench', x: (plaza.c + 1) * T, y: (plaza.r + ph - 2) * T - 10 });
  props.push({ type: 'logBench', x: (plaza.c + pw - 4) * T, y: (plaza.r + ph - 2) * T - 10 });
  props.push({ type: 'logBench', x: (plaza.c + 1) * T, y: (plaza.r + 1) * T - 10 });
  props.push({ type: 'logBench', x: (plaza.c + pw - 4) * T, y: (plaza.r + 1) * T - 10 });
  props.push({ type: 'trashCan', x: (plaza.c + 4) * T + 2, y: (plaza.r + ph - 2) * T + 2 });
  props.push({ type: 'streetLantern', x: plaza.c * T - 4, y: plaza.r * T - 29 });
  props.push({ type: 'streetLantern', x: (plaza.c + pw - 1) * T - 4, y: plaza.r * T - 29 });

  const rng = mulberry32(seed ^ hash32(`${block.id}:park`));
  const clear = (tc: number, tr: number) =>
    (tc >= plaza.c - 2 && tc <= plaza.c + pw + 1 && tr >= plaza.r - 2 && tr <= plaza.r + ph + 1) ||
    (tc >= midC - 2 && tc <= midC + 3) ||
    (tr >= midR - 2 && tr <= midR + 3);
  for (let tr = r + 2; tr < r + h - 3; tr += 4) {
    for (let tc = c + 1; tc < c + w - 3; tc += 4) {
      const jc = tc + randInt(rng, 0, 1);
      const jr = tr + randInt(rng, 0, 1);
      if (clear(jc, jr) || clear(jc + 1, jr + 1) || rng() < 0.25) continue;
      props.push({ type: 'pineTree', x: jc * T - 20, y: jr * T - 50 });
    }
  }
  return { x: cx - 8, y: cy + 48 };
}

/** Lamp posts along sidewalks and parked cars in the curb lanes. */
function addStreetProps(rng: Rng, props: CityProp[]): void {
  const lamp = (c: number, r: number) => props.push({ type: 'streetLantern', x: c * T - 4, y: r * T - 29 });
  const nearAvenue = (c: number) => AVENUE_COLS.some((a) => c >= a - 2 && c <= a + ROAD_W + 1);
  const nearStreet = (r: number) => STREET_ROWS.some((s) => r >= s - 2 && r <= s + ROAD_W + 1);
  for (const s of STREET_ROWS) {
    for (let c = BORDER + 4; c < CITY_COLS - BORDER - 2; c += 10) {
      if (nearAvenue(c)) continue;
      if (s > BORDER) lamp(c, s);
      if (s + ROAD_W < CITY_ROWS - BORDER) lamp(c, s + ROAD_W - 1);
    }
  }
  for (const a of AVENUE_COLS) {
    for (let r = BORDER + 4; r < CITY_ROWS - BORDER - 2; r += 10) {
      if (nearStreet(r)) continue;
      if (a > BORDER) lamp(a, r);
      if (a + ROAD_W < CITY_COLS - BORDER) lamp(a + ROAD_W - 1, r);
    }
  }
  // E-W streets.
  for (const s of STREET_ROWS) {
    for (let i = 0; i < AVENUE_COLS.length - 1; i++) {
      const lo = AVENUE_COLS[i] + ROAD_W + 1;
      const hi = AVENUE_COLS[i + 1] - 5;
      for (const lane of [s + 1, s + 3]) {
        let c = lo + randInt(rng, 0, 6);
        while (c <= hi) {
          if (rng() < 0.45) props.push({ type: 'car', dir: 'h', variant: randInt(rng, 0, 5), x: c * T, y: lane * T + 2 });
          c += 4 + randInt(rng, 2, 10);
        }
      }
    }
  }
  // N-S avenues.
  for (const a of AVENUE_COLS) {
    for (let j = 0; j < STREET_ROWS.length - 1; j++) {
      const lo = STREET_ROWS[j] + ROAD_W + 1;
      const hi = STREET_ROWS[j + 1] - 5;
      for (const lane of [a + 1, a + 3]) {
        let r = lo + randInt(rng, 0, 6);
        while (r <= hi) {
          if (rng() < 0.35) props.push({ type: 'car', dir: 'v', variant: randInt(rng, 0, 5), x: lane * T + 2, y: r * T });
          r += 4 + randInt(rng, 2, 10);
        }
      }
    }
  }
}
