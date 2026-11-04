import { applyEntranceAction, entranceBlocksMovement } from '../entrances';
import { inBounds, isSolid, tileIndex, worldToTile } from '../grid';
import { BiteEvent, SimTarget, ZOMBIE, Zombie, ZombieSim, wallsBetween } from '../zombieSim';
import type { AbilityState, AiPhase, DamageType, Hazard, SpecialZombieType, StatusEffect, ZombieEntity, ZombieKind } from './types';

// ============================================================
// ZOMBIE MODE — SPECIAL INFECTED (Strategy pattern, host-only)
// ZombieSim keeps running movement, senses and the flow field for every
// zombie. Each special type is a SpecialBehavior strategy; while an ability
// is active it sets `locked` so the sim hands over movement.
// The SpecialsDirector runs after sim.tick(), dispatches to the strategy,
// applies world-side effects (breaches, rallies, gas clouds) and returns
// player-side effects (impacts, bursts) for the host to send.
// ============================================================

export type AbilityEvent =
  | { type: 'impact'; zombieId: number; targetId: string; x: number; y: number; damage: number; effects: StatusEffect[] }
  | { type: 'breach'; zombieId: number; tile: number }
  | { type: 'burst'; zombieId: number; x: number; y: number; radius: number; damage: number }
  | { type: 'roar'; zombieId: number; x: number; y: number; radius: number; targetId: string; rallied: number };

export interface SpecialContext {
  sim: ZombieSim;
  dt: number;
  targets: SimTarget[];
}

export interface SpecialBehavior {
  kind: SpecialZombieType;
  /** Stats applied on spawn. */
  init(z: Zombie): ZombieEntity;
  /** Called every tick after sim.tick(). */
  update(z: ZombieEntity, ctx: SpecialContext): AbilityEvent[];
  /** Called once when the zombie is removed (killed by anything). */
  onDeath?(z: ZombieEntity, ctx: SpecialContext): AbilityEvent[];
  /** Bite damage multiplier (sim bites are a flat ZOMBIE.attackDamage). */
  biteMul: number;
}

const TILE = 16;

export function isSpecial(z: Zombie): z is ZombieEntity {
  return 'kind' in z && (z as ZombieEntity).kind !== 'walker';
}

export function zombieKind(z: Zombie): ZombieKind {
  return isSpecial(z) ? z.kind : 'walker';
}

/** Design-level phase (Patrol / Alert / Chase / Attack / Ability) for HUD, audio and debugging. */
export function aiPhaseOf(z: Zombie): AiPhase {
  if (isSpecial(z) && z.locked) return 'ability';
  switch (z.state) {
    case 'idle':
    case 'wander':
      return 'patrol';
    case 'investigate':
      return 'alert';
    case 'chase':
      return 'chase';
    default:
      return 'attack';
  }
}

/** Damage after armour (calcified plates etc.). */
export function effectiveDamage(z: Zombie, amount: number, type: DamageType): number {
  return isSpecial(z) ? amount * (z.armor[type] ?? 1) : amount;
}

function entity(z: Zombie, kind: SpecialZombieType, maxHp: number, speedMul: number, mass: number, armor: ZombieEntity['armor'], ability: AbilityState): ZombieEntity {
  const e = z as ZombieEntity;
  e.kind = kind;
  e.maxHp = maxHp;
  e.hp = maxHp;
  e.speedMul = speedMul;
  e.mass = mass;
  e.armor = armor;
  e.ability = ability;
  return e;
}

function target(z: Zombie, ctx: SpecialContext): SimTarget | null {
  return z.targetId ? ctx.targets.find((t) => t.id === z.targetId) ?? null : null;
}

// ---------------------------------------------------------------- charger

export const CHARGER = {
  hp: 350,
  minRangeTiles: 3,
  maxRangeTiles: 10,
  windup: 0.7,
  chargeSeconds: 1.6,
  speed: 210,
  recover: 2,
  cooldown: 6,
  hitRadius: 14,
  impactDamage: 25,
  knockdownSeconds: 1.5,
} as const;

