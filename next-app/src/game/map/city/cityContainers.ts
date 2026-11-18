// ============================================================
// ZOMBIE CITY — SEARCHABLE FURNITURE
// Turns the existing city plan's furniture (fridges, shelves, cabinets,
// lockers, desks, counters, checkouts) into containers, each with a loot
// table that fits where it stands: a kitchen fridge holds food, a bathroom
// cabinet holds medicine, a hardware shop's shelves hold tools and nails,
// a police locker holds ammo. Reads the plan only; nothing is moved.
// ============================================================

import type { ContainerSpawn } from '../../zombie/survival/containers';
import type { ContainerKind } from '../../zombie/survival/types';
import type { CityBuilding, CityFloor, CityFurniture, CityPlan } from './types';
import type { RoomKind } from './templates';

type Shop = 'hardware' | 'books' | 'thrift' | 'electronics' | 'sports' | 'diner' | 'laundromat';

/** Shop variants are told apart by their icon (map/city/templates.ts). */
const SHOP_BY_ICON: Record<string, Shop> = {
  hammer: 'hardware',
  book: 'books',
  shirt: 'thrift',
  tv: 'electronics',
  trophy: 'sports',
  diner: 'diner',
  laundry: 'laundromat',
};

const CONTAINER_FURNITURE: Partial<Record<CityFurniture['kind'], ContainerKind>> = {
  fridge: 'fridge',
  shelf: 'shelf',
  cabinet: 'cabinet',
  counter: 'counter',
  locker: 'locker',
  desk: 'desk',
  checkout: 'checkout',
};

/** Rolls, empty chance and restock per table (configurable loot abundance). */
export const TABLE_RULES: Record<string, { rolls: number; empty: number; respawn: number | null }> = {
  kitchen_fridge: { rolls: 2, empty: 0.3, respawn: null },
  kitchen_counter: { rolls: 2, empty: 0.4, respawn: null },
  bedroom_cabinet: { rolls: 1, empty: 0.35, respawn: null },
  bath_cabinet: { rolls: 2, empty: 0.35, respawn: null },
  living_shelf: { rolls: 2, empty: 0.4, respawn: null },
  office_desk: { rolls: 1, empty: 0.4, respawn: null },
  office_cabinet: { rolls: 1, empty: 0.5, respawn: null },
  store_shelf: { rolls: 3, empty: 0.1, respawn: 420 },
  store_fridge: { rolls: 3, empty: 0.1, respawn: 420 },
  checkout: { rolls: 2, empty: 0.3, respawn: 600 },
  pharmacy_shelf: { rolls: 3, empty: 0.1, respawn: 600 },
  hospital_cabinet: { rolls: 3, empty: 0.15, respawn: null },
  police_locker: { rolls: 2, empty: 0.2, respawn: null },
  police_cabinet: { rolls: 2, empty: 0.25, respawn: null },
  hardware_shelf: { rolls: 3, empty: 0.1, respawn: null },
  books_shelf: { rolls: 3, empty: 0.1, respawn: null },
  thrift_shelf: { rolls: 2, empty: 0.15, respawn: null },
  electronics_shelf: { rolls: 2, empty: 0.15, respawn: null },
  sports_shelf: { rolls: 2, empty: 0.15, respawn: null },
  diner_counter: { rolls: 2, empty: 0.2, respawn: null },
  laundromat_shelf: { rolls: 1, empty: 0.4, respawn: null },
  gas_shelf: { rolls: 3, empty: 0.1, respawn: 300 },
  gas_storage: { rolls: 2, empty: 0.25, respawn: null },
  storage_shelf: { rolls: 2, empty: 0.35, respawn: null },
};

function roomAt(f: CityFloor, fu: CityFurniture): RoomKind | null {
  const cx = fu.x + fu.w / 2;
  const cy = fu.y + fu.h / 2;
  const r = f.rooms.find((rm) => cx >= rm.rect.x && cx < rm.rect.x + rm.rect.w && cy >= rm.rect.y && cy < rm.rect.y + rm.rect.h);
  return r?.kind ?? null;
}

/** Which loot table a piece of furniture uses, or null when it isn't worth searching. */
export function containerTable(b: CityBuilding, room: RoomKind | null, kind: ContainerKind): string | null {
  const shop = b.kind === 'shop' ? SHOP_BY_ICON[b.icon] ?? null : null;
  // Back rooms everywhere are general storage
  if (room === 'storage' && (kind === 'shelf' || kind === 'cabinet')) return b.kind === 'gasStation' ? 'gas_storage' : 'storage_shelf';
  if (kind === 'checkout') return 'checkout';
  switch (b.kind) {
    case 'grocery':
    case 'convenience':
      if (kind === 'shelf') return 'store_shelf';
      if (kind === 'fridge') return 'store_fridge';
      break;
    case 'pharmacy':
      if (kind === 'shelf' || kind === 'cabinet') return 'pharmacy_shelf';
      break;
    case 'hospital':
      if (kind === 'cabinet' || kind === 'shelf' || kind === 'locker') return 'hospital_cabinet';
      break;
    case 'police':
      if (kind === 'locker') return 'police_locker';
      if (kind === 'cabinet') return 'police_cabinet';
      break;
    case 'gasStation':
      if (kind === 'shelf') return 'gas_shelf';
      if (kind === 'fridge') return 'store_fridge';
      break;
    case 'shop':
      if (shop === 'diner' && (kind === 'counter' || kind === 'shelf')) return 'diner_counter';
      if (shop === 'diner' && kind === 'fridge') return 'store_fridge';
      if (shop && kind === 'shelf') return `${shop}_shelf`;
      if (kind === 'fridge') return 'store_fridge';
      break;
    default:
      break;
  }
  // Homes, offices and staff rooms: by room
  if (kind === 'fridge') return 'kitchen_fridge';
  if (kind === 'counter') return room === 'lobby' ? 'office_desk' : 'kitchen_counter';
  if (kind === 'desk') return 'office_desk';
  if (kind === 'locker') return 'storage_shelf';
  if (kind === 'cabinet') return room === 'bedroom' ? 'bedroom_cabinet' : room === 'bath' ? 'bath_cabinet' : room === 'office' ? 'office_cabinet' : 'storage_shelf';
  if (kind === 'shelf') return room === 'office' ? 'office_cabinet' : 'living_shelf';
  return null;
}

/** Every searchable piece of furniture in the city, in a stable order (ids are indexes). */
export function cityContainers(plan: CityPlan): ContainerSpawn[] {
  const out: ContainerSpawn[] = [];
  for (const b of plan.buildings) {
    for (const f of b.floors) {
      for (const fu of f.furniture) {
        const kind = CONTAINER_FURNITURE[fu.kind];
        if (!kind) continue;
        const table = containerTable(b, roomAt(f, fu), kind);
        if (!table) continue;
        const rule = TABLE_RULES[table];
        out.push({ id: out.length, kind, owner: b.id, x: fu.x, y: fu.y, w: fu.w, h: fu.h, table, rolls: rule.rolls, empty: rule.empty, respawn: rule.respawn });
      }
    }
  }
  return out;
}
