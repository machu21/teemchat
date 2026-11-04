import { describe, expect, it } from 'vitest';
import { createTileGrid, setEntrance, setWall, tileIndex, TILE_OPAQUE, TILE_SOLID } from './grid';
import { computeFov, VIS_HIDDEN, VIS_PERIPHERAL, VIS_VISIBLE, visibilityAt } from './fov';
import { applyEntranceAction, DOOR_HP, Entrance, WINDOW_HP } from './entrances';

const TS = 16;
const center = (col: number, row: number) => ({ originX: col * TS + 8, originY: row * TS + 8 });
const EAST = 0;

function grid20() {
  return createTileGrid(20, 20, TS);
}

const baseParams = { coneAngle: Math.PI / 2, viewRadius: 8, peripheralRadius: 1.5 };

describe('computeFov', () => {
  it('sees tiles ahead inside the cone and hides tiles behind beyond peripheral range', () => {
    const g = grid20();
    const fov = computeFov(g, { ...center(10, 10), facing: EAST, ...baseParams });
    expect(fov.vis[tileIndex(g, 15, 10)]).toBe(VIS_VISIBLE);
    expect(fov.vis[tileIndex(g, 5, 10)]).toBe(VIS_HIDDEN);
    expect(fov.vis[tileIndex(g, 10, 10)]).toBe(VIS_VISIBLE);
  });

  it('marks tiles just behind the player as peripheral', () => {
    const g = grid20();
    const fov = computeFov(g, { ...center(10, 10), facing: EAST, ...baseParams });
    expect(fov.vis[tileIndex(g, 9, 10)]).toBe(VIS_PERIPHERAL);
  });

  it('respects the view radius', () => {
    const g = grid20();
    const fov = computeFov(g, { ...center(2, 10), facing: EAST, ...baseParams });
    expect(fov.vis[tileIndex(g, 10, 10)]).toBe(VIS_VISIBLE);
    expect(fov.vis[tileIndex(g, 11, 10)]).toBe(VIS_HIDDEN);
  });

  it('walls are visible but occlude what is behind them', () => {
    const g = grid20();
    for (let r = 0; r < 20; r++) setWall(g, 13, r);
    const fov = computeFov(g, { ...center(10, 10), facing: EAST, ...baseParams });
    expect(fov.vis[tileIndex(g, 13, 10)]).toBe(VIS_VISIBLE);
    expect(fov.vis[tileIndex(g, 14, 10)]).toBe(VIS_HIDDEN);
    expect(fov.vis[tileIndex(g, 16, 12)]).toBe(VIS_HIDDEN);
  });

  it('sees through an open door and not through a closed one', () => {
    const g = grid20();
    for (let r = 0; r < 20; r++) if (r !== 10) setWall(g, 13, r);
    const door: Entrance = { id: 'd1', kind: 'door', col: 13, row: 10, state: 'closed', planks: 0, hp: DOOR_HP };
    setEntrance(g, door);
    const params = { ...center(10, 10), facing: EAST, ...baseParams };
    expect(computeFov(g, params).vis[tileIndex(g, 15, 10)]).toBe(VIS_HIDDEN);

    setEntrance(g, applyEntranceAction(door, { type: 'toggle' }));
    expect(computeFov(g, params).vis[tileIndex(g, 15, 10)]).toBe(VIS_VISIBLE);
  });

  it('is symmetric: if A sees B with a full cone, B sees A', () => {
    const g = grid20();
    setWall(g, 8, 7);
    setWall(g, 9, 9);
    setWall(g, 12, 6);
    const full = { coneAngle: Math.PI * 2, viewRadius: 12, peripheralRadius: 0 };
    const a = { col: 5, row: 5 };
    const fromA = computeFov(g, { ...center(a.col, a.row), facing: 0, ...full });
    for (let r = 0; r < 20; r++) {
      for (let c = 0; c < 20; c++) {
        if (g.flags[tileIndex(g, c, r)] & TILE_OPAQUE) continue;
        if (fromA.vis[tileIndex(g, c, r)] !== VIS_VISIBLE) continue;
        const fromB = computeFov(g, { ...center(c, r), facing: 0, ...full });
        expect(fromB.vis[tileIndex(g, a.col, a.row)]).toBe(VIS_VISIBLE);
      }
    }
  });

  it('reuses the output buffer', () => {
    const g = grid20();
    const first = computeFov(g, { ...center(10, 10), facing: EAST, ...baseParams });
    const buf = first.vis;
    const second = computeFov(g, { ...center(3, 3), facing: EAST, ...baseParams }, first);
    expect(second.vis).toBe(buf);
    expect(visibilityAt(g, second, 15 * TS, 10 * TS)).toBe(VIS_HIDDEN);
  });
});

describe('entrances', () => {
  const window0: Entrance = { id: 'w', kind: 'window', col: 1, row: 1, state: 'closed', planks: 0, hp: WINDOW_HP };

  it('closed glass windows block movement but not sight', () => {
    const g = grid20();
    setEntrance(g, window0);
    const f = g.flags[tileIndex(g, 1, 1)];
    expect(f & TILE_SOLID).toBeTruthy();
    expect(f & TILE_OPAQUE).toBeFalsy();
  });

  it('barricading blocks sight and planks absorb damage before the frame', () => {
    let w = applyEntranceAction(window0, { type: 'addPlank' });
    w = applyEntranceAction(w, { type: 'addPlank' });
    expect(w.state).toBe('barricaded');
    w = applyEntranceAction(w, { type: 'damage', amount: 25 });
    expect(w.planks).toBe(1);
    expect(w.hp).toBe(WINDOW_HP);
    w = applyEntranceAction(w, { type: 'damage', amount: 25 });
    expect(w.state).toBe('closed');
    w = applyEntranceAction(w, { type: 'damage', amount: 100 });
    expect(w.state).toBe('broken');
  });

  it('cannot lock an open door or barricade an open doorway', () => {
    const open: Entrance = { id: 'd', kind: 'door', col: 0, row: 0, state: 'open', planks: 0, hp: DOOR_HP };
    expect(applyEntranceAction(open, { type: 'lock' })).toBe(open);
    expect(applyEntranceAction(open, { type: 'addPlank' })).toBe(open);
  });
});

describe('entrances: broken openings', () => {
  it('a broken window can be boarded, and losing every plank leaves it broken again', () => {
    let w: Entrance = { id: 'w', kind: 'window', col: 1, row: 1, state: 'broken', planks: 0, hp: 0 };
    w = applyEntranceAction(w, { type: 'addPlank' });
    expect(w.state).toBe('barricaded');
    w = applyEntranceAction(w, { type: 'damage', amount: 25 });
    expect(w.state).toBe('broken');
  });
});
