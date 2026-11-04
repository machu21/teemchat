import { describe, it, expect } from 'vitest';
import {
  VILLAGE_BUILDINGS,
  EXIT_HYSTERESIS,
  ROOF_LIFT_MS,
  ROOF_DROP_MS,
  REDUCED_MOTION_MS,
  resolveBuildingAt,
  findNearestDoor,
  stepRoofProgress,
  easeOutCubic,
  findLevelAt,
  findStairAt,
  getBuildingWalls,
  getFloors,
  UPPER_LEVEL_Y,
} from './buildings';
import { getBuildingsForMap, getBoundaryWallsForMap } from './mapRegistry';
import { isPositionInWater } from './zones';
import { checkAABB, Rect } from '../collision';

const cottage = VILLAGE_BUILDINGS.find((b) => b.id === 'cottage')!;
const townhall = VILLAGE_BUILDINGS.find((b) => b.id === 'townhall')!;

// Player feet relative to the entity's top-left (matches WorldGame.updateBuildings)
const feet = (p: { x: number; y: number }) => ({ x: p.x + 16, y: p.y + 28 });
// Player collision hitbox (matches WorldGame.update)
const hitbox = (p: { x: number; y: number }) => ({ x: p.x + 8, y: p.y + 16, w: 16, h: 16 });

describe('building registry', () => {
  it('exposes buildings for the village only', () => {
    expect(getBuildingsForMap('village').map((b) => b.id)).toEqual(['cottage', 'townhall']);
    expect(getBuildingsForMap('office')).toEqual([]);
    expect(getBuildingsForMap(null).length).toBe(2);
  });

  it('places door spawn points where the player does not collide with walls', () => {
    const walls = getBoundaryWallsForMap('village');
    for (const b of VILLAGE_BUILDINGS) {
      for (const spawn of [b.door.insideSpawn, b.door.outsideSpawn]) {
        const hb = hitbox(spawn);
        expect(walls.some((w) => checkAABB(hb, w))).toBe(false);
      }
    }
  });

  it('resolves inside spawn as inside and outside spawn as outside', () => {
    for (const b of VILLAGE_BUILDINGS) {
      const inF = feet(b.door.insideSpawn);
      const outF = feet(b.door.outsideSpawn);
      expect(resolveBuildingAt(VILLAGE_BUILDINGS, null, inF.x, inF.y)).toBe(b.id);
      // Even when coming from inside, the outside spawn must clear the hysteresis band
      expect(resolveBuildingAt(VILLAGE_BUILDINGS, b.id, outF.x, outF.y)).toBeNull();
    }
  });
});

describe('resolveBuildingAt', () => {
  const bottom = cottage.footprint.y + cottage.footprint.h;
  const doorX = cottage.door.rect.x + cottage.door.rect.w / 2;

  it('enters as soon as feet cross the footprint', () => {
    expect(resolveBuildingAt(VILLAGE_BUILDINGS, null, doorX, bottom + 1)).toBeNull();
    expect(resolveBuildingAt(VILLAGE_BUILDINGS, null, doorX, bottom - 1)).toBe('cottage');
  });

  it('keeps the player inside within the hysteresis band', () => {
    expect(resolveBuildingAt(VILLAGE_BUILDINGS, 'cottage', doorX, bottom + EXIT_HYSTERESIS - 1)).toBe('cottage');
    expect(resolveBuildingAt(VILLAGE_BUILDINGS, 'cottage', doorX, bottom + EXIT_HYSTERESIS + 1)).toBeNull();
  });

  it('does not re-enter from outside within the band', () => {
    expect(resolveBuildingAt(VILLAGE_BUILDINGS, null, doorX, bottom + EXIT_HYSTERESIS - 1)).toBeNull();
  });

  it('switches directly to a neighbouring building', () => {
    const th = feet(townhall.door.insideSpawn);
    expect(resolveBuildingAt(VILLAGE_BUILDINGS, 'cottage', th.x, th.y)).toBe('townhall');
  });

  it('ignores an unknown current id', () => {
    expect(resolveBuildingAt(VILLAGE_BUILDINGS, 'missing', 10, 10)).toBeNull();
  });
});

describe('findNearestDoor', () => {
  it('finds the door from just outside it', () => {
    const p = feet(cottage.door.outsideSpawn);
    expect(findNearestDoor(VILLAGE_BUILDINGS, p.x, p.y)?.id).toBe('cottage');
  });

  it('returns null when far from any door', () => {
    expect(findNearestDoor(VILLAGE_BUILDINGS, 900, 700)).toBeNull();
  });

  it('picks the closer of two doors', () => {
    const p = feet(townhall.door.outsideSpawn);
    expect(findNearestDoor(VILLAGE_BUILDINGS, p.x, p.y)?.id).toBe('townhall');
  });
});

