import { TILE_ENTRANCE, TILE_OPAQUE, TileGrid, inBounds, tileIndex } from './grid';
import type { ConsumableId } from './survival/types';
import type { IconName } from '@/lib/icons';

// ============================================================
// ZOMBIE MODE — WEAPONS (pure, DOM-free)
// Stats for melee + firearms and hitscan bullet resolution on the tile
// grid. Guns are loud: every shot is a noise event, so firing pulls hordes.
// Melee weapons wear out (durability, in hits), cost stamina per swing,
// can crit, and the heavy ones knock zombies down.
// ============================================================

export type MeleeId = 'fists' | 'axe' | 'bat' | 'crowbar' | 'pipe' | 'hammer' | 'knife' | 'plank';
export type GunId = 'pistol' | 'shotgun' | 'm16' | 'ak47' | 'mg';
export type WeaponId = MeleeId | GunId;
export type AmmoType = '9mm' | '12ga' | '556' | '762' | 'belt';

export interface WeaponSpec {
  id: WeaponId;
  name: string;
  icon: IconName;
  /** Hotkey slot (1–6). */
  slot: number;
  /** Damage per bullet / pellet (or per swing for melee). */
  damage: number;
  /** Seconds between shots. */
  cooldown: number;
  /** Max bullet travel (px). */
  range: number;
  /** Half-angle of random spread (radians). */
  spread: number;
  /** Bullets per trigger pull (shotgun pellets). */
  pellets: number;
  /** Holding the trigger keeps firing. */
  auto: boolean;
  magSize: number;
  reloadSeconds: number;
  ammo: AmmoType | null;
  /** Gunshot noise radius (tiles). */
  noise: number;
  /** Movement speed multiplier while equipped. */
  moveMul: number;
  /** kg (bag weight when it's an item). */
  weight: number;
  /** Melee-only handling; absent for guns. */
  melee?: MeleeSpec;
}

export interface MeleeSpec {
  /** Swing arc (radians). */
  arc: number;
  /** Stamina per swing. */
  stamina: number;
  /** Hits before it breaks (Infinity: never). */
  durability: number;
  /** Chance of a double-damage hit. */
  crit: number;
  /** Knockback (px). */
  knockback: number;
  /** Two-handed and heavy: a sprinting swing becomes a power attack. */
  heavy: boolean;
  /** Chance each hit knocks the zombie down. */
  downChance: number;
}

/** Power attack (sprint + swing with a heavy weapon). */
export const HEAVY_ATTACK = { damageMul: 1.6, staminaMul: 2, cooldownMul: 1.3, knockbackMul: 1.5, downBonus: 0.3 } as const;

const deg = (d: number) => (d * Math.PI) / 180;

const melee = (
  id: MeleeId,
  name: string,
  icon: IconName,
  damage: number,
  cooldown: number,
  range: number,
  noise: number,
  weight: number,
  m: Omit<MeleeSpec, 'arc'> & { arcDeg: number }
): WeaponSpec => {
  const { arcDeg, ...rest } = m;
  return {
    id, name, icon, slot: 1, damage, cooldown, range, spread: 0, pellets: 1, auto: false,
    magSize: 0, reloadSeconds: 0, ammo: null, noise, moveMul: 1, weight, melee: { arc: deg(arcDeg), ...rest },
  };
};