export const chargerBehavior: SpecialBehavior = {
  kind: 'charger',
  biteMul: 1.5,
  init: (z) =>
    entity(z, 'charger', CHARGER.hp, 1.1, 6, { ballistic: 0.8 }, { kind: 'charge', phase: 'ready', timer: 0, dirX: 0, dirY: 0, cooldown: 2, hit: [] }),
  update(z, ctx) {
    const a = z.ability;
    if (a.kind !== 'charge') return [];
    const events: AbilityEvent[] = [];
    switch (a.phase) {
      case 'ready': {
        a.cooldown -= ctx.dt;
        const t = target(z, ctx);
        if (!t || a.cooldown > 0 || z.state !== 'chase') break;
        const d = Math.hypot(t.x - z.x, t.y - z.y);
        if (d < CHARGER.minRangeTiles * TILE || d > CHARGER.maxRangeTiles * TILE) break;
        if (wallsBetween(ctx.sim.grid, z.x, z.y, t.x, t.y, 1) > 0) break;
        // Lock the direction now: the charge goes straight, dodging sideways works
        a.phase = 'windup';
        a.timer = CHARGER.windup;
        a.dirX = (t.x - z.x) / d;
        a.dirY = (t.y - z.y) / d;
        a.hit = [];
        z.facing = Math.atan2(a.dirY, a.dirX);
        z.locked = true;
        break;
      }
      case 'windup':
        a.timer -= ctx.dt;
        if (a.timer <= 0) {
          a.phase = 'charging';
          a.timer = CHARGER.chargeSeconds;
        }
        break;
      case 'charging': {
        a.timer -= ctx.dt;
        const g = ctx.sim.grid;
        const nx = z.x + a.dirX * CHARGER.speed * ctx.dt;
        const ny = z.y + a.dirY * CHARGER.speed * ctx.dt;
        for (const t of ctx.targets) {
          if (a.hit.includes(t.id) || Math.hypot(t.x - nx, t.y - ny) > CHARGER.hitRadius) continue;
          a.hit.push(t.id);
          events.push({
            type: 'impact',
            zombieId: z.id,
            targetId: t.id,
            x: t.x,
            y: t.y,
            damage: CHARGER.impactDamage,
            effects: [{ kind: 'knockdown', remaining: CHARGER.knockdownSeconds, magnitude: 1, source: `charger:${z.id}` }],
          });
        }
        const { col, row } = worldToTile(g, nx, ny);
        const tile = inBounds(g, col, row) ? tileIndex(g, col, row) : -1;
        const ent = tile >= 0 ? g.entrances.get(tile) : undefined;
        if (ent && entranceBlocksMovement(ent)) {
          // Battering ram: one hit smashes planks, then the frame (planks soak a whole hit each)
          let next = ent;
          for (let i = 0; i < 3 && entranceBlocksMovement(next); i++) next = applyEntranceAction(next, { type: 'damage', amount: 1000 });
          ctx.sim.setEntranceState(tile, next);
          events.push({ type: 'breach', zombieId: z.id, tile });
          a.phase = 'recover';
          a.timer = CHARGER.recover;
        } else if (tile < 0 || isSolid(g, col, row) || a.timer <= 0) {
          // Slammed into a wall (or ran out of steam): stunned and vulnerable
          a.phase = 'recover';
          a.timer = CHARGER.recover;
        } else {
          z.x = nx;
          z.y = ny;
          z.moving = true;
        }
        break;
      }
      case 'recover':
        a.timer -= ctx.dt;
        z.moving = false;
        if (a.timer <= 0) {
          a.phase = 'ready';
          a.cooldown = CHARGER.cooldown;
          z.locked = false;
          z.goalX = z.x;
          z.goalY = z.y;
        }
        break;
    }
    return events;
  },
};

// ---------------------------------------------------------------- bloater

export const BLOATER = {
  hp: 60,
  triggerTiles: 1.3,
  fuse: 0.6,
  burstRadiusTiles: 3,
  burstDamage: 20,
  gasRadiusTiles: 3.5,
  gasSeconds: 10,
} as const;

