// ============================================================
// ZOMBIE CITY — STREET GRID & DISTRICTS (tile space)
// One fixed, hand-laid city: avenues (N-S) every ~42 tiles, streets (E-W)
// every ~32 tiles, each road 6 tiles (1 sidewalk + 4 asphalt + 1 sidewalk).
// Blocks between roads get a hand-placed district or landmark.
// ============================================================

import type { BuildingKind, CityDistrict } from './templates';

export const CITY_TILE = 16;
export const CITY_COLS = 420;
export const CITY_ROWS = 270;
/** Solid border thickness in tiles (matches WALL_THICK = 32 px). */
export const BORDER = 2;
export const ROAD_W = 6;
export const ALLEY_W = 2;

/**
 * Left column of each N-S avenue (sidewalk included). Blocks are ~52 × 46 tiles
 * so buildings have room for real-sized rooms around a 36 px tall avatar.
 */
export const AVENUE_COLS = [2, 60, 118, 176, 234, 292, 350, 412];
/** Top row of each E-W street (sidewalk included). */
export const STREET_ROWS = [2, 54, 106, 158, 210, 262];

export interface TileRect {
  c: number;
  r: number;
  w: number;
  h: number;
}

export interface Road {
  rect: TileRect;
  /** 'v' = avenue (runs north-south), 'h' = street (runs east-west). */
  dir: 'h' | 'v';
}

export interface Block {
  id: string;
  /** Block column / row index in the street grid. */
  bi: number;
  bj: number;
  rect: TileRect;
  district: CityDistrict;
  landmark?: BuildingKind;
  /** Column (absolute tile) of a 2-tile N-S service alley, if any. */
  alleyCol?: number;
}

export function blockId(bi: number, bj: number): string {
  return `b${bi}_${bj}`;
}

export function getRoads(): Road[] {
  const roads: Road[] = [];
  const innerH = CITY_ROWS - BORDER * 2;
  const innerW = CITY_COLS - BORDER * 2;
  for (const c of AVENUE_COLS) roads.push({ dir: 'v', rect: { c, r: BORDER, w: ROAD_W, h: innerH } });
  for (const r of STREET_ROWS) roads.push({ dir: 'h', rect: { c: BORDER, r, w: innerW, h: ROAD_W } });
  return roads;
}

/** Hand-placed districts, keyed by `bi,bj` (7 × 5 blocks). Unlisted = residential. */
const DOWNTOWN = new Set(['2,1', '3,1', '4,1', '2,2', '4,2']);
const COMMERCIAL = new Set(['3,0', '1,1', '5,1', '1,2', '5,2', '2,3', '3,3', '4,3']);
const PARK = new Set(['3,2']);
const LANDMARKS: Record<string, BuildingKind> = {
  '5,0': 'police',
  '1,3': 'hospital',
  '5,3': 'gasStation',
};
/** Blocks that get a N-S service alley down the middle. */
const ALLEYS = new Set(['2,1', '4,1', '1,2', '5,2', '2,3', '4,3']);

export function getBlocks(): Block[] {
  const blocks: Block[] = [];
  for (let bj = 0; bj < STREET_ROWS.length - 1; bj++) {
    for (let bi = 0; bi < AVENUE_COLS.length - 1; bi++) {
      const c = AVENUE_COLS[bi] + ROAD_W;
      const r = STREET_ROWS[bj] + ROAD_W;
      const rect = { c, r, w: AVENUE_COLS[bi + 1] - c, h: STREET_ROWS[bj + 1] - r };
      const key = `${bi},${bj}`;
      let district: CityDistrict = 'residential';
      if (DOWNTOWN.has(key)) district = 'downtown';
      else if (COMMERCIAL.has(key)) district = 'commercial';
      else if (PARK.has(key)) district = 'park';
      const landmark = LANDMARKS[key];
      if (landmark) district = 'landmark';
      const block: Block = { id: blockId(bi, bj), bi, bj, rect, district };
      if (landmark) block.landmark = landmark;
      if (ALLEYS.has(key) && rect.w >= 30) block.alleyCol = c + Math.floor(rect.w / 2) - 1;
      blocks.push(block);
    }
  }
  return blocks;
}