export const WEAPONS: Record<WeaponId, WeaponSpec> = {
  fists: melee('fists', 'Fists', 'hand', 8, 0.45, 24, 2, 0, { arcDeg: 90, stamina: 1.5, durability: Infinity, crit: 0.02, knockback: 6, heavy: false, downChance: 0.1 }),
  axe: melee('axe', 'Fire Axe', 'axe', 40, 0.5, 36, 5, 3, { arcDeg: 120, stamina: 6, durability: 60, crit: 0.15, knockback: 8, heavy: true, downChance: 0.2 }),
  bat: melee('bat', 'Baseball Bat', 'bat', 30, 0.55, 38, 5, 1.5, { arcDeg: 130, stamina: 5, durability: 45, crit: 0.1, knockback: 14, heavy: true, downChance: 0.35 }),
  crowbar: melee('crowbar', 'Crowbar', 'crowbar', 32, 0.6, 34, 5, 2, { arcDeg: 110, stamina: 5, durability: 140, crit: 0.12, knockback: 10, heavy: true, downChance: 0.25 }),
  pipe: melee('pipe', 'Metal Pipe', 'pipe', 28, 0.6, 38, 5, 2, { arcDeg: 120, stamina: 5.5, durability: 90, crit: 0.08, knockback: 12, heavy: true, downChance: 0.3 }),
  hammer: melee('hammer', 'Hammer', 'hammer', 26, 0.45, 28, 4, 1, { arcDeg: 90, stamina: 3.5, durability: 70, crit: 0.12, knockback: 8, heavy: false, downChance: 0.15 }),
  knife: melee('knife', 'Kitchen Knife', 'knife', 22, 0.3, 24, 2, 0.3, { arcDeg: 70, stamina: 2, durability: 35, crit: 0.3, knockback: 3, heavy: false, downChance: 0 }),
  plank: melee('plank', 'Wooden Plank', 'plank', 20, 0.55, 36, 4, 1.5, { arcDeg: 120, stamina: 4, durability: 15, crit: 0.05, knockback: 12, heavy: true, downChance: 0.3 }),
  pistol: { id: 'pistol', name: 'Pistol', icon: 'pistol', slot: 2, damage: 35, cooldown: 0.3, range: 280, spread: deg(3), pellets: 1, auto: false, magSize: 12, reloadSeconds: 1.2, ammo: '9mm', noise: 18, moveMul: 1, weight: 1.5 },
  shotgun: { id: 'shotgun', name: 'Shotgun', icon: 'shotgun', slot: 3, damage: 18, cooldown: 0.85, range: 170, spread: deg(14), pellets: 8, auto: false, magSize: 6, reloadSeconds: 2.6, ammo: '12ga', noise: 22, moveMul: 0.95, weight: 3.5 },
  m16: { id: 'm16', name: 'M16', icon: 'rifle', slot: 4, damage: 32, cooldown: 0.09, range: 380, spread: deg(2.5), pellets: 1, auto: true, magSize: 30, reloadSeconds: 2.0, ammo: '556', noise: 24, moveMul: 0.95, weight: 3.5 },
  ak47: { id: 'ak47', name: 'AK-47', icon: 'rifle', slot: 5, damage: 40, cooldown: 0.11, range: 360, spread: deg(5), pellets: 1, auto: true, magSize: 30, reloadSeconds: 2.3, ammo: '762', noise: 26, moveMul: 0.92, weight: 3.5 },
  mg: { id: 'mg', name: 'Machine Gun', icon: 'machineGun', slot: 6, damage: 30, cooldown: 0.07, range: 380, spread: deg(7), pellets: 1, auto: true, magSize: 100, reloadSeconds: 4.0, ammo: 'belt', noise: 30, moveMul: 0.75, weight: 8 },
};

/** Melee first (all on hotkey 1, which cycles them), then guns by slot. */
export const MELEE_ORDER: readonly MeleeId[] = ['axe', 'bat', 'crowbar', 'pipe', 'hammer', 'knife', 'plank', 'fists'];
export const WEAPON_ORDER: readonly WeaponId[] = [...MELEE_ORDER, 'pistol', 'shotgun', 'm16', 'ak47', 'mg'];

export function isMelee(w: WeaponId): w is MeleeId {
  return !!WEAPONS[w].melee;
}

/**
 * Melee damage multiplier from the swinger's state. `strengthLevel` 0–10
 * (5 = ×1), `bodyMul` from injuries (broken arm, pain), `tired` (fatigue ≥ 75),
 * `winded` (not enough stamina for the swing).
 */
export function meleeMultiplier(o: { strengthLevel: number; bodyMul: number; tired: boolean; winded: boolean; heavy: boolean; crit: boolean }): number {
  let m = (0.8 + 0.04 * o.strengthLevel) * o.bodyMul;
  if (o.tired) m *= 0.85;
  if (o.winded) m *= 0.5;
  if (o.heavy) m *= HEAVY_ATTACK.damageMul;
  if (o.crit) m *= 2;
  return m;
}

/** Host-side clamp for a client's claimed multiplier. */
export const MELEE_MUL_RANGE = [0.2, 4] as const;

export const AMMO_NAMES: Record<AmmoType, string> = {
  '9mm': '9mm',
  '12ga': '12-gauge shells',
  '556': '5.56 rounds',
  '762': '7.62 rounds',
  belt: 'Ammo belt',
};

/** Rounds in one looted ammo box. */
export const AMMO_BOX: Record<AmmoType, number> = { '9mm': 24, '12ga': 12, '556': 30, '762': 30, belt: 100 };

