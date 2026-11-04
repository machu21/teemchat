// ============================================================
// ZOMBIE CITY — LOOT PLACEMENT
// Deterministic (fixed city seed) guns and ammo inside buildings, themed
// by building kind: the police station is an armory, houses sometimes
// hide a pistol or shotgun, offices/apartments the odd rifle.
// Items sit on open floor tiles (not walls, stairs or furniture).
// ============================================================

import { hash32, mulberry32 } from '../../art/character/appearance';
import type { AmmoType, LootItem, LootSpawn, WeaponId } from '../../zombie/weapons';
import type { BuildingKind } from './templates';
import { FT, type CityBuilding, type CityFloor, type CityPlan } from './types';

type Gun = Exclude<WeaponId, 'axe'>;
type Weighted<T> = [T, number][];

const gun = (weapon: Gun): LootItem => ({ kind: 'weapon', weapon });
const ammo = (a: AmmoType): LootItem => ({ kind: 'ammo', ammo: a });

/** [chance a building of this kind has loot, max items, weighted item table]. */
const TABLES: Record<BuildingKind, { chance: number; max: number; items: Weighted<LootItem> }> = {
  house: { chance: 0.4, max: 1, items: [[gun('pistol'), 4], [gun('shotgun'), 2], [ammo('9mm'), 4], [ammo('12ga'), 3]] },
  apartment: { chance: 0.7, max: 3, items: [[gun('pistol'), 4], [gun('shotgun'), 1], [gun('ak47'), 1], [ammo('9mm'), 4], [ammo('762'), 2]] },
  office: { chance: 0.5, max: 2, items: [[gun('pistol'), 3], [gun('m16'), 1], [ammo('9mm'), 3], [ammo('556'), 2]] },
  shop: { chance: 0.35, max: 1, items: [[gun('pistol'), 2], [ammo('9mm'), 3], [ammo('12ga'), 2]] },
  grocery: { chance: 0.3, max: 1, items: [[ammo('9mm'), 2], [ammo('12ga'), 2]] },
  pharmacy: { chance: 0.3, max: 1, items: [[gun('pistol'), 1], [ammo('9mm'), 2]] },
  hospital: { chance: 1, max: 3, items: [[gun('pistol'), 2], [ammo('9mm'), 3], [gun('shotgun'), 1]] },
  gasStation: { chance: 1, max: 2, items: [[gun('shotgun'), 2], [ammo('12ga'), 3]] },
  police: { chance: 1, max: 0, items: [] }, // armory: fixed list below
};

/** The police station always stocks the full arsenal. */
const ARMORY: LootItem[] = [
  gun('mg'),
  gun('m16'),
  gun('ak47'),
  gun('shotgun'),
  gun('pistol'),
  ammo('belt'),
  ammo('556'),
  ammo('762'),
  ammo('12ga'),
  ammo('9mm'),
  ammo('9mm'),
];

function pick<T>(rng: () => number, table: Weighted<T>): T {
  const total = table.reduce((s, [, w]) => s + w, 0);
  let roll = rng() * total;
  for (const [item, w] of table) {
    roll -= w;
    if (roll < 0) return item;
  }
  return table[table.length - 1][0];
}

/** Open floor tile centres (world px) on a floor, away from stairs and furniture. */
function freeSpots(f: CityFloor, tile: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const at = (c: number, r: number) => (c < 0 || r < 0 || c >= f.cols || r >= f.rows ? FT.WALL : f.tiles[r * f.cols + c]);
  for (let r = 1; r < f.rows - 1; r++) {
    for (let c = 1; c < f.cols - 1; c++) {
      if (at(c, r) !== FT.FLOOR) continue;
      // Keep doorways, stairs and windows clear
      let ok = true;
      for (let dr = -1; dr <= 1 && ok; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const t = at(c + dc, r + dr);
          if (t === FT.DOOR || t === FT.STAIR_UP || t === FT.STAIR_DOWN || t === FT.WINDOW) ok = false;
        }
      }
      if (!ok) continue;
      const x = f.bounds.x + c * tile + tile / 2;
      const y = f.bounds.y + r * tile + tile / 2;
      if (f.furniture.some((fu) => x >= fu.x - 4 && x <= fu.x + fu.w + 4 && y >= fu.y - 4 && y <= fu.y + fu.h + 4)) continue;
      out.push({ x, y });
    }
  }
  return out;
}

function buildingItems(b: CityBuilding, rng: () => number): LootItem[] {
  if (b.kind === 'police') return ARMORY;
  const t = TABLES[b.kind];
  if (rng() >= t.chance) return [];
  const n = 1 + Math.floor(rng() * t.max);
  return Array.from({ length: n }, () => pick(rng, t.items));
}

/** Every loot spawn in the city, in a stable order (ids are indexes). */
export function generateCityLoot(plan: CityPlan): LootSpawn[] {
  const out: LootSpawn[] = [];
  for (const b of plan.buildings) {
    const rng = mulberry32(plan.seed ^ hash32(`${b.id}:loot`));
    const items = buildingItems(b, rng);
    if (!items.length) continue;
    const used = new Set<string>();
    for (const item of items) {
      // Any floor; upper floors are a little more likely (the good stuff is upstairs)
      const floor = b.floors[Math.min(b.floors.length - 1, Math.floor(rng() * (b.floors.length + 0.5)))];
      const spots = freeSpots(floor, plan.tile).filter((s) => !used.has(`${s.x},${s.y}`));
      if (!spots.length) continue;
      const s = spots[Math.floor(rng() * spots.length)];
      used.add(`${s.x},${s.y}`);
      out.push({ id: out.length, item, x: s.x, y: s.y });
    }
  }
  return out;
}
