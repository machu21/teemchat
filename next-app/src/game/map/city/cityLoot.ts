// ============================================================
// ZOMBIE CITY — LOOT PLACEMENT
// Deterministic (fixed city seed) guns and ammo inside buildings, themed
// by building kind: the police station is an armory, houses sometimes
// hide a pistol or shotgun, offices/apartments the odd rifle.
// Items sit on open floor tiles (not walls, stairs or furniture).
// ============================================================

import { hash32, mulberry32 } from '../../art/character/appearance';
import type { AmmoType, LootItem, LootSpawn, WeaponId } from '../../zombie/weapons';
import type { ConsumableId } from '../../zombie/survival/types';
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
  convenience: { chance: 0.25, max: 1, items: [[ammo('9mm'), 3], [ammo('12ga'), 1]] },
  pharmacy: { chance: 0.3, max: 1, items: [[gun('pistol'), 1], [ammo('9mm'), 2]] },
  hospital: { chance: 1, max: 3, items: [[gun('pistol'), 2], [ammo('9mm'), 3], [gun('shotgun'), 1]] },
  gasStation: { chance: 1, max: 2, items: [[gun('shotgun'), 2], [ammo('12ga'), 3]] },
  police: { chance: 1, max: 0, items: [] }, // armory: fixed list below
};

const SUPPLY_RESTOCK_SECONDS = 300;

/**
 * Food, drink and medical supplies: [chance, max items, restocks?, table].
 * Groceries and convenience stores (shops, gas stations) are the main POIs and restock;
 * homes and offices are one-time finds.
 */
const SUPPLIES: Record<BuildingKind, { chance: number; max: number; restock: boolean; items: Weighted<ConsumableId> }> = {
  grocery: { chance: 1, max: 7, restock: true, items: [['canned_beans', 5], ['bread', 3], ['apple', 3], ['chips', 3], ['water_bottle', 5], ['soda', 2], ['energy_drink', 1]] },
  // Corner shops: the most reliable snack + drink stop between groceries
  convenience: { chance: 1, max: 6, restock: true, items: [['chips', 4], ['soda', 3], ['water_bottle', 4], ['energy_drink', 2], ['coffee', 2], ['canned_beans', 2], ['bread', 1]] },
  shop: { chance: 1, max: 4, restock: true, items: [['chips', 4], ['soda', 3], ['water_bottle', 3], ['energy_drink', 2], ['coffee', 2]] },
  gasStation: { chance: 1, max: 4, restock: true, items: [['chips', 3], ['water_bottle', 3], ['energy_drink', 3], ['coffee', 2]] },
  pharmacy: { chance: 1, max: 4, restock: true, items: [['bandage', 5], ['water_bottle', 2], ['energy_drink', 1]] },
  hospital: { chance: 1, max: 4, restock: false, items: [['bandage', 4], ['water_bottle', 2]] },
  house: { chance: 0.6, max: 2, restock: false, items: [['canned_beans', 3], ['water_bottle', 3], ['bread', 2], ['coffee', 1]] },
  apartment: { chance: 0.7, max: 3, restock: false, items: [['canned_beans', 3], ['water_bottle', 3], ['chips', 2], ['soda', 1]] },
  office: { chance: 0.5, max: 2, restock: false, items: [['coffee', 4], ['water_bottle', 3], ['chips', 2]] },
  police: { chance: 1, max: 2, restock: false, items: [['bandage', 3], ['coffee', 2]] },
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

/**
 * Every loot spawn in the city, in a stable order (ids are indexes).
 * Guns/ammo come first (their ids predate supplies), then supplies from a
 * separate stream so adding supplies never reshuffles the guns.
 */
export function generateCityLoot(plan: CityPlan): LootSpawn[] {
  const out: LootSpawn[] = [];
  const used = new Map<string, Set<string>>();
  const place = (b: CityBuilding, rng: () => number, item: LootItem, respawn?: number) => {
    let taken = used.get(b.id);
    if (!taken) used.set(b.id, (taken = new Set()));
    const floor = b.floors[Math.min(b.floors.length - 1, Math.floor(rng() * (b.floors.length + 0.5)))];
    const spots = freeSpots(floor, plan.tile).filter((s) => !taken.has(`${s.x},${s.y}`));
    if (!spots.length) return;
    const s = spots[Math.floor(rng() * spots.length)];
    taken.add(`${s.x},${s.y}`);
    out.push(respawn ? { id: out.length, item, x: s.x, y: s.y, respawn } : { id: out.length, item, x: s.x, y: s.y });
  };
  for (const b of plan.buildings) {
    const rng = mulberry32(plan.seed ^ hash32(`${b.id}:loot`));
    for (const item of buildingItems(b, rng)) place(b, rng, item);
  }
  for (const b of plan.buildings) {
    const t = SUPPLIES[b.kind];
    const rng = mulberry32(plan.seed ^ hash32(`${b.id}:supplies`));
    if (rng() >= t.chance) continue;
    const n = 1 + Math.floor(rng() * t.max);
    for (let i = 0; i < n; i++) {
      place(b, rng, { kind: 'supply', supply: pick(rng, t.items) }, t.restock ? SUPPLY_RESTOCK_SECONDS : undefined);
    }
  }
  return out;
}
