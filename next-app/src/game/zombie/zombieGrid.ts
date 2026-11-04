import { Rect } from '../collision';
import { BuildingDefinition, getStairLinks, shellWalls } from '../map/buildings';
import { Entrance } from './entrances';
import { TILE_INTERIOR, TILE_SOLID, TileGrid, addPortal, createTileGrid, inBounds, setEntrance, setWall, tileIndex, worldToTile } from './grid';

// ============================================================
// ZOMBIE MODE — GRID BUILDER
// Rasterises the existing AABB map data into a TileGrid so maps
// keep a single source of truth (map/maps/*.ts + buildings.ts).
// Only structural walls block sight; furniture colliders do not.
// ============================================================

export const ZOMBIE_TILE = 16;

/**
 * Tile span covered by [start, end) in px. Edges snap to the nearest tile
 * line so a 40px doorway stays open; walls thinner than a tile still
 * claim the one tile they sit in.
 */
function span(start: number, end: number, ts: number, max: number): [number, number] {
  let a = Math.round(start / ts);
  let b = Math.round(end / ts) - 1;
  if (b < a) {
    a = Math.floor((start + end) / 2 / ts);
    b = a;
  }
  return [Math.max(0, a), Math.min(max - 1, b)];
}

function rasterise(grid: TileGrid, r: Rect, mark: (i: number) => void) {
  const [c0, c1] = span(r.x, r.x + r.w, grid.tileSize, grid.cols);
  const [r0, r1] = span(r.y, r.y + r.h, grid.tileSize, grid.rows);
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) mark(tileIndex(grid, col, row));
  }
}

/**
 * @param structuralWalls map boundary + building shell walls (world px)
 * @param buildings enterable buildings; footprints become INTERIOR tiles and upper-floor shells become walls
 */
export function buildZombieGrid(
  structuralWalls: Rect[],
  buildings: BuildingDefinition[],
  worldWidth: number,
  worldHeight: number,
  entrances: Entrance[] = [],
  lowWalls: Rect[] = []
): TileGrid {
  let bottom = worldHeight;
  for (const b of buildings) {
    for (const l of b.levels ?? []) bottom = Math.max(bottom, l.bounds.y + l.bounds.h);
  }
  const grid = createTileGrid(
    Math.ceil(worldWidth / ZOMBIE_TILE),
    Math.ceil(bottom / ZOMBIE_TILE),
    ZOMBIE_TILE
  );

  buildings.forEach((b, idx) => {
    const markInterior = (i: number) => {
      grid.flags[i] |= TILE_INTERIOR;
      grid.buildingIndex[i] = idx + 1;
    };
    rasterise(grid, b.footprint, markInterior);
    for (const l of b.levels ?? []) rasterise(grid, l.bounds, markInterior);
  });

  const walls = [...structuralWalls];
  for (const b of buildings) for (const l of b.levels ?? []) walls.push(...shellWalls(l.bounds));
  for (const w of walls) {
    rasterise(grid, w, (i) => setWall(grid, i % grid.cols, Math.floor(i / grid.cols)));
  }

  // Fences, cars, bins: zombies can't climb them, but you can see over them
  for (const w of lowWalls) rasterise(grid, w, (i) => (grid.flags[i] |= TILE_SOLID));

  // Doors / windows sit in wall gaps; their state drives SOLID/OPAQUE bits
  for (const e of entrances) if (inBounds(grid, e.col, e.row)) setEntrance(grid, e);

  // Stairs become portals: every tile of a trigger leads to the arrival tile upstairs/downstairs.
  // StairLink.arrival is the player's top-left; zombies navigate by feet (+16, +28).
  for (const b of buildings) {
    for (const stair of getStairLinks(b)) {
      const { col, row } = worldToTile(grid, stair.arrival.x + 16, stair.arrival.y + 28);
      if (!inBounds(grid, col, row)) continue;
      const to = tileIndex(grid, col, row);
      rasterise(grid, stair.rect, (from) => {
        if (from !== to) addPortal(grid, from, to);
      });
    }
  }
  return grid;
}
