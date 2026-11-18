import { describe, expect, it } from 'vitest';
import { getMapConfig, getMapSize } from '../map/mapRegistry';
import { CUE_COLORS, badgePoint, entranceCue, entranceGroupId, exteriorSide } from './entranceCues';
import { Entrance } from './entrances';
import { createTileGrid, tileIndex } from './grid';
import { buildZombieGrid } from './zombieGrid';

const ent = (over: Partial<Entrance>): Entrance => ({
  id: 'e',
  kind: 'door',
  col: 0,
  row: 0,
  state: 'closed',
  planks: 0,
  hp: 100,
  ...over,
});

describe('entranceCue', () => {
  it('marks passable openings green and names the state', () => {
    expect(entranceCue(ent({ state: 'open' }))).toMatchObject({ tone: CUE_COLORS.passable, passable: true, label: 'Open' });
    expect(entranceCue(ent({ kind: 'window', state: 'broken' }))).toMatchObject({ passable: true, label: 'Smashed' });
  });

  it('tells closed doors from closed windows, and flags locked / boarded', () => {
    expect(entranceCue(ent({ state: 'closed' })).tone).toBe(CUE_COLORS.closed);
    expect(entranceCue(ent({ kind: 'window', state: 'closed' })).tone).toBe(CUE_COLORS.glass);
    expect(entranceCue(ent({ state: 'locked' }))).toMatchObject({ tone: CUE_COLORS.locked, icon: 'lock', passable: false });
    expect(entranceCue(ent({ state: 'barricaded', planks: 3 }))).toMatchObject({ label: 'Boarded 3/4', icon: 'hammer' });
  });
});

describe('exteriorSide', () => {
  // 6×6 grid with a building on cols 1–4, rows 1–4
  const grid = createTileGrid(6, 6, 16);
  for (let r = 1; r <= 4; r++) for (let c = 1; c <= 4; c++) grid.buildingIndex[tileIndex(grid, c, r)] = 1;

  it('returns the side that faces outdoors', () => {
    expect(exteriorSide(grid, ent({ col: 2, row: 4 }))).toBe('s');
    expect(exteriorSide(grid, ent({ col: 2, row: 1 }))).toBe('n');
    expect(exteriorSide(grid, ent({ col: 4, row: 2 }))).toBe('e');
    expect(exteriorSide(grid, ent({ col: 1, row: 2 }))).toBe('w');
  });

  it('returns null for interior doorways', () => {
    expect(exteriorSide(grid, ent({ col: 2, row: 2 }))).toBeNull();
  });
});

describe('zombie_city roof markers', () => {
  const city = getMapConfig('zombie_city');
  const size = getMapSize('zombie_city');
  const buildings = city.buildings ?? [];
  const grid = buildZombieGrid(city.boundaryWalls, buildings, size.w, size.h, city.entrances);
  const T = grid.tileSize;

  it('gives every building at least one exterior door on its footprint', () => {
    const missing: string[] = [];
    for (const b of buildings) {
      const f = b.footprint;
      const doors = (city.entrances ?? []).filter((e) => {
        const cx = (e.col + 0.5) * T;
        const cy = (e.row + 0.5) * T;
        return e.kind === 'door' && cx >= f.x && cx <= f.x + f.w && cy >= f.y && cy <= f.y + f.h && exteriorSide(grid, e) !== null;
      });
      if (!doors.length) missing.push(b.id);
    }
    expect(missing).toEqual([]);
  });
});

describe('badgePoint', () => {
  it('centres one badge across double-door leaves, on the awning outside the roof edge', () => {
    const leaves = [ent({ id: 'b1:0', col: 4, row: 10 }), ent({ id: 'b1:1', col: 5, row: 10 })];
    const p = badgePoint(leaves, 's', 16);
    expect(p.x).toBe(5 * 16);
    expect(p.y).toBeGreaterThan(11 * 16);
    expect(entranceGroupId(leaves[0])).toBe(entranceGroupId(leaves[1]));
  });
});
