import { TILE_ENTRANCE, TILE_SOLID, TileGrid, inBounds, isOpaque, isSolid, setEntrance, tileIndex, worldToTile } from './grid';
import { Entrance, applyEntranceAction, entranceBlocksMovement } from './entrances';
import { mulberry32 } from '../art/character/appearance';

// ============================================================
// ZOMBIE MODE — SIMULATION (pure, DOM-free)
// - One shared BFS flow field toward every target (O(tiles), not O(zombies))
// - Detection: sight (LOS line + wide cone) and hearing (noise events,
//   halved per wall between source and zombie)
// - Fixed-step friendly: tick(dt) is deterministic for a given seed
// Runs on the client today; the same module can run on a host/server.
// ============================================================

export type ZombieState = 'idle' | 'wander' | 'investigate' | 'chase' | 'attack' | 'attack_entrance';
/** Wire order for ZombieState (index is sent over the network). Append only. */
export const ZOMBIE_STATES: readonly ZombieState[] = ['idle', 'wander', 'investigate', 'chase', 'attack', 'attack_entrance'];

export interface Zombie {
  id: number;
  /** Feet point in world px. */
  x: number;
  y: number;
  hp: number;
  state: ZombieState;
  /** Current movement goal (world px). */
  goalX: number;
  goalY: number;
  facing: number;
  /** Seconds left in idle / investigate / lose-target windows. */
  timer: number;
  attackCooldown: number;
  senseCooldown: number;
  targetId: string | null;
  /** Seconds since last damaged (drives hit flash). */
  sinceHit: number;
  moving: boolean;
  variant: number;
  /** Seconds left climbing stairs (then the zombie appears at climbX/climbY). */
  climb?: number;
  climbX?: number;
  climbY?: number;
  /** Tile index of the door/window this zombie is breaking down. */
  entranceTile?: number;
  /** Horde leader's id (own id for the leader); members wander after the leader. */
  leader?: number;
  /** An ability (survival/specials.ts) owns this zombie's movement: the sim skips its AI and movement. */
  locked?: boolean;
  /** Per-zombie speed multiplier (special type × difficulty). */
  speedMul?: number;
}

export interface SimTarget {
  id: string;
  /** Feet point in world px. */
  x: number;
  y: number;
}

export interface NoiseEvent {
  x: number;
  y: number;
  /** Audible radius in tiles. */
  radius: number;
}

interface FlowStep {
  x: number;
  y: number;
  kind: 'walk' | 'portal' | 'entrance';
  tile: number;
}

/** Noises at least this loud (tiles) lose only a quarter of their reach per wall. */
export const LOUD_NOISE_RADIUS = 12;

export interface BiteEvent {
  targetId: string;
  damage: number;
  zombieId: number;
}

export const ZOMBIE = {
  maxHp: 100,
  wanderSpeed: 16,
  chaseSpeed: 40,
  sightTiles: 7,
  /** Zombies notice anything this close regardless of facing/LOS. */
  closeSenseTiles: 1.5,
  sightCone: (220 * Math.PI) / 180,
  attackRange: 16,
  attackDamage: 8,
  attackCooldown: 1.4,
  loseTargetSeconds: 5,
  senseInterval: 0.25,
  separation: 11,
  flowRebuildSeconds: 0.25,
  /** Flow-field cost horizon (walk = 1 per tile, stairs = 3, blocked entrance = 8). */
  flowMaxDepth: 200,
  stairCost: 3,
  blockedEntranceCost: 8,
  climbSeconds: 0.6,
  entranceDamage: 15,
} as const;

const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

/** Count of opaque tiles strictly between two points (Bresenham). */
export function wallsBetween(grid: TileGrid, ax: number, ay: number, bx: number, by: number, stopAt = 99): number {
  let { col: x0, row: y0 } = worldToTile(grid, ax, ay);
  const { col: x1, row: y1 } = worldToTile(grid, bx, by);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let walls = 0;
  for (;;) {
    if (x0 === x1 && y0 === y1) return walls;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
    if (x0 === x1 && y0 === y1) return walls;
    if (isOpaque(grid, x0, y0) && ++walls >= stopAt) return walls;
  }
}