describe('roof progress', () => {
  it('lifts over ROOF_LIFT_MS and drops over ROOF_DROP_MS', () => {
    expect(stepRoofProgress(0, true, ROOF_LIFT_MS / 2)).toBeCloseTo(0.5);
    expect(stepRoofProgress(0, true, ROOF_LIFT_MS * 2)).toBe(1);
    expect(stepRoofProgress(1, false, ROOF_DROP_MS / 2)).toBeCloseTo(0.5);
    expect(stepRoofProgress(1, false, ROOF_DROP_MS * 2)).toBe(0);
  });

  it('reverses mid-transition from the current value', () => {
    const half = stepRoofProgress(0, true, ROOF_LIFT_MS / 2);
    expect(stepRoofProgress(half, false, 0)).toBeCloseTo(half);
  });

  it('uses the reduced-motion duration', () => {
    expect(stepRoofProgress(0, true, REDUCED_MOTION_MS / 2, true)).toBeCloseTo(0.5);
  });

  it('eases out', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });
});

// ── Multi-storey: stairs, upper floors, walkability ──

const allWalls = () => [...getBoundaryWallsForMap('village'), ...getBuildingWalls(VILLAGE_BUILDINGS)];
const collides = (p: { x: number; y: number }) => {
  const hb = hitbox(p);
  return allWalls().some((w) => checkAABB(hb, w));
};

/** BFS over player top-left positions in 4px steps, honouring every collider. */
function reachable(start: { x: number; y: number }, goal: Rect, area: Rect): boolean {
  const step = 4;
  const key = (x: number, y: number) => `${x},${y}`;
  const seen = new Set<string>([key(start.x, start.y)]);
  const queue = [start];
  while (queue.length) {
    const p = queue.shift()!;
    const f = feet(p);
    if (f.x >= goal.x && f.x <= goal.x + goal.w && f.y >= goal.y && f.y <= goal.y + goal.h) return true;
    for (const [dx, dy] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
      const n = { x: p.x + dx, y: p.y + dy };
      const nf = feet(n);
      if (nf.x < area.x || nf.x > area.x + area.w || nf.y < area.y || nf.y > area.y + area.h) continue;
      if (seen.has(key(n.x, n.y)) || collides(n)) continue;
      seen.add(key(n.x, n.y));
      queue.push(n);
    }
  }
  return false;
}

describe('multi-storey buildings', () => {
  it('gives both village buildings a 2F above a 1F', () => {
    for (const b of VILLAGE_BUILDINGS) {
      expect(getFloors(b).map((f) => f.label)).toEqual(['2F', '1F']);
      expect(b.levels![0].bounds.y).toBeGreaterThanOrEqual(UPPER_LEVEL_Y);
    }
  });

  it('keeps upper floors apart so their clip margins never overlap', () => {
    const [a, b] = VILLAGE_BUILDINGS.map((x) => x.levels![0].bounds);
    expect(b.x - (a.x + a.w)).toBeGreaterThan(48);
  });

  it('lands stair arrivals on free floor, off any stairs trigger, on the right floor', () => {
    for (const b of VILLAGE_BUILDINGS) {
      const up = b.groundStairs!;
      const down = b.levels![0].stairs;
      for (const stair of [up, down]) {
        expect(collides(stair.arrival)).toBe(false);
        const f = feet(stair.arrival);
        expect(findStairAt(VILLAGE_BUILDINGS, f.x, f.y)).toBeNull();
      }
      const upFeet = feet(up.arrival);
      expect(findLevelAt(VILLAGE_BUILDINGS, upFeet.x, upFeet.y)?.level.id).toBe(up.toLevelId);
      const downFeet = feet(down.arrival);
      expect(findLevelAt(VILLAGE_BUILDINGS, downFeet.x, downFeet.y)).toBeNull();
      expect(resolveBuildingAt(VILLAGE_BUILDINGS, null, downFeet.x, downFeet.y)).toBe(b.id);
    }
  });

  it('keeps door spawns clear of the new furniture colliders', () => {
    for (const b of VILLAGE_BUILDINGS) {
      expect(collides(b.door.insideSpawn)).toBe(false);
      expect(collides(b.door.outsideSpawn)).toBe(false);
    }
  });

  it('lets a player walk from the front door to the stairs', () => {
    for (const b of VILLAGE_BUILDINGS) {
      expect(reachable(b.door.insideSpawn, b.groundStairs!.rect, b.footprint)).toBe(true);
    }
  });

  it('lets a player walk from the 2F arrival back to the stairs', () => {
    for (const b of VILLAGE_BUILDINGS) {
      const level = b.levels![0];
      expect(reachable(b.groundStairs!.arrival, level.stairs.rect, level.bounds)).toBe(true);
    }
  });

  it('never treats upper floors as water', () => {
    for (const b of VILLAGE_BUILDINGS) {
      const l = b.levels![0].bounds;
      expect(isPositionInWater(l.x + l.w / 2, l.y + l.h / 2, 'village')).toBe(false);
    }
  });

  it('ignores outdoor positions when looking for upper floors', () => {
    expect(findLevelAt(VILLAGE_BUILDINGS, 168, 120)).toBeNull();
  });
});
