import { describe, expect, it } from 'vitest';
import { createTileGrid, setWall } from './grid';
import { Zombie, ZombieSim, ZOMBIE, wallsBetween } from './zombieSim';

const TS = 16;
const at = (col: number, row: number) => ({ x: col * TS + 8, y: row * TS + 8 });

function makeSim() {
  const grid = createTileGrid(40, 30, TS);
  const sim = new ZombieSim(grid, { x: 0, y: 0, w: 40 * TS, h: 30 * TS }, 7);
  return { grid, sim };
}

function addZombie(sim: ZombieSim, col: number, row: number, facing = 0): Zombie {
  const p = at(col, row);
  const z: Zombie = {
    id: sim.zombies.length + 1,
    x: p.x,
    y: p.y,
    hp: ZOMBIE.maxHp,
    state: 'idle',
    goalX: p.x,
    goalY: p.y,
    facing,
    timer: 100,
    attackCooldown: 0,
    senseCooldown: 0,
    targetId: null,
    sinceHit: 99,
    moving: false,
    variant: 0,
  };
  sim.zombies.push(z);
  return z;
}

function run(sim: ZombieSim, seconds: number, targets: { id: string; x: number; y: number }[]) {
  const bites = [];
  for (let t = 0; t < seconds; t += 0.05) bites.push(...sim.tick(0.05, targets));
  return bites;
}

describe('wallsBetween', () => {
  it('counts opaque tiles on the line, excluding endpoints', () => {
    const { grid } = makeSim();
    setWall(grid, 5, 5);
    expect(wallsBetween(grid, at(2, 5).x, at(2, 5).y, at(8, 5).x, at(8, 5).y)).toBe(1);
    expect(wallsBetween(grid, at(2, 6).x, at(2, 6).y, at(8, 6).x, at(8, 6).y)).toBe(0);
  });
});

describe('ZombieSim', () => {
  it('spawns away from players on walkable tiles', () => {
    const { sim } = makeSim();
    const player = { id: 'p', ...at(5, 5) };
    expect(sim.spawn(10, [player], 10)).toBe(10);
    for (const z of sim.zombies) {
      expect(Math.hypot(z.x - player.x, z.y - player.y)).toBeGreaterThanOrEqual(10 * TS);
    }
  });

  it('chases a visible player and bites when in range', () => {
    const { sim } = makeSim();
    const z = addZombie(sim, 10, 10, 0);
    const player = { id: 'p', ...at(15, 10) };
    const bites = run(sim, 4, [player]);
    expect(z.targetId).toBe('p');
    expect(bites.length).toBeGreaterThan(0);
    expect(bites[0]).toMatchObject({ targetId: 'p', damage: ZOMBIE.attackDamage });
  });

  it('does not see a player behind a wall', () => {
    const { grid, sim } = makeSim();
    for (let r = 0; r < 30; r++) setWall(grid, 12, r);
    const z = addZombie(sim, 10, 10, 0);
    run(sim, 1, [{ id: 'p', ...at(15, 10) }]);
    expect(z.state).not.toBe('chase');
  });

  it('pathfinds around a wall via the flow field', () => {
    const { grid, sim } = makeSim();
    // Wall with a gap at row 20
    for (let r = 0; r < 30; r++) if (r !== 20) setWall(grid, 12, r);
    const z = addZombie(sim, 10, 10, 0);
    const player = { id: 'p', ...at(14, 10) };
    // Let it notice first (close sense ignores walls only within 1.5 tiles, so force chase)
    z.state = 'chase';
    z.targetId = 'p';
    z.timer = 999;
    const bites = run(sim, 20, [player]);
    expect(z.x).toBeGreaterThan(12 * TS);
    expect(bites.length).toBeGreaterThan(0);
  });

  it('investigates noise but walls muffle it', () => {
    const { sim } = makeSim();
    const open = addZombie(sim, 5, 5, Math.PI);
    sim.tick(0.05, [], [{ ...at(10, 5), radius: 6 }]);
    expect(open.state).toBe('investigate');

    const { grid: g2, sim: s2 } = makeSim();
    for (let r = 0; r < 30; r++) setWall(g2, 7, r);
    const muffled = addZombie(s2, 5, 5, Math.PI);
    s2.tick(0.05, [], [{ ...at(10, 5), radius: 6 }]);
    expect(muffled.state).toBe('idle');
  });

  it('strike damages zombies in the arc and removes the dead', () => {
    const { sim } = makeSim();
    const front = addZombie(sim, 11, 10);
    addZombie(sim, 9, 10); // behind
    const p = at(10, 10);
    const r1 = sim.strike(p.x, p.y, 0, 24, Math.PI / 2, 60);
    expect(r1.hits).toBe(1);
    expect(front.hp).toBe(40);
    const r2 = sim.strike(p.x, p.y, 0, 32, Math.PI / 2, 60);
    expect(r2.kills).toBe(1);
    expect(sim.zombies.length).toBe(1);
  });
});

