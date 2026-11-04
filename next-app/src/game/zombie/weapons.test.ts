import { describe, expect, it } from 'vitest';
import { createTileGrid, setEntrance, setWall, tileIndex } from './grid';
import { BODY_RADIUS, TORSO_LIFT, WEAPONS, castBullet, shotAngles, startingMag } from './weapons';
import { WINDOW_HP } from './entrances';

const TS = 16;
const grid = () => createTileGrid(40, 20, TS);

describe('castBullet', () => {
  it('hits the nearest zombie on the line of fire', () => {
    const g = grid();
    const r = castBullet(g, [{ id: 1, x: 200, y: 100 + TORSO_LIFT }, { id: 2, x: 120, y: 100 + TORSO_LIFT }], 50, 100, 0, 400);
    expect(r.targetId).toBe(2);
    expect(r.endX).toBeLessThan(120);
  });

  it('misses zombies off the line and beyond range', () => {
    const g = grid();
    expect(castBullet(g, [{ id: 1, x: 200, y: 100 + TORSO_LIFT + BODY_RADIUS + 4 }], 50, 100, 0, 400).targetId).toBeNull();
    expect(castBullet(g, [{ id: 1, x: 500, y: 100 + TORSO_LIFT }], 50, 100, 0, 300).targetId).toBeNull();
  });

  it('walls stop bullets; glass windows shatter and let them through', () => {
    const g = grid();
    for (let r = 0; r < 20; r++) setWall(g, 8, r);
    const z = [{ id: 1, x: 200, y: 100 + TORSO_LIFT }];
    const blocked = castBullet(g, z, 50, 100, 0, 400);
    expect(blocked.targetId).toBeNull();
    expect(blocked.endX).toBeLessThanOrEqual(8 * TS + 4);

    setEntrance(g, { id: 'w', kind: 'window', col: 8, row: 6, state: 'closed', planks: 0, hp: WINDOW_HP });
    const through = castBullet(g, z, 50, 100, 0, 400);
    expect(through.targetId).toBe(1);
    expect(through.windows).toEqual([tileIndex(g, 8, 6)]);
  });

  it('shotguns fire 8 pellets inside their spread; guns start half loaded (belts full)', () => {
    const angles = shotAngles(WEAPONS.shotgun, 1, Math.random);
    expect(angles).toHaveLength(8);
    for (const a of angles) expect(Math.abs(a - 1)).toBeLessThanOrEqual(WEAPONS.shotgun.spread);
    expect(startingMag('pistol')).toBe(6);
    expect(startingMag('mg')).toBe(100);
  });
});