function burst(z: ZombieEntity): AbilityEvent[] {
  const a = z.ability;
  if (a.kind !== 'bloat' || a.burst) return [];
  a.burst = true;
  return [{ type: 'burst', zombieId: z.id, x: z.x, y: z.y, radius: BLOATER.burstRadiusTiles * TILE, damage: BLOATER.burstDamage }];
}

export const bloaterBehavior: SpecialBehavior = {
  kind: 'bloater',
  biteMul: 0.75,
  init: (z) => entity(z, 'bloater', BLOATER.hp, 0.7, 3, { melee: 1.2 }, { kind: 'bloat', fuse: null, burst: false }),
  update(z, ctx) {
    const a = z.ability;
    if (a.kind !== 'bloat' || a.burst) return [];
    if (a.fuse === null) {
      const near = ctx.targets.some((t) => Math.hypot(t.x - z.x, t.y - z.y) <= BLOATER.triggerTiles * TILE);
      if (near) {
        a.fuse = BLOATER.fuse;
        z.locked = true;
      }
      return [];
    }
    a.fuse -= ctx.dt;
    if (a.fuse > 0) return [];
    z.hp = 0; // the director removes it and skips onDeath (already burst)
    return burst(z);
  },
  onDeath: (z) => burst(z),
};

// ---------------------------------------------------------------- dreadnought

export const DREADNOUGHT = {
  hp: 1500,
  roarCooldown: 14,
  roarSeconds: 1.5,
  rallyRadiusTiles: 30,
} as const;

/** Pulls every ambient zombie within `radius` px onto `targetId`. Returns how many joined. */
export function rallyHorde(zombies: Zombie[], x: number, y: number, radius: number, targetId: string, exclude: number): number {
  let n = 0;
  const r2 = radius * radius;
  for (const o of zombies) {
    if (o.id === exclude || o.locked || (o.x - x) ** 2 + (o.y - y) ** 2 > r2) continue;
    if (o.state === 'attack' || o.state === 'attack_entrance') continue;
    o.state = 'chase';
    o.targetId = targetId;
    // Rallied zombies hunt longer than ones that merely spotted someone
    o.timer = ZOMBIE.loseTargetSeconds * 3;
    n++;
  }
  return n;
}

export const dreadnoughtBehavior: SpecialBehavior = {
  kind: 'dreadnought',
  biteMul: 3,
  init: (z) =>
    entity(z, 'dreadnought', DREADNOUGHT.hp, 0.6, 20, { ballistic: 0.35, melee: 0.8, explosive: 0.6, toxic: 0 }, { kind: 'roar', cooldown: 4, roaring: 0 }),
  update(z, ctx) {
    const a = z.ability;
    if (a.kind !== 'roar') return [];
    if (a.roaring > 0) {
      a.roaring -= ctx.dt;
      if (a.roaring <= 0) z.locked = false;
      return [];
    }
    a.cooldown -= ctx.dt;
    const t = target(z, ctx);
    if (!t || a.cooldown > 0 || (z.state !== 'chase' && z.state !== 'attack')) return [];
    a.cooldown = DREADNOUGHT.roarCooldown;
    a.roaring = DREADNOUGHT.roarSeconds;
    z.locked = true;
    const radius = DREADNOUGHT.rallyRadiusTiles * TILE;
    const rallied = rallyHorde(ctx.sim.zombies, z.x, z.y, radius, t.id, z.id);
    return [{ type: 'roar', zombieId: z.id, x: z.x, y: z.y, radius, targetId: t.id, rallied }];
  },
};

export const SPECIAL_BEHAVIORS: Record<SpecialZombieType, SpecialBehavior> = {
  charger: chargerBehavior,
  bloater: bloaterBehavior,
  dreadnought: dreadnoughtBehavior,
};

// ---------------------------------------------------------------- director

export const GAS_EFFECT_SECONDS = 1.5;

/** Effects for standing in toxic gas (refreshed every tick while inside). */
export function gasEffects(h: Hazard): StatusEffect[] {
  const source = `gas:${h.id}`;
  return [
    { kind: 'poison', remaining: GAS_EFFECT_SECONDS, magnitude: 3, source },
    { kind: 'slow', remaining: GAS_EFFECT_SECONDS, magnitude: 0.6, source },
    { kind: 'blinded', remaining: GAS_EFFECT_SECONDS, magnitude: 0.45, source },
  ];
}