/** Something a bullet can hit (zombies, by feet point). */
export interface BulletTarget {
  id: number;
  x: number;
  y: number;
}

/** Zombie body radius for bullets (px, around the feet point lifted to torso height). */
export const BODY_RADIUS = 10;
/** Bullets fly at torso height: zombie feet point minus this (px). */
export const TORSO_LIFT = 10;

export interface BulletResult {
  /** Zombie hit, if any. */
  targetId: number | null;
  /** Where the bullet stopped (world px), for tracers. */
  endX: number;
  endY: number;
  /** Entrance tiles of closed glass windows shattered on the way. */
  windows: number[];
}

/**
 * Hitscan along a ray. Opaque tiles (walls, closed doors, boarded windows)
 * stop the bullet; closed glass windows shatter and the bullet carries on.
 * The first zombie whose body circle the ray crosses is hit.
 */
export function castBullet(
  grid: TileGrid,
  targets: BulletTarget[],
  x: number,
  y: number,
  angle: number,
  range: number
): BulletResult {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);

  // 1. Wall distance by stepping the grid (quarter-tile steps are plenty at 16 px)
  const ts = grid.tileSize;
  const stepLen = ts / 4;
  let wallDist = range;
  const windows: number[] = [];
  let lastTile = -1;
  for (let d = stepLen; d <= range; d += stepLen) {
    const col = Math.floor((x + dx * d) / ts);
    const row = Math.floor((y + dy * d) / ts);
    if (!inBounds(grid, col, row)) {
      wallDist = d;
      break;
    }
    const t = tileIndex(grid, col, row);
    if (t === lastTile) continue;
    lastTile = t;
    const f = grid.flags[t];
    const e = f & TILE_ENTRANCE ? grid.entrances.get(t) : undefined;
    if (e && e.kind === 'window' && (e.state === 'closed' || e.state === 'locked')) {
      windows.push(t); // glass: shatter and keep going
      continue;
    }
    if (f & TILE_OPAQUE) {
      wallDist = d;
      break;
    }
  }

  // 2. Nearest zombie body along the ray before the wall
  let best: BulletTarget | null = null;
  let bestT = wallDist;
  for (const z of targets) {
    const cx = z.x - x;
    const cy = z.y - TORSO_LIFT - y;
    const t = cx * dx + cy * dy; // projection of the body centre on the ray
    if (t <= 0) continue;
    const px = cx - dx * t;
    const py = cy - dy * t;
    const d2 = px * px + py * py;
    if (d2 > BODY_RADIUS * BODY_RADIUS) continue;
    const entry = t - Math.sqrt(BODY_RADIUS * BODY_RADIUS - d2); // where the bullet meets the body
    if (entry < bestT) {
      best = z;
      bestT = Math.max(0, entry);
    }
  }
  return {
    targetId: best ? best.id : null,
    endX: x + dx * bestT,
    endY: y + dy * bestT,
    // Only windows the bullet actually reached
    windows: windows.filter((t) => {
      const c = t % grid.cols;
      const r = (t - c) / grid.cols;
      const d = Math.hypot((c + 0.5) * ts - x, (r + 0.5) * ts - y);
      return d <= bestT + ts;
    }),
  };
}

/** Pellet / bullet angles for one trigger pull. */
export function shotAngles(w: WeaponSpec, aim: number, rng: () => number, spreadMul = 1): number[] {
  const out: number[] = [];
  for (let i = 0; i < w.pellets; i++) out.push(aim + (rng() * 2 - 1) * w.spread * spreadMul);
  return out;
}

// ---------------------------------------------------------------- loot

export type LootItem =
  | { kind: 'weapon'; weapon: Exclude<WeaponId, 'axe'> }
  | { kind: 'ammo'; ammo: AmmoType }
  /** Food, drink, stimulants and bandages (survival/inventory.ts ITEM_DEFS). */
  | { kind: 'supply'; supply: ConsumableId };

export interface LootSpawn {
  /** Stable id (index in the map's loot list). */
  id: number;
  item: LootItem;
  /** Seconds until a taken item restocks (stores); undefined = one-time. */
  respawn?: number;
  /** World px (centre of the item). */
  x: number;
  y: number;
}

/** Ammo a freshly looted gun comes loaded with. */
export function startingMag(w: WeaponId): number {
  const s = WEAPONS[w];
  return s.ammo === 'belt' ? s.magSize : Math.ceil(s.magSize / 2);
}