function wrap(a: number): number {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

export class ZombieSim {
  zombies: Zombie[] = [];
  private nextId = 1;
  private rng: () => number;
  /** BFS distance (tiles) to the nearest target; -1 = unreachable. */
  private flow: Int16Array;
  private flowKey = '';
  private flowAge = Infinity;
  /** Global speed multiplier (the host raises it at night). */
  speedScale = 1;
  /** Tile indexes of entrances changed by zombies since the last drain (for network sync). */
  readonly changedEntrances: Set<number> = new Set();
  /** Sight / hearing radius multiplier (difficulty). */
  aggroMul = 1;

  /**
   * @param spawnBounds world-px rect zombies may spawn/wander in (keeps them off the upper-floor band)
   */
  constructor(
    readonly grid: TileGrid,
    private spawnBounds: { x: number; y: number; w: number; h: number },
    seed: number = 1337
  ) {
    this.rng = mulberry32(seed);
    this.flow = new Int16Array(grid.cols * grid.rows).fill(-1);
  }

  private walkable(x: number, y: number): boolean {
    const { col, row } = worldToTile(this.grid, x, y);
    return inBounds(this.grid, col, row) && !isSolid(this.grid, col, row);
  }

  private inSpawnBounds(x: number, y: number): boolean {
    const b = this.spawnBounds;
    return x >= b.x && y >= b.y && x <= b.x + b.w && y <= b.y + b.h;
  }

  /** Spawns up to `count` zombies on walkable tiles at least `minDistTiles` from every target. */
  spawn(count: number, avoid: SimTarget[], minDistTiles: number = 14): number {
    const ts = this.grid.tileSize;
    const minD = minDistTiles * ts;
    let made = 0;
    for (let attempt = 0; attempt < count * 40 && made < count; attempt++) {
      const b = this.spawnBounds;
      const x = b.x + this.rng() * b.w;
      const y = b.y + this.rng() * b.h;
      if (!this.walkable(x, y)) continue;
      if (avoid.some((t) => Math.hypot(t.x - x, t.y - y) < minD)) continue;
      this.zombies.push(this.makeZombie(x, y));
      made++;
    }
    return made;
  }

  /** Adds one zombie at (x, y) with a fresh id (specials are built on top of this). */
  add(x: number, y: number): Zombie {
    const z = this.makeZombie(x, y);
    this.zombies.push(z);
    return z;
  }

  private makeZombie(x: number, y: number): Zombie {
    return {
      id: this.nextId++,
      x,
      y,
      hp: ZOMBIE.maxHp,
      state: 'idle',
      goalX: x,
      goalY: y,
      facing: this.rng() * Math.PI * 2 - Math.PI,
      timer: 1 + this.rng() * 4,
      attackCooldown: 0,
      senseCooldown: this.rng() * ZOMBIE.senseInterval,
      targetId: null,
      sinceHit: 99,
      moving: false,
      variant: Math.floor(this.rng() * 4),
    };
  }

  /**
   * Spawns a shambling group of `count` around an anchor in a ring
   * [minTiles, maxTiles] from (cx, cy), never within `avoidTiles` of any
   * player (so groups appear just outside sight, not on screen).
   * Returns how many were placed.
   */
  spawnGroup(cx: number, cy: number, minTiles: number, maxTiles: number, count: number, avoid: SimTarget[], avoidTiles: number): number {
    const ts = this.grid.tileSize;
    const minAvoid = avoidTiles * ts;
    const clear = (x: number, y: number) =>
      this.walkable(x, y) && this.inSpawnBounds(x, y) && !avoid.some((t) => Math.hypot(t.x - x, t.y - y) < minAvoid);
    for (let attempt = 0; attempt < 30; attempt++) {
      const a = this.rng() * Math.PI * 2;
      const r = (minTiles + this.rng() * (maxTiles - minTiles)) * ts;
      const ax = cx + Math.cos(a) * r;
      const ay = cy + Math.sin(a) * r;
      if (!clear(ax, ay)) continue;
      let made = 0;
      let leader: number | undefined;
      for (let k = 0; k < count * 8 && made < count; k++) {
        const x = ax + (this.rng() * 2 - 1) * 2.5 * ts;
        const y = ay + (this.rng() * 2 - 1) * 2.5 * ts;
        if (!clear(x, y) || wallsBetween(this.grid, ax, ay, x, y, 1) > 0) continue;
        const z = this.makeZombie(x, y);
        leader ??= z.id;
        z.leader = leader;
        this.zombies.push(z);
        made++;
      }
      if (made > 0) return made;
    }
    return 0;
  }

  /** Zombies within `tiles` of a point. */
  countNear(x: number, y: number, tiles: number): number {
    const r2 = (tiles * this.grid.tileSize) ** 2;
    let n = 0;
    for (const z of this.zombies) if ((z.x - x) ** 2 + (z.y - y) ** 2 <= r2) n++;
    return n;
  }

  /**
   * Recycles up to `limit` zombies farther than `tiles` from every player that
   * aren't hunting anyone, so the population budget is spent where people are.
   */
  despawnFar(players: SimTarget[], tiles: number, limit: number): number {
    if (!players.length) return 0;
    const r2 = (tiles * this.grid.tileSize) ** 2;
    let removed = 0;
    this.zombies = this.zombies.filter((z) => {
      if (removed >= limit || z.state === 'chase' || z.state === 'attack' || z.state === 'attack_entrance') return true;
      const far = players.every((p) => (p.x - z.x) ** 2 + (p.y - z.y) ** 2 > r2);
      if (far) removed++;
      return !far;
    });
    return removed;
  }

  /** Multi-source BFS from target tiles. Rebuilt at most every flowRebuildSeconds and only when targets change tile. */
  private rebuildFlow(targets: SimTarget[], dt: number) {
    this.flowAge += dt;
    const g = this.grid;
    const tiles: number[] = [];
    for (const t of targets) {
      const { col, row } = worldToTile(g, t.x, t.y);
      if (inBounds(g, col, row)) tiles.push(tileIndex(g, col, row));
    }
    const key = tiles.join(',');
    if (key === this.flowKey || this.flowAge < ZOMBIE.flowRebuildSeconds) return;
    this.flowKey = key;
    this.flowAge = 0;

    // Dial's algorithm (bucket queue): edge costs are small ints, so this is
    // Dijkstra in O(tiles) - walk 1, stairs portal 3, closed/barricaded entrance 8.
    const flow = this.flow;
    flow.fill(-1);
    const max = ZOMBIE.flowMaxDepth;
    const buckets: number[][] = [];
    for (let d = 0; d <= max; d++) buckets.push([]);
    for (const i of tiles) {
      if (flow[i] === 0) continue;
      flow[i] = 0;
      buckets[0].push(i);
    }
    const relax = (ni: number, nd: number) => {
      if (nd > max) return;
      const cur = flow[ni];
      if (cur !== -1 && cur <= nd) return;
      flow[ni] = nd;
      buckets[nd].push(ni);
    };
    for (let d = 0; d <= max; d++) {
      const bucket = buckets[d];
      for (let k = 0; k < bucket.length; k++) {
        const i = bucket[k];
        if (flow[i] !== d) continue; // stale entry
        const c = i % g.cols;
        const r = (i - c) / g.cols;
        for (let n = 0; n < 4; n++) {
          const nc = c + NEIGHBOURS[n][0];
          const nr = r + NEIGHBOURS[n][1];
          if (!inBounds(g, nc, nr)) continue;
          const ni = nr * g.cols + nc;
          const f = g.flags[ni];
          if (f & TILE_SOLID) {
            if (f & TILE_ENTRANCE) relax(ni, d + ZOMBIE.blockedEntranceCost);
            continue;
          }
          relax(ni, d + 1);
        }
        // Reverse stairs: tiles whose trigger leads here can reach the target through them
        const ins = g.portalIn.get(i);
        if (ins) for (const ni of ins) relax(ni, d + ZOMBIE.stairCost);
      }
    }
  }

  /** Forces the next flow rebuild (entrance or map state changed). */
  invalidateFlow() {
    this.flowKey = '';
    this.flowAge = Infinity;
  }

  /** Flow distance at a world point (-1 = unreachable / out of range). */
  flowAt(x: number, y: number): number {
    const { col, row } = worldToTile(this.grid, x, y);
    return inBounds(this.grid, col, row) ? this.flow[tileIndex(this.grid, col, row)] : -1;
  }

  /**
   * Next waypoint downhill on the flow field, or null. kind 'portal' means the
   * step is a stairs climb; 'entrance' means a closed/barricaded door or window is in the way.
   */
  private flowStep(x: number, y: number): FlowStep | null {
    const g = this.grid;
    const { col, row } = worldToTile(g, x, y);
    if (!inBounds(g, col, row)) return null;
    const hereIdx = tileIndex(g, col, row);
    const here = this.flow[hereIdx];
    if (here <= 0) return null;
    let best = here;
    let bi = -1;
    let kind: FlowStep['kind'] = 'walk';
    for (const [dc, dr] of NEIGHBOURS) {
      const nc = col + dc;
      const nr = row + dr;
      if (!inBounds(g, nc, nr)) continue;
      const ni = tileIndex(g, nc, nr);
      const blockedEntrance = (g.flags[ni] & TILE_SOLID) !== 0 && (g.flags[ni] & TILE_ENTRANCE) !== 0;
      if (isSolid(g, nc, nr) && !blockedEntrance) continue;
      if (dc !== 0 && dr !== 0) {
        // No corner cutting, and doors/windows are only entered head-on
        if (blockedEntrance || isSolid(g, col + dc, row) || isSolid(g, col, row + dr)) continue;
      }
      const d = this.flow[ni];
      if (d >= 0 && d < best) {
        best = d;
        bi = ni;
        kind = blockedEntrance ? 'entrance' : 'walk';
      }
    }
    const portalTo = g.portalOut.get(hereIdx);
    if (portalTo !== undefined) {
      const d = this.flow[portalTo];
      if (d >= 0 && d < best) {
        best = d;
        bi = portalTo;
        kind = 'portal';
      }
    }
    if (bi < 0) return null;
    const bc = bi % g.cols;
    const br = (bi - bc) / g.cols;
    return { x: (bc + 0.5) * g.tileSize, y: (br + 0.5) * g.tileSize, kind, tile: bi };
  }

  private canSee(z: Zombie, t: SimTarget): boolean {
    const ts = this.grid.tileSize;
    const d = Math.hypot(t.x - z.x, t.y - z.y) / ts;
    if (d <= ZOMBIE.closeSenseTiles) return true;
    if (d > ZOMBIE.sightTiles * this.aggroMul) return false;
    if (Math.abs(wrap(Math.atan2(t.y - z.y, t.x - z.x) - z.facing)) > ZOMBIE.sightCone / 2) return false;
    return wallsBetween(this.grid, z.x, z.y, t.x, t.y, 1) === 0;
  }

  /** Effective hearing: radius halves for each wall between noise and zombie. */
  private hears(z: Zombie, n: NoiseEvent): boolean {
    const d = Math.hypot(n.x - z.x, n.y - z.y) / this.grid.tileSize;
    const radius = n.radius * this.aggroMul;
    if (d > radius) return false;
    const walls = wallsBetween(this.grid, n.x, n.y, z.x, z.y, 3);
    // Quiet sounds die behind a wall; gunshots carry through buildings
    const damping = n.radius >= LOUD_NOISE_RADIUS ? 0.75 : 0.5;
    return d <= radius * Math.pow(damping, walls);
  }

  /**
   * Advances the simulation. `targets` are living players reachable by
   * zombies; `noises` are this tick's noise events (footsteps, swings, voice).
   */
  tick(dt: number, targets: SimTarget[], noises: NoiseEvent[] = []): BiteEvent[] {
    const bites: BiteEvent[] = [];
    this.rebuildFlow(targets, dt);

    for (const z of this.zombies) {
      z.sinceHit += dt;
      z.attackCooldown = Math.max(0, z.attackCooldown - dt);
      z.senseCooldown -= dt;

      // Mid-climb: frozen on the stairs, then pop out on the other floor
      if (z.climb !== undefined && z.climb > 0) {
        z.climb -= dt;
        z.moving = false;
        if (z.climb <= 0) {
          z.climb = undefined;
          z.x = z.climbX ?? z.x;
          z.y = z.climbY ?? z.y;
          z.goalX = z.x;
          z.goalY = z.y;
        }
        continue;
      }
      if (z.locked) {
        z.moving = false;
        continue;
      }

      // --- Senses (staggered, ~4 Hz per zombie) ---
      if (z.senseCooldown <= 0) {
        z.senseCooldown = ZOMBIE.senseInterval;
        let seen: SimTarget | null = null;
        let seenD = Infinity;
        for (const t of targets) {
          if (!this.canSee(z, t)) continue;
          const d = Math.hypot(t.x - z.x, t.y - z.y);
          if (d < seenD) {
            seen = t;
            seenD = d;
          }
        }
        if (seen) {
          z.targetId = seen.id;
          z.goalX = seen.x;
          z.goalY = seen.y;
          z.timer = ZOMBIE.loseTargetSeconds;
          if (z.state !== 'attack' && z.state !== 'attack_entrance') z.state = 'chase';
        }
      }

      // Hearing runs every tick: noise events only exist for the frame they happen in
      if (noises.length && z.state !== 'chase' && z.state !== 'attack' && z.state !== 'attack_entrance') {
        for (const n of noises) {
          if (!this.hears(z, n)) continue;
          z.state = 'investigate';
          z.goalX = n.x;
          z.goalY = n.y;
          z.timer = 8;
          break;
        }
      }

      const target = z.targetId ? targets.find((t) => t.id === z.targetId) ?? null : null;
      if ((z.state === 'chase' || z.state === 'attack') && !target) {
        z.state = 'investigate';
        z.targetId = null;
        z.timer = 4;
      }

      let speed = 0;
      switch (z.state) {
        case 'idle':
          z.timer -= dt;
          if (z.timer <= 0) this.pickWander(z);
          break;
        case 'wander':
          speed = ZOMBIE.wanderSpeed;
          if (Math.hypot(z.goalX - z.x, z.goalY - z.y) < 4) {
            z.state = 'idle';
            z.timer = 2 + this.rng() * 5;
          }
          break;
        case 'investigate':
          speed = ZOMBIE.wanderSpeed * 1.6;
          z.timer -= dt;
          if (z.timer <= 0 || Math.hypot(z.goalX - z.x, z.goalY - z.y) < 6) {
            z.state = 'idle';
            z.timer = 2 + this.rng() * 3;
          }
          break;
        case 'chase': {
          if (!target) break;
          z.timer -= dt;
          const dist = Math.hypot(target.x - z.x, target.y - z.y);
          if (dist <= ZOMBIE.attackRange) {
            z.state = 'attack';
            break;
          }
          if (z.timer <= 0) {
            // Lost them: shamble to where they were last seen
            z.state = 'investigate';
            z.targetId = null;
            z.timer = 6;
            break;
          }
          speed = ZOMBIE.chaseSpeed;
          const step = dist < this.grid.tileSize * 1.5 ? null : this.flowStep(z.x, z.y);
          if (step?.kind === 'portal') {
            // Stand on the stairs for a moment, then appear on the other floor
            z.climb = ZOMBIE.climbSeconds;
            z.climbX = step.x;
            z.climbY = step.y;
            speed = 0;
          } else if (step?.kind === 'entrance') {
            z.state = 'attack_entrance';
            z.entranceTile = step.tile;
            z.facing = Math.atan2(step.y - z.y, step.x - z.x);
            speed = 0;
          } else if (step) {
            z.goalX = step.x;
            z.goalY = step.y;
          } else {
            z.goalX = target.x;
            z.goalY = target.y;
          }
          break;
        }
        case 'attack_entrance': {
          const tile = z.entranceTile ?? -1;
          const e = this.grid.entrances.get(tile);
          if (!e || !entranceBlocksMovement(e)) {
            // Broke through (or someone opened it): resume the hunt
            z.entranceTile = undefined;
            z.state = target ? 'chase' : 'investigate';
            z.timer = target ? ZOMBIE.loseTargetSeconds : 4;
            break;
          }
          if (z.attackCooldown <= 0) {
            z.attackCooldown = ZOMBIE.attackCooldown;
            this.setEntranceState(tile, applyEntranceAction(e, { type: 'damage', amount: ZOMBIE.entranceDamage }));
          }
          break;
        }
        case 'attack': {
          if (!target) break;
          const dist = Math.hypot(target.x - z.x, target.y - z.y);
          z.facing = Math.atan2(target.y - z.y, target.x - z.x);
          if (dist > ZOMBIE.attackRange * 1.25) {
            z.state = 'chase';
            break;
          }
          if (z.attackCooldown <= 0) {
            z.attackCooldown = ZOMBIE.attackCooldown;
            bites.push({ targetId: target.id, damage: ZOMBIE.attackDamage, zombieId: z.id });
          }
          break;
        }
      }

      this.move(z, speed * (z.speedMul ?? 1) * this.speedScale, dt);
    }

    this.separate();
    return bites;
  }

  private pickWander(z: Zombie) {
    const ts = this.grid.tileSize;
    // Horde members drift toward their leader instead of scattering
    if (z.leader !== undefined && z.leader !== z.id) {
      const lead = this.zombies.find((o) => o.id === z.leader);
      if (!lead) {
        z.leader = undefined;
      } else if (Math.hypot(lead.x - z.x, lead.y - z.y) > 2 * ts) {
        for (let i = 0; i < 6; i++) {
          const gx = lead.goalX + (this.rng() * 2 - 1) * 1.5 * ts;
          const gy = lead.goalY + (this.rng() * 2 - 1) * 1.5 * ts;
          if (this.walkable(gx, gy) && wallsBetween(this.grid, z.x, z.y, gx, gy, 1) === 0) {
            z.state = 'wander';
            z.goalX = gx;
            z.goalY = gy;
            return;
          }
        }
      }
    }
    for (let i = 0; i < 8; i++) {
      const a = this.rng() * Math.PI * 2;
      const r = (2 + this.rng() * 5) * ts;
      const gx = z.x + Math.cos(a) * r;
      const gy = z.y + Math.sin(a) * r;
      if (this.walkable(gx, gy) && this.inSpawnBounds(gx, gy) && wallsBetween(this.grid, z.x, z.y, gx, gy, 1) === 0) {
        z.state = 'wander';
        z.goalX = gx;
        z.goalY = gy;
        return;
      }
    }
    z.timer = 1 + this.rng() * 2;
  }

  private move(z: Zombie, speed: number, dt: number) {
    const dx = z.goalX - z.x;
    const dy = z.goalY - z.y;
    const dist = Math.hypot(dx, dy);
    z.moving = speed > 0 && dist > 1;
    if (!z.moving) return;
    z.facing = Math.atan2(dy, dx);
    const stepLen = Math.min(dist, speed * dt);
    const nx = z.x + (dx / dist) * stepLen;
    const ny = z.y + (dy / dist) * stepLen;
    // Axis-separated slide against solid tiles
    if (this.walkable(nx, z.y)) z.x = nx;
    if (this.walkable(z.x, ny)) z.y = ny;
  }

  /** Cheap O(n²) push-apart so hordes queue at doorways instead of stacking. */
  private separate() {
    const zs = this.zombies;
    const min = ZOMBIE.separation;
    for (let i = 0; i < zs.length; i++) {
      for (let j = i + 1; j < zs.length; j++) {
        const a = zs[i];
        const b = zs[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const push = (min - d) / 2;
        const ux = dx / d;
        const uy = dy / d;
        if (this.walkable(a.x - ux * push, a.y - uy * push)) {
          a.x -= ux * push;
          a.y -= uy * push;
        }
        if (this.walkable(b.x + ux * push, b.y + uy * push)) {
          b.x += ux * push;
          b.y += uy * push;
        }
      }
    }
  }

  /**
   * Melee arc from (x, y) toward `facing`. Damages every zombie inside
   * `range` px and `arc` radians; removes the dead. Returns hits + kills.
   * `scale` adjusts damage per zombie (armour).
   */
  strike(
    x: number,
    y: number,
    facing: number,
    range: number,
    arc: number,
    damage: number,
    scale?: (z: Zombie) => number
  ): { hits: number; kills: number } {
    let hits = 0;
    for (const z of this.zombies) {
      const d = Math.hypot(z.x - x, z.y - y);
      if (d > range) continue;
      if (d > 6 && Math.abs(wrap(Math.atan2(z.y - y, z.x - x) - facing)) > arc / 2) continue;
      z.hp -= scale ? damage * scale(z) : damage;
      z.sinceHit = 0;
      // Knockback
      if (d > 0) {
        const kx = z.x + ((z.x - x) / d) * 8;
        const ky = z.y + ((z.y - y) / d) * 8;
        if (this.walkable(kx, ky)) {
          z.x = kx;
          z.y = ky;
        }
      }
      z.attackCooldown = Math.max(z.attackCooldown, 0.5);
      hits++;
    }
    const before = this.zombies.length;
    this.zombies = this.zombies.filter((z) => z.hp > 0);
    return { hits, kills: before - this.zombies.length };
  }

  /**
   * Bullet damage to one zombie (small knockback along `angle`). Returns true if it died.
   */
  damageZombie(id: number, damage: number, angle: number): boolean {
    const i = this.zombies.findIndex((z) => z.id === id);
    if (i < 0) return false;
    const z = this.zombies[i];
    z.hp -= damage;
    z.sinceHit = 0;
    const kx = z.x + Math.cos(angle) * 4;
    const ky = z.y + Math.sin(angle) * 4;
    if (this.walkable(kx, ky)) {
      z.x = kx;
      z.y = ky;
    }
    if (z.hp > 0) return false;
    this.zombies.splice(i, 1);
    return true;
  }

  /**
   * Takes over zombies received from a previous host: keeps ids unique and
   * restarts per-zombie timers so the horde doesn't act in lockstep.
   */
  adopt() {
    let maxId = 0;
    for (const z of this.zombies) {
      maxId = Math.max(maxId, z.id);
      z.senseCooldown = this.rng() * ZOMBIE.senseInterval;
      z.attackCooldown = 0;
      if (z.state === 'idle') z.timer = 1 + this.rng() * 3;
      if (z.state === 'chase' || z.state === 'attack') z.timer = ZOMBIE.loseTargetSeconds;
    }
    this.nextId = Math.max(this.nextId, maxId + 1);
    this.flowKey = '';
  }

  /**
   * Replaces an entrance (by tile index), updates grid SOLID/OPAQUE bits and
   * the flow field, and records it for sync. Used by zombies and by the host
   * when applying player door actions.
   */
  setEntranceState(tile: number, next: Entrance) {
    const prev = this.grid.entrances.get(tile);
    if (!prev || prev === next) return;
    setEntrance(this.grid, next);
    this.changedEntrances.add(tile);
    this.invalidateFlow();
  }

  /** Makes every zombie forget its target (e.g. after the player respawns). */
  calm() {
    for (const z of this.zombies) {
      if (z.state === 'chase' || z.state === 'attack' || z.state === 'investigate') {
        z.state = 'idle';
        z.targetId = null;
        z.timer = 2 + this.rng() * 3;
      }
    }
  }

  clear() {
    this.zombies = [];
    this.flowKey = '';
  }
}
