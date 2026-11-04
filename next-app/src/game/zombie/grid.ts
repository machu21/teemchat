import { Entrance, entranceBlocksMovement, entranceBlocksSight } from './entrances';

// ============================================================
// ZOMBIE MODE — TILE GRID
// Flat typed arrays (one byte per tile) so FOV, A*/flow fields and
// sound propagation stay allocation-free inside the 60fps loop.
// ============================================================

/** Bit flags stored per tile in `TileGrid.flags`. */
export const TILE_SOLID = 1; // blocks movement (walls, furniture)
export const TILE_OPAQUE = 2; // blocks sight (walls, closed doors)
export const TILE_INTERIOR = 4; // under a roof (drives cutaway + ambient audio)
export const TILE_ENTRANCE = 8; // has an Entrance record

export interface TileGrid {
  cols: number;
  rows: number;
  tileSize: number;
  flags: Uint8Array;
  /** Building id per tile (0 = outdoors). Index into a building table. */
  buildingIndex: Uint8Array;
  entrances: Map<number, Entrance>;
  /** Stairs: trigger tile → arrival tile on the other floor (zombies climb these). */
  portalOut: Map<number, number>;
  /** Reverse of portalOut (arrival tile → trigger tiles), for flow-field BFS from targets. */
  portalIn: Map<number, number[]>;
}

export function createTileGrid(cols: number, rows: number, tileSize: number): TileGrid {
  return {
    cols,
    rows,
    tileSize,
    flags: new Uint8Array(cols * rows),
    buildingIndex: new Uint8Array(cols * rows),
    entrances: new Map(),
    portalOut: new Map(),
    portalIn: new Map(),
  };
}

/** Links a stairs trigger tile to the tile a climber arrives on. */
export function addPortal(grid: TileGrid, from: number, to: number): void {
  grid.portalOut.set(from, to);
  const ins = grid.portalIn.get(to);
  if (ins) {
    if (!ins.includes(from)) ins.push(from);
  } else {
    grid.portalIn.set(to, [from]);
  }
}

export function tileIndex(grid: TileGrid, col: number, row: number): number {
  return row * grid.cols + col;
}

export function inBounds(grid: TileGrid, col: number, row: number): boolean {
  return col >= 0 && row >= 0 && col < grid.cols && row < grid.rows;
}

/** Out-of-bounds counts as opaque so rays never escape the map. */
export function isOpaque(grid: TileGrid, col: number, row: number): boolean {
  if (!inBounds(grid, col, row)) return true;
  return (grid.flags[tileIndex(grid, col, row)] & TILE_OPAQUE) !== 0;
}

export function isSolid(grid: TileGrid, col: number, row: number): boolean {
  if (!inBounds(grid, col, row)) return true;
  return (grid.flags[tileIndex(grid, col, row)] & TILE_SOLID) !== 0;
}

export function setWall(grid: TileGrid, col: number, row: number): void {
  grid.flags[tileIndex(grid, col, row)] |= TILE_SOLID | TILE_OPAQUE;
}

/** Places (or replaces) an entrance and syncs the tile's SOLID/OPAQUE bits. */
export function setEntrance(grid: TileGrid, entrance: Entrance): void {
  const i = tileIndex(grid, entrance.col, entrance.row);
  grid.entrances.set(i, entrance);
  let f = (grid.flags[i] | TILE_ENTRANCE) & ~(TILE_SOLID | TILE_OPAQUE);
  if (entranceBlocksMovement(entrance)) f |= TILE_SOLID;
  if (entranceBlocksSight(entrance)) f |= TILE_OPAQUE;
  grid.flags[i] = f;
}

export function worldToTile(grid: TileGrid, x: number, y: number): { col: number; row: number } {
  return { col: Math.floor(x / grid.tileSize), row: Math.floor(y / grid.tileSize) };
}
