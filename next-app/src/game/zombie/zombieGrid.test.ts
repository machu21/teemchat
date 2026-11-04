import { describe, expect, it } from 'vitest';
import { MAP_HEIGHT, MAP_WIDTH } from '../collision';
import { getBoundaryWallsForMap, getBuildingsForMap } from '../map/mapRegistry';
import { isOpaque, tileIndex, TILE_INTERIOR } from './grid';
import { buildZombieGrid } from './zombieGrid';
import { computeFov, DEFAULT_FOV, VIS_VISIBLE } from './fov';

const walls = getBoundaryWallsForMap('village');
const buildings = getBuildingsForMap('village');
const grid = buildZombieGrid(walls, buildings, MAP_WIDTH, MAP_HEIGHT);

describe('buildZombieGrid (village)', () => {
  it('covers the off-map upper-floor band', () => {
    for (const b of buildings) {
      for (const l of b.levels ?? []) {
        expect(grid.rows * grid.tileSize).toBeGreaterThanOrEqual(l.bounds.y + l.bounds.h);
      }
    }
  });

  it('keeps the cottage doorway (x 164..204, y 180..196) open and its south wall solid', () => {
    expect(isOpaque(grid, 11, 11)).toBe(false);
    expect(isOpaque(grid, 7, 11)).toBe(true);
    expect(isOpaque(grid, 14, 11)).toBe(true);
  });

  it('marks building footprints as interior', () => {
    expect(grid.flags[tileIndex(grid, 10, 8)] & TILE_INTERIOR).toBeTruthy();
    expect(grid.flags[tileIndex(grid, 40, 30)] & TILE_INTERIOR).toBeFalsy();
  });

  it('lets a player standing outside see through the doorway into the cottage', () => {
    const fov = computeFov(grid, {
      originX: 184,
      originY: 240,
      facing: -Math.PI / 2,
      ...DEFAULT_FOV,
    });
    expect(fov.vis[tileIndex(grid, 11, 8)]).toBe(VIS_VISIBLE);
    // Side room behind the solid west part of the south wall stays hidden
    expect(fov.vis[tileIndex(grid, 6, 10)]).not.toBe(VIS_VISIBLE);
  });
});