describe('ZombieSim stairs and entrances', () => {
  it('follows a player up the stairs on the village cottage', async () => {
    const { MAP_WIDTH, MAP_HEIGHT } = await import('../collision');
    const { getBoundaryWallsForMap, getBuildingsForMap } = await import('../map/mapRegistry');
    const { buildZombieGrid } = await import('./zombieGrid');
    const buildings = getBuildingsForMap('village');
    const grid = buildZombieGrid(getBoundaryWallsForMap('village'), buildings, MAP_WIDTH, MAP_HEIGHT);
    expect(grid.portalOut.size).toBeGreaterThan(0);

    const cottage = buildings.find((b) => b.levels && b.levels.length > 0)!;
    const level = cottage.levels![0];
    const sim = new ZombieSim(grid, { x: 0, y: 0, w: MAP_WIDTH, h: MAP_HEIGHT }, 3);
    const f = cottage.footprint;
    const z = addZombie(sim, 0, 0);
    // Stand just inside the cottage's ground floor
    z.x = f.x + f.w / 2;
    z.y = f.y + f.h - 40;
    z.state = 'chase';
    z.targetId = 'p';
    z.timer = 999;
    const upstairs = { id: 'p', x: level.bounds.x + level.bounds.w / 2, y: level.bounds.y + level.bounds.h / 2 };
    for (let t = 0; t < 30 && z.y < level.bounds.y; t += 0.05) sim.tick(0.05, [upstairs]);
    expect(z.y).toBeGreaterThanOrEqual(level.bounds.y);
  });

  it('breaks down a closed door to reach a player, and planks hold it longer', async () => {
    const { setEntrance, tileIndex: ti } = await import('./grid');
    const { DOOR_HP } = await import('./entrances');
    const run = (planks: number) => {
      const { grid, sim } = makeSim();
      for (let r = 0; r < 30; r++) if (r !== 10) setWall(grid, 12, r);
      setEntrance(grid, { id: 'door', kind: 'door', col: 12, row: 10, state: planks ? 'barricaded' : 'closed', planks, hp: DOOR_HP });
      const z = addZombie(sim, 9, 10, 0);
      z.state = 'chase';
      z.targetId = 'p';
      z.timer = 999;
      const player = { id: 'p', ...at(16, 10) };
      let t = 0;
      while (t < 120 && z.x < 13.5 * TS) {
        sim.tick(0.05, [player]);
        t += 0.05;
      }
      return { t, z, door: grid.entrances.get(ti(grid, 12, 10))!, changed: sim.changedEntrances.size };
    };
    const plain = run(0);
    expect(plain.door.state).toBe('broken');
    expect(plain.z.x).toBeGreaterThanOrEqual(13.5 * TS);
    expect(plain.changed).toBe(1);
    const boarded = run(4);
    expect(boarded.door.state).toBe('broken');
    expect(boarded.t).toBeGreaterThan(plain.t);
  });
});