export class SpecialsDirector {
  hazards: Hazard[] = [];
  private nextHazard = 1;
  /** Last-known state of every special, so deaths from any API trigger onDeath. */
  private known = new Map<number, ZombieEntity>();

  constructor(readonly sim: ZombieSim) {}

  spawn(kind: SpecialZombieType, x: number, y: number): ZombieEntity {
    return this.promote(this.sim.add(x, y), kind);
  }

  /** Turns an existing walker (e.g. one just spawned in a group) into a special. */
  promote(z: Zombie, kind: SpecialZombieType): ZombieEntity {
    const e = SPECIAL_BEHAVIORS[kind].init(z);
    this.known.set(e.id, e);
    return e;
  }

  /**
   * After a host handoff: specials received from snapshots become ours.
   * Ability state isn't on the wire, so it restarts (a charger mid-dash stops).
   */
  adoptAll() {
    this.known.clear();
    for (const z of this.sim.zombies) {
      if (!isSpecial(z)) continue;
      const hp = z.hp;
      SPECIAL_BEHAVIORS[z.kind as SpecialZombieType].init(z);
      z.hp = Math.min(hp, z.maxHp);
      z.locked = false;
      this.known.set(z.id, z);
    }
  }

  addHazard(x: number, y: number) {
    this.hazards.push({ id: this.nextHazard++, kind: 'toxic_gas', x, y, radius: BLOATER.gasRadiusTiles * TILE, remaining: BLOATER.gasSeconds });
  }

  /** Ages gas clouds (both roles; clients add hazards from snapshot effects). */
  tickHazards(dt: number) {
    this.hazards = this.hazards.filter((h) => (h.remaining -= dt) > 0);
  }

  /** Armour-aware damage (use instead of sim.damageZombie for anything that can hit a special). */
  damage(id: number, amount: number, type: DamageType, angle: number): boolean {
    const z = this.sim.zombies.find((o) => o.id === id);
    if (!z) return false;
    return this.sim.damageZombie(id, effectiveDamage(z, amount, type), angle);
  }

  /** Scales the sim's flat bites by special type. */
  scaleBites(bites: BiteEvent[]): BiteEvent[] {
    return bites.map((b) => {
      const z = this.known.get(b.zombieId);
      return z ? { ...b, damage: b.damage * SPECIAL_BEHAVIORS[z.kind as SpecialZombieType].biteMul } : b;
    });
  }

  /** Run right after sim.tick(dt, targets). */
  tick(dt: number, targets: SimTarget[]): AbilityEvent[] {
    const ctx: SpecialContext = { sim: this.sim, dt, targets };
    const events: AbilityEvent[] = [];
    const alive = new Set<number>();
    for (const z of this.sim.zombies) {
      if (!isSpecial(z)) continue;
      alive.add(z.id);
      this.known.set(z.id, z);
      events.push(...SPECIAL_BEHAVIORS[z.kind as SpecialZombieType].update(z, ctx));
    }
    // Self-destructed (bloater burst) → remove now
    if (this.sim.zombies.some((z) => z.hp <= 0)) this.sim.zombies = this.sim.zombies.filter((z) => z.hp > 0);
    for (const [id, z] of this.known) {
      if (alive.has(id) && z.hp > 0) continue;
      this.known.delete(id);
      events.push(...(SPECIAL_BEHAVIORS[z.kind as SpecialZombieType].onDeath?.(z, ctx) ?? []));
    }
    for (const e of events) if (e.type === 'burst') this.addHazard(e.x, e.y);
    this.tickHazards(dt);
    return events;
  }

  /** Status effects for a survivor standing at (x, y) — run by each client for itself. */
  hazardEffectsAt(x: number, y: number): StatusEffect[] {
    return this.hazards.filter((h) => Math.hypot(h.x - x, h.y - y) <= h.radius).flatMap(gasEffects);
  }

  clear() {
    this.hazards = [];
    this.known.clear();
  }
}
