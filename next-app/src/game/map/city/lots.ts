// ============================================================
// ZOMBIE CITY — LOTS & BUILDING LAYOUTS (tile space, pure)
// Blocks → lots → footprints → per-floor tile layouts.
// Layouts are generated in a CANONICAL frame (row 0 = street side) and
// flipped by the caller for south-facing lots.
// ============================================================

import { ALLEY_W, type Block, type TileRect } from './layout';
import {
  ROOM_TEMPLATES,
  type BuildingKind,
  type BuildingTemplate,
  type CityDistrict,
  type CityFurnitureKind,
  type RoomKind,
} from './templates';
import { FT } from './types';

export type Rng = () => number;

export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function shuffle<T>(rng: Rng, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

// ------------------------------------------------------------------ lots

export interface Lot {
  id: string;
  blockId: string;
  index: number;
  /** World tile rect. */
  rect: TileRect;
  /** Street side: 'n' = the street north of the lot. */
  facing: 'n' | 's';
  district: CityDistrict;
  /** Rightmost lot of its row segment (gets the closing east fence). */
  lastInRow: boolean;
}

const LOT_TARGET_W: Record<CityDistrict, number> = {
  residential: 17,
  commercial: 17,
  downtown: 26,
  landmark: 999,
  park: 999,
};

/** Splits a block into lots: a north-facing row and a south-facing row (one lot for landmarks). */
export function subdivideBlock(block: Block, district: CityDistrict, alleyCol: number | undefined): Lot[] {
  const { rect } = block;
  if (district === 'park') return [];
  if (district === 'landmark') {
    return [{ id: `${block.id}:0`, blockId: block.id, index: 0, rect: { ...rect }, facing: 's', district, lastInRow: true }];
  }
  const segments: { c: number; w: number }[] = [];
  if (alleyCol !== undefined) {
    segments.push({ c: rect.c, w: alleyCol - rect.c });
    segments.push({ c: alleyCol + ALLEY_W, w: rect.c + rect.w - alleyCol - ALLEY_W });
  } else {
    segments.push({ c: rect.c, w: rect.w });
  }
  const topH = Math.floor(rect.h / 2);
  const rows: { r: number; h: number; facing: 'n' | 's' }[] = [
    { r: rect.r, h: topH, facing: 'n' },
    { r: rect.r + topH, h: rect.h - topH, facing: 's' },
  ];
  const lots: Lot[] = [];
  for (const row of rows) {
    for (const seg of segments) {
      const n = Math.max(1, Math.round(seg.w / LOT_TARGET_W[district]));
      const base = Math.floor(seg.w / n);
      let extra = seg.w - base * n;
      let c = seg.c;
      for (let i = 0; i < n; i++) {
        const w = base + (extra > 0 ? 1 : 0);
        if (extra > 0) extra--;
        const index = lots.length;
        lots.push({
          id: `${block.id}:${index}`,
          blockId: block.id,
          index,
          rect: { c, r: row.r, w, h: row.h },
          facing: row.facing,
          district,
          lastInRow: i === n - 1,
        });
        c += w;
      }
    }
  }
  return lots;
}

/** Maps a canonical lot-local rect (row 0 = street edge) to world tiles. */
export function lotRectToWorld(lot: Lot, r: TileRect): TileRect {
  const row = lot.facing === 'n' ? lot.rect.r + r.r : lot.rect.r + lot.rect.h - r.r - r.h;
  return { c: lot.rect.c + r.c, r: row, w: r.w, h: r.h };
}

export interface Insets {
  front: number;
  back: number;
  left: number;
  right: number;
}

export function insetsFor(district: CityDistrict, kind: BuildingKind): Insets {
  if (kind === 'gasStation') return { front: 0, back: 2, left: 0, right: 0 }; // special-cased
  switch (district) {
    case 'residential':
      return { front: 5, back: 2, left: 2, right: 2 };
    case 'commercial':
      return { front: 2, back: 3, left: 1, right: 1 };
    case 'downtown':
      return { front: 2, back: 2, left: 1, right: 1 };
    case 'landmark':
      return { front: 5, back: 3, left: 3, right: 3 };
    default:
      return { front: 1, back: 1, left: 1, right: 1 };
  }
}

/** Canonical lot-local footprint for a building on this lot. */
export function footprintInLot(lot: Lot, kind: BuildingKind): TileRect {
  const { w, h } = lot.rect;
  if (kind === 'gasStation') {
    const fw = Math.min(18, w - 4);
    const fh = 11;
    return { c: Math.floor((w - fw) / 2), r: h - fh - 2, w: fw, h: fh };
  }
  const ins = insetsFor(lot.district, kind);
  return { c: ins.left, r: ins.front, w: w - ins.left - ins.right, h: h - ins.front - ins.back };
}

// ------------------------------------------------------------------ building layout

export interface LayoutFurniture {
  kind: CityFurnitureKind;
  c: number;
  r: number;
  w: number;
  h: number;
}

export interface FloorLayout {
  /** fw × fh `FT` codes in canonical orientation. */
  tiles: Uint8Array;
  rooms: { kind: RoomKind; rect: TileRect }[];
  furniture: LayoutFurniture[];
}

export interface StairLayout {
  /** Top-left of the 4×2 stairwell: down = cols sx..sx+1, up = cols sx+2..sx+3. */
  sx: number;
  sy: number;
}

export interface BuildingLayout {
  fw: number;
  fh: number;
  doorCol: number;
  floors: FloorLayout[];
  stair?: StairLayout;
  /** Ground-floor window tiles (canonical). */
  windows: { c: number; r: number }[];
}

export const STAIR_W = 4;
export const STAIR_H = 2;
/** Front doors and interior doorways are 2 tiles wide: the avatar is ~2 tiles wide. */
export const DOOR_W = 2;
/** Smallest room side (tiles) when partitioning, so rooms read as rooms around a 36 px avatar. */
export const MIN_ROOM = 5;

/** Canonical arrival tiles next to the stairwell. */
export function arrivalFromBelow(s: StairLayout): { c: number; r: number } {
  return { c: s.sx, r: s.sy - 1 };
}
export function arrivalFromAbove(s: StairLayout): { c: number; r: number } {
  return { c: s.sx + STAIR_W - 1, r: s.sy - 1 };
}

function rectsOverlap(a: TileRect, b: TileRect): boolean {
  return a.c < b.c + b.w && a.c + a.w > b.c && a.r < b.r + b.h && a.r + a.h > b.r;
}

function isWalkable(t: number): boolean {
  return t === FT.FLOOR || t === FT.STAIR_UP || t === FT.STAIR_DOWN;
}

/** All walkable, unoccupied tiles are reachable from `start` (4-neighbour flood fill). */
let scratchSeen = new Uint8Array(0);
let scratchStack = new Int32Array(0);

function floorConnected(tiles: Uint8Array, occ: Uint8Array, fw: number, fh: number, start: number): boolean {
  if (!isWalkable(tiles[start]) || occ[start]) return false;
  const n = fw * fh;
  if (scratchSeen.length < n) {
    scratchSeen = new Uint8Array(n);
    scratchStack = new Int32Array(n);
  }
  const seen = scratchSeen;
  const stack = scratchStack;
  seen.fill(0, 0, n);
  let sp = 0;
  stack[sp++] = start;
  seen[start] = 1;
  let reached = 0;
  // The shell ring is never walkable, so interior neighbours never leave the grid.
  while (sp > 0) {
    const i = stack[--sp];
    reached++;
    for (let k = 0; k < 4; k++) {
      const j = k === 0 ? i - 1 : k === 1 ? i + 1 : k === 2 ? i - fw : i + fw;
      if (j < 0 || j >= n || seen[j] || occ[j] || !isWalkable(tiles[j])) continue;
      seen[j] = 1;
      stack[sp++] = j;
    }
  }
  let total = 0;
  for (let i = 0; i < n; i++) if (!occ[i] && isWalkable(tiles[i])) total++;
  return reached === total;
}

interface BspResult {
  rooms: TileRect[];
  /** Tiles that must stay clear of furniture (doorway approaches). */
  keepClear: number[];
}

/** Splits the interior 1–N times with 1-tile partitions, each with a doorway gap. */
function partition(
  tiles: Uint8Array,
  fw: number,
  interior: TileRect,
  splits: number,
  rng: Rng,
  avoid: TileRect | null,
  doorCol: number | null,
): BspResult {
  const regions: TileRect[] = [interior];
  const keepClear: number[] = [];
  const gaps = new Set<number>();
  const at = (c: number, r: number) => r * fw + c;
  const fh = tiles.length / fw;
  const blocked = (c: number, r: number) => {
    if (c < 0 || r < 0 || c >= fw || r >= fh) return false;
    const t = tiles[at(c, r)];
    return gaps.has(at(c, r)) || t === FT.DOOR || t === FT.WINDOW;
  };

  for (let s = 0; s < splits; s++) {
    const order = regions.map((_, i) => i).sort((a, b) => regions[b].w * regions[b].h - regions[a].w * regions[a].h);
    let done = false;
    for (const ri of order) {
      const reg = regions[ri];
      const axes: ('v' | 'h')[] = reg.w >= reg.h ? ['v', 'h'] : ['h', 'v'];
      for (const axis of axes) {
        const span = axis === 'v' ? reg.w : reg.h;
        if (span < MIN_ROOM * 2 + 1) continue;
        const minRoom = MIN_ROOM;
        const start = axis === 'v' ? reg.c : reg.r;
        const cands: number[] = [];
        for (let p = start + minRoom; p <= start + span - minRoom - 1; p++) cands.push(p);
        shuffle(rng, cands);
        for (const p of cands) {
          const line: TileRect = axis === 'v' ? { c: p, r: reg.r, w: 1, h: reg.h } : { c: reg.c, r: p, w: reg.w, h: 1 };
          if (avoid && rectsOverlap(line, avoid)) continue;
          if (axis === 'v') {
            if (doorCol !== null && reg.r === interior.r && p >= doorCol - 1 && p <= doorCol + DOOR_W) continue;
            if (blocked(p, reg.r - 1) || blocked(p, reg.r + reg.h)) continue;
          } else if (blocked(reg.c - 1, p) || blocked(reg.c + reg.w, p)) continue;
          // Draw the partition and cut a doorway.
          const len = axis === 'v' ? reg.h : reg.w;
          const g = randInt(rng, 1, len - 1 - DOOR_W);
          for (let k = 0; k < len; k++) {
            const c = axis === 'v' ? p : reg.c + k;
            const r = axis === 'v' ? reg.r + k : p;
            if (k >= g && k < g + DOOR_W) {
              gaps.add(at(c, r));
              if (axis === 'v') keepClear.push(at(c - 1, r), at(c + 1, r));
              else keepClear.push(at(c, r - 1), at(c, r + 1));
            } else tiles[at(c, r)] = FT.WALL;
          }
          let a: TileRect;
          let b: TileRect;
          if (axis === 'v') {
            a = { c: reg.c, r: reg.r, w: p - reg.c, h: reg.h };
            b = { c: p + 1, r: reg.r, w: reg.c + reg.w - p - 1, h: reg.h };
          } else {
            a = { c: reg.c, r: reg.r, w: reg.w, h: p - reg.r };
            b = { c: reg.c, r: p + 1, w: reg.w, h: reg.r + reg.h - p - 1 };
          }
          regions.splice(ri, 1, a, b);
          done = true;
          break;
        }
        if (done) break;
      }
      if (done) break;
    }
    if (!done) break;
  }
  return { rooms: regions, keepClear };
}

function placeFurniture(
  tiles: Uint8Array,
  fw: number,
  fh: number,
  rooms: { kind: RoomKind; rect: TileRect }[],
  reserved: Uint8Array,
  start: number,
  rng: Rng,
): LayoutFurniture[] {
  const occ = new Uint8Array(fw * fh);
  const out: LayoutFurniture[] = [];
  for (const room of rooms) {
    const specs = ROOM_TEMPLATES[room.kind];
    const area = room.rect.w * room.rect.h;
    const limit = Math.max(1, Math.min(specs.length, Math.floor(area / 10)));
    for (let si = 0; si < limit; si++) {
      const spec = specs[si];
      const cands: LayoutFurniture[] = [];
      const shapes = spec.w === spec.h ? [[spec.w, spec.h]] : [[spec.w, spec.h], [spec.h, spec.w]];
      for (const [w, h] of shapes) {
        for (let r = room.rect.r; r <= room.rect.r + room.rect.h - h; r++) {
          for (let c = room.rect.c; c <= room.rect.c + room.rect.w - w; c++) {
            const touches =
              c === room.rect.c || r === room.rect.r || c + w === room.rect.c + room.rect.w || r + h === room.rect.r + room.rect.h;
            if (touches) cands.push({ kind: spec.kind, c, r, w, h });
          }
        }
      }
      shuffle(rng, cands);
      let floods = 0;
      for (const f of cands) {
        let free = true;
        for (let r = f.r; r < f.r + f.h && free; r++) {
          for (let c = f.c; c < f.c + f.w; c++) {
            const i = r * fw + c;
            if (tiles[i] !== FT.FLOOR || reserved[i] || occ[i]) {
              free = false;
              break;
            }
          }
        }
        if (!free) continue;
        for (let r = f.r; r < f.r + f.h; r++) for (let c = f.c; c < f.c + f.w; c++) occ[r * fw + c] = 1;
        if (floorConnected(tiles, occ, fw, fh, start)) {
          out.push(f);
          break;
        }
        for (let r = f.r; r < f.r + f.h; r++) for (let c = f.c; c < f.c + f.w; c++) occ[r * fw + c] = 0;
        if (++floods >= 4) break;
      }
    }
  }
  return out;
}

function addWindows(tiles: Uint8Array, fw: number, fh: number, doorCol: number | null, step: [number, number], rng: Rng): { c: number; r: number }[] {
  const out: { c: number; r: number }[] = [];
  const at = (c: number, r: number) => r * fw + c;
  const sides: { len: number; tile: (k: number) => [number, number]; inner: (k: number) => [number, number]; front: boolean }[] = [
    { len: fw, tile: (k) => [k, 0], inner: (k) => [k, 1], front: true },
    { len: fw, tile: (k) => [k, fh - 1], inner: (k) => [k, fh - 2], front: false },
    { len: fh, tile: (k) => [0, k], inner: (k) => [1, k], front: false },
    { len: fh, tile: (k) => [fw - 1, k], inner: (k) => [fw - 2, k], front: false },
  ];
  for (const side of sides) {
    let k = randInt(rng, 2, 3);
    while (k <= side.len - 3) {
      const [c, r] = side.tile(k);
      const [ic, ir] = side.inner(k);
      const ok =
        tiles[at(c, r)] === FT.WALL &&
        tiles[at(ic, ir)] !== FT.WALL &&
        !(side.front && doorCol !== null && c >= doorCol - 1 && c <= doorCol + DOOR_W);
      if (ok) {
        tiles[at(c, r)] = FT.WINDOW;
        out.push({ c, r });
        k += randInt(rng, step[0], step[1]);
      } else k++;
    }
  }
  return out;
}

/**
 * Generates every floor of a building in canonical orientation (row 0 = front).
 * Floor 0 has the front door; all floors share the stairwell position.
 */
export function layoutBuilding(fw: number, fh: number, floorCount: number, tpl: BuildingTemplate, rng: Rng): BuildingLayout {
  const multi = floorCount > 1 && fw >= 10 && fh >= 9;
  const floors = multi ? floorCount : 1;
  const doorCol = Math.max(2, Math.min(fw - 2 - DOOR_W, Math.floor(fw / 2) - 1 + randInt(rng, -2, 1)));
  const stair: StairLayout | undefined = multi ? { sx: fw - 1 - STAIR_W, sy: fh - 1 - STAIR_H } : undefined;
  const interior: TileRect = { c: 1, r: 1, w: fw - 2, h: fh - 2 };
  const avoid: TileRect | null = stair ? { c: stair.sx - 1, r: stair.sy - 2, w: STAIR_W + 1, h: STAIR_H + 2 } : null;
  const area = interior.w * interior.h;
  const maxSplits = area >= 450 ? 4 : area >= 300 ? 3 : area >= 60 ? 2 : area >= 24 ? 1 : 0;

  const out: FloorLayout[] = [];
  let groundWindows: { c: number; r: number }[] = [];
  for (let k = 0; k < floors; k++) {
    const tiles = new Uint8Array(fw * fh);
    for (let r = 0; r < fh; r++) {
      for (let c = 0; c < fw; c++) {
        if (r === 0 || c === 0 || r === fh - 1 || c === fw - 1) tiles[r * fw + c] = FT.WALL;
      }
    }
    const ground = k === 0;
    if (ground) for (let d = 0; d < DOOR_W; d++) tiles[doorCol + d] = FT.DOOR;
    if (stair) {
      for (let r = stair.sy; r < stair.sy + STAIR_H; r++) {
        for (let c = stair.sx; c < stair.sx + STAIR_W; c++) {
          const isUp = c >= stair.sx + 2;
          if (isUp && k < floors - 1) tiles[r * fw + c] = FT.STAIR_UP;
          if (!isUp && k > 0) tiles[r * fw + c] = FT.STAIR_DOWN;
        }
      }
    }
    const splits = maxSplits === 0 ? 0 : randInt(rng, Math.max(1, maxSplits - 1), maxSplits);
    const bsp = partition(tiles, fw, interior, splits, rng, avoid, ground ? doorCol : null);
    const windows = addWindows(tiles, fw, fh, ground ? doorCol : null, tpl.windowStep, rng);
    if (ground) groundWindows = windows;

    // Rooms: biggest gets the first programme entry.
    const programme = ground ? tpl.groundRooms : tpl.upperRooms;
    const sorted = [...bsp.rooms].sort((a, b) => b.w * b.h - a.w * a.h || a.r - b.r || a.c - b.c);
    const rooms = sorted.map((rect, i) => ({ kind: programme[Math.min(i, programme.length - 1)], rect }));

    const reserved = new Uint8Array(fw * fh);
    for (const i of bsp.keepClear) reserved[i] = 1;
    // Keep a 2-tile-wide, 2-deep landing clear inside the front door
    for (let d = 0; d < DOOR_W; d++) {
      reserved[fw + doorCol + d] = 1;
      reserved[2 * fw + doorCol + d] = 1;
    }
    if (stair) {
      for (let r = stair.sy - 1; r < stair.sy + STAIR_H; r++) {
        for (let c = stair.sx - 1; c < stair.sx + STAIR_W; c++) reserved[r * fw + c] = 1;
      }
    }
    const startTile = ground || !stair ? fw + doorCol : (() => {
      const a = arrivalFromBelow(stair);
      return a.r * fw + a.c;
    })();
    const furniture = placeFurniture(tiles, fw, fh, rooms, reserved, startTile, rng);
    out.push({ tiles, rooms, furniture });
  }
  return { fw, fh, doorCol, floors: out, stair, windows: groundWindows };
}

/** Flips a canonical layout vertically (for south-facing lots). */
export function flipFloor(f: FloorLayout, fw: number, fh: number): FloorLayout {
  const tiles = new Uint8Array(fw * fh);
  for (let r = 0; r < fh; r++) tiles.set(f.tiles.subarray(r * fw, r * fw + fw), (fh - 1 - r) * fw);
  return {
    tiles,
    rooms: f.rooms.map((rm) => ({ kind: rm.kind, rect: { ...rm.rect, r: fh - rm.rect.r - rm.rect.h } })),
    furniture: f.furniture.map((fu) => ({ ...fu, r: fh - fu.r - fu.h })),
  };
}

/** Canonical yard-fence tiles for a residential lot (gate gap in front of the door). */
export function fenceTiles(lot: Lot, gateCol: number): { c: number; r: number }[] {
  const { w, h } = lot.rect;
  const out: { c: number; r: number }[] = [];
  for (let c = 0; c < w; c++) if (c !== gateCol && c !== gateCol + 1) out.push({ c, r: 0 });
  for (let r = 1; r < h; r++) out.push({ c: 0, r });
  if (lot.facing === 'n') for (let c = 1; c < w; c++) out.push({ c, r: h - 1 });
  if (lot.lastInRow) for (let r = 1; r < h - (lot.facing === 'n' ? 1 : 0); r++) out.push({ c: w - 1, r });
  return out;
}
