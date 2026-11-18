import { AMMO_NAMES, AmmoType, WEAPONS, WEAPON_ORDER, WeaponId, startingMag } from '../weapons';
import type {
  AmmoPouch,
  Bag,
  ConsumableId,
  ContainerKind,
  InventoryItem,
  ItemDef,
  ItemDefId,
  LootContainer,
  LootTableEntry,
  Loadout,
  PlayerVitals,
  PoiKind,
  WeaponItem,
} from './types';
import { consume } from './vitals';
import { isPerishable, sameBatch } from './spoilage';
import { AMMO_DESCRIPTION, CONSUMABLE_DESCRIPTIONS, GEAR_DEFS, SKILL_BOOK_DEFS, WEAPON_DESCRIPTIONS } from './items';
import { SKILL_IDS, type SkillId } from './skills';

// ============================================================
// ZOMBIE MODE — BAG, QUICK SLOTS & LOOT CONTAINERS (pure)
// Every function returns new objects (host diffs + broadcasts changes).
// Weight is what limits the bag (strength and a worn bag set the cap);
// the slot count is only a sanity limit.
// ============================================================

export const BAG_SLOTS = 40;
export const BAG_MAX_WEIGHT = 20;
/** Pouch cap per ammo type (rounds). */
export const POUCH_CAP: AmmoPouch = { '9mm': 120, '12ga': 48, '556': 180, '762': 180, belt: 300 };

const CONSUMABLES: Record<ConsumableId, Omit<ItemDef, 'description'>> = {
  canned_beans: { id: 'canned_beans', name: 'Canned Beans', icon: 'soup', category: 'food', weight: 0.5, maxStack: 4, useSeconds: 2, consume: { hunger: 35, unhappiness: 2, regen: { hpPerSecond: 0.5, seconds: 20 } } },
  chips: { id: 'chips', name: 'Chips', icon: 'cookie', category: 'food', weight: 0.15, maxStack: 6, useSeconds: 1, consume: { hunger: 15, hydration: -5, boredom: -8, unhappiness: -10 } },
  apple: { id: 'apple', name: 'Apple', icon: 'apple', category: 'food', weight: 0.2, maxStack: 6, useSeconds: 1, consume: { hunger: 12, hydration: 5, unhappiness: -3, regen: { hpPerSecond: 0.3, seconds: 10 } } },
  bread: { id: 'bread', name: 'Bread', icon: 'bread', category: 'food', weight: 0.4, maxStack: 3, useSeconds: 2, consume: { hunger: 30, unhappiness: -3, regen: { hpPerSecond: 0.4, seconds: 15 } } },
  water_bottle: { id: 'water_bottle', name: 'Water Bottle', icon: 'droplet', category: 'drink', weight: 0.5, maxStack: 4, useSeconds: 1, consume: { hydration: 40, leaves: 'empty_bottle' } },
  tainted_water: {
    id: 'tainted_water', name: 'Tainted Water', icon: 'glassWater', category: 'drink', weight: 0.5, maxStack: 4, useSeconds: 1,
    consume: { hydration: 30, unhappiness: 3, leaves: 'empty_bottle', effects: [{ kind: 'poison', remaining: 45, magnitude: 0.12, source: 'tainted_water' }] },
  },
  raw_meat: {
    id: 'raw_meat', name: 'Raw Meat', icon: 'meat', category: 'food', weight: 0.4, maxStack: 3, useSeconds: 2,
    consume: { hunger: 20, unhappiness: 8, effects: [{ kind: 'poison', remaining: 40, magnitude: 0.12, source: 'raw_meat' }] },
  },
  cooked_meat: { id: 'cooked_meat', name: 'Cooked Meat', icon: 'drumstick', category: 'food', weight: 0.35, maxStack: 3, useSeconds: 2, consume: { hunger: 40, unhappiness: -6, warmth: 0.5, regen: { hpPerSecond: 0.6, seconds: 20 } } },
  tomato: { id: 'tomato', name: 'Tomato', icon: 'tomato', category: 'food', weight: 0.15, maxStack: 8, useSeconds: 1, consume: { hunger: 8, hydration: 6, unhappiness: -2 } },
  carrot: { id: 'carrot', name: 'Carrot', icon: 'carrot', category: 'food', weight: 0.1, maxStack: 8, useSeconds: 1, consume: { hunger: 8, hydration: 2 } },
  potato: { id: 'potato', name: 'Potato', icon: 'potato', category: 'food', weight: 0.25, maxStack: 8, useSeconds: 2, consume: { hunger: 10, unhappiness: 4 } },
  cabbage: { id: 'cabbage', name: 'Cabbage', icon: 'cabbage', category: 'food', weight: 0.6, maxStack: 4, useSeconds: 2, consume: { hunger: 14, hydration: 6 } },
  berries: { id: 'berries', name: 'Wild Berries', icon: 'berries', category: 'food', weight: 0.1, maxStack: 10, useSeconds: 1, consume: { hunger: 5, hydration: 3, unhappiness: -4 } },
  mushrooms: { id: 'mushrooms', name: 'Wild Mushrooms', icon: 'mushroom', category: 'food', weight: 0.1, maxStack: 10, useSeconds: 1, consume: { hunger: 6, unhappiness: 2 } },
  herbs: { id: 'herbs', name: 'Wild Herbs', icon: 'leaf', category: 'medical', weight: 0.05, maxStack: 10, useSeconds: 2, consume: { treat: 'disinfect', stress: -3 } },
  fish_minnow: {
    id: 'fish_minnow', name: 'Minnows', icon: 'fish', category: 'food', weight: 0.1, maxStack: 6, useSeconds: 1,
    consume: { hunger: 4, unhappiness: 6, effects: [{ kind: 'poison', remaining: 20, magnitude: 0.08, source: 'raw_fish' }] },
  },
  fish_perch: {
    id: 'fish_perch', name: 'Perch', icon: 'fish', category: 'food', weight: 0.4, maxStack: 3, useSeconds: 2,
    consume: { hunger: 12, unhappiness: 8, effects: [{ kind: 'poison', remaining: 30, magnitude: 0.1, source: 'raw_fish' }] },
  },
  fish_carp: {
    id: 'fish_carp', name: 'Carp', icon: 'fish', category: 'food', weight: 1.2, maxStack: 2, useSeconds: 2,
    consume: { hunger: 18, unhappiness: 8, effects: [{ kind: 'poison', remaining: 30, magnitude: 0.1, source: 'raw_fish' }] },
  },
  fish_catfish: {
    id: 'fish_catfish', name: 'Catfish', icon: 'fish', category: 'food', weight: 2, maxStack: 1, useSeconds: 3,
    consume: { hunger: 25, unhappiness: 8, effects: [{ kind: 'poison', remaining: 30, magnitude: 0.1, source: 'raw_fish' }] },
  },
  cooked_fish: { id: 'cooked_fish', name: 'Cooked Fish', icon: 'fish', category: 'food', weight: 0.35, maxStack: 3, useSeconds: 2, consume: { hunger: 35, unhappiness: -6, warmth: 0.5, regen: { hpPerSecond: 0.6, seconds: 20 } } },
  vegetable_stew: {
    id: 'vegetable_stew', name: 'Vegetable Stew', icon: 'cookingPot', category: 'food', weight: 0.7, maxStack: 2, useSeconds: 3,
    consume: { hunger: 45, hydration: 20, unhappiness: -15, stress: -5, warmth: 1.5, regen: { hpPerSecond: 0.6, seconds: 25 } },
  },
  salad: { id: 'salad', name: 'Salad', icon: 'cabbage', category: 'food', weight: 0.4, maxStack: 2, useSeconds: 2, consume: { hunger: 22, hydration: 10, unhappiness: -10 } },
  hot_soup: { id: 'hot_soup', name: 'Hot Soup', icon: 'soup', category: 'food', weight: 0.6, maxStack: 2, useSeconds: 3, consume: { hunger: 30, hydration: 20, unhappiness: -12, stress: -4, warmth: 1.5, regen: { hpPerSecond: 0.5, seconds: 20 } } },
  soda: { id: 'soda', name: 'Soda', icon: 'soda', category: 'drink', weight: 0.35, maxStack: 4, useSeconds: 1, consume: { hydration: 20, stamina: 10, boredom: -4, unhappiness: -8 } },
  energy_drink: {
    id: 'energy_drink', name: 'Energy Drink', icon: 'zap', category: 'stimulant', weight: 0.3, maxStack: 4, useSeconds: 1,
    consume: { hydration: 10, stamina: 100, fatigue: -25, unhappiness: -5, effects: [{ kind: 'stimulant', remaining: 30, magnitude: 1.2, source: 'energy_drink' }] },
  },
  coffee: {
    id: 'coffee', name: 'Coffee', icon: 'coffee', category: 'stimulant', weight: 0.3, maxStack: 4, useSeconds: 1,
    consume: { hydration: 5, stamina: 40, fatigue: -20, unhappiness: -5, effects: [{ kind: 'stimulant', remaining: 12, magnitude: 1.1, source: 'coffee' }] },
  },
  bandage: { id: 'bandage', name: 'Bandage', icon: 'bandage', category: 'medical', weight: 0.1, maxStack: 5, useSeconds: 3, consume: { health: 15, stress: -5, treat: 'bandage', regen: { hpPerSecond: 1, seconds: 10 } } },
  disinfectant: { id: 'disinfectant', name: 'Disinfectant', icon: 'flask', category: 'medical', weight: 0.3, maxStack: 3, useSeconds: 2, consume: { treat: 'disinfect', stress: -2 } },
  painkillers: { id: 'painkillers', name: 'Painkillers', icon: 'pharmacy', category: 'medical', weight: 0.05, maxStack: 6, useSeconds: 1, consume: { treat: 'painkiller', stress: -4 } },
  splint: { id: 'splint', name: 'Splint', icon: 'bone', category: 'medical', weight: 0.4, maxStack: 2, useSeconds: 3, consume: { treat: 'splint' } },
  book: { id: 'book', name: 'Book', icon: 'book', category: 'literature', weight: 0.5, maxStack: 1, useSeconds: 4, consume: { boredom: -40, unhappiness: -15, stress: -5 } },
  magazine: { id: 'magazine', name: 'Magazine', icon: 'newspaper', category: 'literature', weight: 0.2, maxStack: 5, useSeconds: 2, consume: { boredom: -20, unhappiness: -6 } },
  noise_maker: { id: 'noise_maker', name: 'Noise Maker', icon: 'bellRing', category: 'electronics', weight: 0.4, maxStack: 3, useSeconds: 1, consume: { lure: true } },
  'mag:metalwork': { id: 'mag:metalwork', name: 'Metalwork Magazine', icon: 'newspaper', category: 'literature', weight: 0.2, maxStack: 1, useSeconds: 2, consume: { teaches: 'metalwork' } },
  'mag:electronics': { id: 'mag:electronics', name: 'Electronics Magazine', icon: 'newspaper', category: 'literature', weight: 0.2, maxStack: 1, useSeconds: 2, consume: { teaches: 'electronics' } },
  'mag:tailoring': { id: 'mag:tailoring', name: 'Sewing Magazine', icon: 'newspaper', category: 'literature', weight: 0.2, maxStack: 1, useSeconds: 2, consume: { teaches: 'tailoring' } },
};

function buildDefs(): Record<ItemDefId, ItemDef> {
  const defs = { ...GEAR_DEFS, ...SKILL_BOOK_DEFS } as Record<ItemDefId, ItemDef>;
  for (const [id, d] of Object.entries(CONSUMABLES) as [ConsumableId, Omit<ItemDef, 'description'>][]) {
    defs[id] = { ...d, description: CONSUMABLE_DESCRIPTIONS[id] };
  }
  for (const w of WEAPON_ORDER) {
    const s = WEAPONS[w];
    defs[`weapon:${w}`] = { id: `weapon:${w}`, name: s.name, icon: s.icon, category: 'weapon', weight: s.weight, maxStack: 1, description: WEAPON_DESCRIPTIONS[w] };
  }
  for (const a of Object.keys(AMMO_NAMES) as AmmoType[]) {
    // Ammo never occupies bag slots (it goes to the pouch); weight is per round.
    defs[`ammo:${a}`] = { id: `ammo:${a}`, name: AMMO_NAMES[a], icon: 'package', category: 'ammo', weight: AMMO_ROUND_KG, maxStack: 999, description: AMMO_DESCRIPTION(AMMO_NAMES[a]) };
  }
  return defs;
}

/** kg per round of ammunition. */
export const AMMO_ROUND_KG = 0.01;

export const ITEM_DEFS: Record<ItemDefId, ItemDef> = buildDefs();

export function isItemDefId(v: unknown): v is ItemDefId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(ITEM_DEFS, v);
}

/** Total kg of one stack. */
export function stackWeight(it: Pick<InventoryItem, 'def' | 'qty'>): number {
  return ITEM_DEFS[it.def].weight * it.qty;
}

/** Splits `qty` units off a stack into a new one (same def / condition). */
export function splitStack(bag: Bag, uid: string, qty: number, newUid: () => string): Bag {
  const i = bag.items.findIndex((x) => x.uid === uid);
  if (i < 0 || bag.items.length >= bag.slots) return bag;
  const it = bag.items[i];
  const n = Math.floor(qty);
  if (n <= 0 || n >= it.qty) return bag;
  const items = bag.items.slice();
  items[i] = { ...it, qty: it.qty - n };
  items.splice(i + 1, 0, { ...it, uid: newUid(), qty: n });
  return { ...bag, items };
}

/** Puts a whole item (keeping its condition) into the bag, if it fits by weight and slots. */
export function addItemToBag(bag: Bag, item: InventoryItem, force = false): { bag: Bag; added: boolean } {
  const d = ITEM_DEFS[item.def];
  if (!force && bagWeight(bag) + stackWeight(item) > bag.maxWeight + 1e-9) return { bag, added: false };
  // Perishables merge only with food of the same age
  if (item.rot !== undefined) {
    const i = bag.items.findIndex((x) => sameBatch(x, item) && x.qty + item.qty <= d.maxStack);
    if (i >= 0) {
      const items = bag.items.slice();
      items[i] = { ...items[i], qty: items[i].qty + item.qty };
      return { bag: { ...bag, items }, added: true };
    }
    if (bag.items.length >= bag.slots) return { bag, added: false };
    return { bag: { ...bag, items: [...bag.items, { ...item }] }, added: true };
  }
  // Plain stackables merge; worn / conditioned items keep their own stack
  if (item.cond === undefined && item.mag === undefined && d.maxStack > 1) {
    // A big stack may spill into several new ones: each needs its own uid
    let n = 0;
    const newUid = () => (n++ === 0 ? item.uid : `${item.uid}.${n - 1}`);
    const r = addToBag({ ...bag, maxWeight: force ? Infinity : bag.maxWeight }, item.def, item.qty, newUid);
    return { bag: { ...r.bag, maxWeight: bag.maxWeight }, added: r.leftover === 0 };
  }
  if (bag.items.length >= bag.slots) return { bag, added: false };
  return { bag: { ...bag, items: [...bag.items, { ...item }] }, added: true };
}

export function emptyPouch(): AmmoPouch {
  return { '9mm': 0, '12ga': 0, '556': 0, '762': 0, belt: 0 };
}

export function makeWeaponItem(uid: string, weapon: WeaponId, mag = startingMag(weapon)): WeaponItem {
  return { uid, def: `weapon:${weapon}`, weapon, mag, qty: 1 };
}

export function freshLoadout(uid = 'axe'): Loadout {
  return {
    bag: { slots: BAG_SLOTS, maxWeight: BAG_MAX_WEIGHT, items: [] },
    quick: { primary: makeWeaponItem(uid, 'axe', 0), secondary: null, consumableUid: null, ammo: emptyPouch() },
  };
}

export function bagWeight(bag: Bag): number {
  let w = 0;
  for (const it of bag.items) w += ITEM_DEFS[it.def].weight * it.qty;
  return w;
}

export interface AddResult {
  bag: Bag;
  added: number;
  /** Units that didn't fit (left on the ground / in the container). */
  leftover: number;
}

/**
 * Adds `qty` units: tops up existing stacks first, then opens new slots,
 * stopping at the slot or weight limit. `newUid` mints ids for new stacks.
 */
export function addToBag(bag: Bag, def: ItemDefId, qty: number, newUid: () => string): AddResult {
  const d = ITEM_DEFS[def];
  const items = bag.items.map((i) => ({ ...i }));
  let room = Math.floor((bag.maxWeight - bagWeight(bag) + 1e-9) / d.weight);
  let left = qty;
  // New perishables start their own (fresh) stack instead of topping up older food
  const perishable = isPerishable(def);
  for (const it of items) {
    if (left <= 0 || room <= 0 || perishable) break;
    if (it.def !== def || it.qty >= d.maxStack || it.cond !== undefined || it.mag !== undefined) continue;
    const n = Math.min(left, room, d.maxStack - it.qty);
    it.qty += n;
    left -= n;
    room -= n;
  }
  while (left > 0 && room > 0 && items.length < bag.slots) {
    const n = Math.min(left, room, d.maxStack);
    items.push({ uid: newUid(), def, qty: n });
    left -= n;
    room -= n;
  }
  return { bag: { ...bag, items }, added: qty - left, leftover: left };
}

export function removeFromBag(bag: Bag, uid: string, qty = 1): { bag: Bag; removed: number } {
  const it = bag.items.find((i) => i.uid === uid);
  if (!it) return { bag, removed: 0 };
  const removed = Math.min(qty, it.qty);
  const items = bag.items.flatMap((i) => (i.uid !== uid ? [i] : i.qty - removed > 0 ? [{ ...i, qty: i.qty - removed }] : []));
  return { bag: { ...bag, items }, removed };
}

/** Auto-stacks ammo into the pouch. Returns rounds that didn't fit. */
export function pickupAmmo(pouch: AmmoPouch, ammo: AmmoType, rounds: number): { pouch: AmmoPouch; leftover: number } {
  const take = Math.max(0, Math.min(rounds, POUCH_CAP[ammo] - pouch[ammo]));
  return { pouch: { ...pouch, [ammo]: pouch[ammo] + take }, leftover: rounds - take };
}

/** Quick reload straight from the pouch. */
export function reload(w: WeaponItem, pouch: AmmoPouch): { weapon: WeaponItem; pouch: AmmoPouch; loaded: number } {
  const spec = WEAPONS[w.weapon];
  if (!spec.ammo) return { weapon: w, pouch, loaded: 0 };
  const loaded = Math.min(spec.magSize - w.mag, pouch[spec.ammo]);
  if (loaded <= 0) return { weapon: w, pouch, loaded: 0 };
  return { weapon: { ...w, mag: w.mag + loaded }, pouch: { ...pouch, [spec.ammo]: pouch[spec.ammo] - loaded }, loaded };
}

/**
 * Picks up a gun. A duplicate of an equipped gun is stripped for ammo
 * (matches the existing loot rule); otherwise it fills an empty quick slot,
 * then the bag.
 */
export function pickupWeapon(l: Loadout, weapon: WeaponId, uid: string): { loadout: Loadout; placed: 'primary' | 'secondary' | 'bag' | 'ammo' | 'none' } {
  const spec = WEAPONS[weapon];
  const equipped = [l.quick.primary, l.quick.secondary].some((w) => w?.weapon === weapon);
  const inBag = l.bag.items.some((i) => i.def === `weapon:${weapon}`);
  if ((equipped || inBag) && spec.ammo) {
    const { pouch } = pickupAmmo(l.quick.ammo, spec.ammo, startingMag(weapon));
    return { loadout: { ...l, quick: { ...l.quick, ammo: pouch } }, placed: 'ammo' };
  }
  const item = makeWeaponItem(uid, weapon);
  if (!l.quick.primary) return { loadout: { ...l, quick: { ...l.quick, primary: item } }, placed: 'primary' };
  if (!l.quick.secondary) return { loadout: { ...l, quick: { ...l.quick, secondary: item } }, placed: 'secondary' };
  const r = addToBag(l.bag, item.def, 1, () => uid);
  return r.added ? { loadout: { ...l, bag: r.bag }, placed: 'bag' } : { loadout: l, placed: 'none' };
}

/** Uses one unit of a consumable stack from the bag. */
export function useConsumable(l: Loadout, v: PlayerVitals, uid: string): { loadout: Loadout; vitals: PlayerVitals; used: boolean } {
  const it = l.bag.items.find((i) => i.uid === uid);
  const effect = it ? ITEM_DEFS[it.def].consume : undefined;
  if (!it || !effect) return { loadout: l, vitals: v, used: false };
  const { bag } = removeFromBag(l.bag, uid, 1);
  const stillThere = bag.items.some((i) => i.uid === uid);
  return {
    loadout: { bag, quick: { ...l.quick, consumableUid: l.quick.consumableUid === uid && !stillThere ? null : l.quick.consumableUid } },
    vitals: consume(v, effect),
    used: true,
  };
}

// ---------------------------------------------------------------- loot containers

export const LOOT_TABLES: Record<string, LootTableEntry[]> = {
  grocery_shelf: [
    { def: 'canned_beans', weight: 5, min: 1, max: 2 },
    { def: 'bread', weight: 3, min: 1, max: 1 },
    { def: 'chips', weight: 4, min: 1, max: 3 },
    { def: 'apple', weight: 3, min: 1, max: 3 },
  ],
  fridge: [
    { def: 'water_bottle', weight: 6, min: 1, max: 2 },
    { def: 'soda', weight: 4, min: 1, max: 2 },
    { def: 'energy_drink', weight: 2, min: 1, max: 1 },
  ],
  register: [
    { def: 'chips', weight: 4, min: 1, max: 2 },
    { def: 'energy_drink', weight: 3, min: 1, max: 1 },
    { def: 'coffee', weight: 2, min: 1, max: 1 },
    { def: 'ammo:9mm', weight: 1, min: 6, max: 12 },
  ],
  crate: [
    { def: 'water_bottle', weight: 3, min: 1, max: 3 },
    { def: 'canned_beans', weight: 3, min: 1, max: 3 },
    { def: 'bandage', weight: 2, min: 1, max: 2 },
    { def: 'ammo:9mm', weight: 2, min: 12, max: 24 },
    { def: 'ammo:12ga', weight: 1, min: 6, max: 12 },
  ],
  pharmacy: [
    { def: 'bandage', weight: 5, min: 1, max: 3 },
    { def: 'water_bottle', weight: 2, min: 1, max: 1 },
    { def: 'coffee', weight: 1, min: 1, max: 1 },
  ],

  // ---- City furniture (map/city/cityContainers.ts picks the table by building, shop, room and furniture)
  kitchen_fridge: [
    { def: 'water_bottle', weight: 4, min: 1, max: 2 },
    { def: 'soda', weight: 3, min: 1, max: 2 },
    { def: 'apple', weight: 3, min: 1, max: 3 },
    { def: 'bread', weight: 2, min: 1, max: 1 },
    { def: 'canned_beans', weight: 1, min: 1, max: 1 },
  ],
  kitchen_counter: [
    { def: 'canned_beans', weight: 4, min: 1, max: 2 },
    { def: 'chips', weight: 2, min: 1, max: 2 },
    { def: 'coffee', weight: 2, min: 1, max: 1 },
    { def: 'weapon:knife', weight: 2, min: 1, max: 1 },
    { def: 'lighter', weight: 1, min: 1, max: 1 },
    { def: 'duct_tape', weight: 1, min: 1, max: 1 },
  ],
  bedroom_cabinet: [
    { def: 'hoodie', weight: 3, min: 1, max: 1 },
    { def: 'winter_jacket', weight: 1, min: 1, max: 1 },
    { def: 'leather_jacket', weight: 1, min: 1, max: 1 },
    { def: 'school_bag', weight: 2, min: 1, max: 1 },
    { def: 'book', weight: 2, min: 1, max: 1 },
    { def: 'painkillers', weight: 1, min: 1, max: 2 },
    { def: 'battery', weight: 1, min: 1, max: 2 },
  ],
  bath_cabinet: [
    { def: 'bandage', weight: 3, min: 1, max: 2 },
    { def: 'painkillers', weight: 3, min: 1, max: 3 },
    { def: 'disinfectant', weight: 2, min: 1, max: 1 },
  ],
  living_shelf: [
    { def: 'book', weight: 4, min: 1, max: 1 },
    { def: 'magazine', weight: 4, min: 1, max: 3 },
    { def: 'battery', weight: 2, min: 1, max: 4 },
    { def: 'radio', weight: 1, min: 1, max: 1 },
    { def: 'lighter', weight: 1, min: 1, max: 1 },
  ],
  office_desk: [
    { def: 'coffee', weight: 3, min: 1, max: 1 },
    { def: 'magazine', weight: 2, min: 1, max: 2 },
    { def: 'battery', weight: 2, min: 1, max: 2 },
    { def: 'painkillers', weight: 1, min: 1, max: 2 },
    { def: 'duct_tape', weight: 1, min: 1, max: 1 },
  ],
  office_cabinet: [
    { def: 'book', weight: 2, min: 1, max: 1 },
    { def: 'magazine', weight: 2, min: 1, max: 2 },
    { def: 'duct_tape', weight: 1, min: 1, max: 1 },
    { def: 'school_bag', weight: 1, min: 1, max: 1 },
  ],
  store_shelf: [
    { def: 'canned_beans', weight: 5, min: 1, max: 3 },
    { def: 'bread', weight: 3, min: 1, max: 2 },
    { def: 'chips', weight: 4, min: 1, max: 3 },
    { def: 'apple', weight: 3, min: 1, max: 4 },
    { def: 'water_bottle', weight: 3, min: 1, max: 2 },
  ],
  store_fridge: [
    { def: 'water_bottle', weight: 6, min: 1, max: 3 },
    { def: 'soda', weight: 4, min: 1, max: 3 },
    { def: 'energy_drink', weight: 2, min: 1, max: 2 },
  ],
  checkout: [
    { def: 'chips', weight: 3, min: 1, max: 2 },
    { def: 'energy_drink', weight: 2, min: 1, max: 1 },
    { def: 'battery', weight: 2, min: 1, max: 4 },
    { def: 'lighter', weight: 2, min: 1, max: 1 },
    { def: 'magazine', weight: 2, min: 1, max: 1 },
  ],
  pharmacy_shelf: [
    { def: 'bandage', weight: 5, min: 1, max: 3 },
    { def: 'painkillers', weight: 4, min: 1, max: 3 },
    { def: 'disinfectant', weight: 3, min: 1, max: 2 },
    { def: 'splint', weight: 1, min: 1, max: 1 },
    { def: 'water_bottle', weight: 1, min: 1, max: 1 },
  ],
  hospital_cabinet: [
    { def: 'bandage', weight: 4, min: 1, max: 3 },
    { def: 'disinfectant', weight: 4, min: 1, max: 2 },
    { def: 'splint', weight: 3, min: 1, max: 1 },
    { def: 'painkillers', weight: 3, min: 1, max: 3 },
  ],
  police_locker: [
    { def: 'ammo:9mm', weight: 4, min: 12, max: 24 },
    { def: 'ammo:12ga', weight: 2, min: 6, max: 12 },
    { def: 'leather_jacket', weight: 1, min: 1, max: 1 },
    { def: 'work_gloves', weight: 2, min: 1, max: 1 },
    { def: 'weapon:bat', weight: 1, min: 1, max: 1 },
    { def: 'duffel_bag', weight: 1, min: 1, max: 1 },
    { def: 'bandage', weight: 2, min: 1, max: 2 },
  ],
  police_cabinet: [
    { def: 'ammo:9mm', weight: 3, min: 12, max: 24 },
    { def: 'ammo:556', weight: 1, min: 15, max: 30 },
    { def: 'bandage', weight: 2, min: 1, max: 2 },
    { def: 'painkillers', weight: 1, min: 1, max: 2 },
  ],
  hardware_shelf: [
    { def: 'nails', weight: 4, min: 10, max: 40 },
    { def: 'duct_tape', weight: 3, min: 1, max: 2 },
    { def: 'screwdriver', weight: 2, min: 1, max: 1 },
    { def: 'saw', weight: 2, min: 1, max: 1 },
    { def: 'wrench', weight: 2, min: 1, max: 1 },
    { def: 'scrap_metal', weight: 2, min: 1, max: 3 },
    { def: 'weapon:hammer', weight: 2, min: 1, max: 1 },
    { def: 'weapon:crowbar', weight: 1, min: 1, max: 1 },
    { def: 'work_gloves', weight: 2, min: 1, max: 1 },
    { def: 'rope', weight: 1, min: 1, max: 1 },
    { def: 'tomato_seeds', weight: 1, min: 1, max: 3 },
    { def: 'carrot_seeds', weight: 1, min: 1, max: 3 },
  ],
  books_shelf: [
    { def: 'book', weight: 6, min: 1, max: 1 },
    { def: 'magazine', weight: 5, min: 1, max: 3 },
  ],
  thrift_shelf: [
    { def: 'hoodie', weight: 3, min: 1, max: 1 },
    { def: 'winter_jacket', weight: 2, min: 1, max: 1 },
    { def: 'leather_jacket', weight: 2, min: 1, max: 1 },
    { def: 'work_gloves', weight: 2, min: 1, max: 1 },
    { def: 'school_bag', weight: 2, min: 1, max: 1 },
    { def: 'duffel_bag', weight: 1, min: 1, max: 1 },
    { def: 'hiking_bag', weight: 1, min: 1, max: 1 },
  ],
  electronics_shelf: [
    { def: 'battery', weight: 5, min: 2, max: 6 },
    { def: 'radio', weight: 3, min: 1, max: 1 },
    { def: 'duct_tape', weight: 1, min: 1, max: 1 },
  ],
  sports_shelf: [
    { def: 'weapon:bat', weight: 3, min: 1, max: 1 },
    { def: 'hiking_bag', weight: 2, min: 1, max: 1 },
    { def: 'duffel_bag', weight: 2, min: 1, max: 1 },
    { def: 'water_bottle', weight: 2, min: 1, max: 2 },
    { def: 'energy_drink', weight: 2, min: 1, max: 2 },
  ],
  diner_counter: [
    { def: 'bread', weight: 3, min: 1, max: 2 },
    { def: 'canned_beans', weight: 3, min: 1, max: 2 },
    { def: 'coffee', weight: 3, min: 1, max: 2 },
    { def: 'apple', weight: 2, min: 1, max: 2 },
    { def: 'weapon:knife', weight: 1, min: 1, max: 1 },
  ],
  laundromat_shelf: [
    { def: 'hoodie', weight: 3, min: 1, max: 1 },
    { def: 'winter_jacket', weight: 1, min: 1, max: 1 },
    { def: 'work_gloves', weight: 1, min: 1, max: 1 },
    { def: 'magazine', weight: 2, min: 1, max: 2 },
  ],
  gas_shelf: [
    { def: 'chips', weight: 3, min: 1, max: 2 },
    { def: 'water_bottle', weight: 2, min: 1, max: 2 },
    { def: 'energy_drink', weight: 2, min: 1, max: 2 },
    { def: 'gas_can', weight: 2, min: 1, max: 1 },
    { def: 'battery', weight: 1, min: 1, max: 4 },
    { def: 'lighter', weight: 2, min: 1, max: 1 },
    { def: 'duct_tape', weight: 1, min: 1, max: 1 },
  ],
  gas_storage: [
    { def: 'gas_can', weight: 2, min: 1, max: 1 },
    { def: 'car_battery', weight: 1, min: 1, max: 1 },
    { def: 'spare_tire', weight: 1, min: 1, max: 1 },
    { def: 'wrench', weight: 2, min: 1, max: 1 },
    { def: 'scrap_metal', weight: 2, min: 1, max: 2 },
  ],
  storage_shelf: [
    { def: 'duct_tape', weight: 2, min: 1, max: 1 },
    { def: 'nails', weight: 2, min: 5, max: 20 },
    { def: 'scrap_metal', weight: 2, min: 1, max: 2 },
    { def: 'rope', weight: 1, min: 1, max: 1 },
    { def: 'school_bag', weight: 1, min: 1, max: 1 },
    { def: 'battery', weight: 1, min: 1, max: 2 },
    { def: 'tomato_seeds', weight: 1, min: 1, max: 2 },
    { def: 'carrot_seeds', weight: 1, min: 1, max: 2 },
  ],
};

// Skill books and thread go where you'd expect them
const book = (skill: SkillId, volume: 1 | 2, weight: number): LootTableEntry => ({ def: `book:${skill}:${volume}`, weight, min: 1, max: 1 });
LOOT_TABLES.books_shelf.push(...SKILL_IDS.flatMap((s) => [book(s, 1, 1), book(s, 2, 0.5)]));
LOOT_TABLES.living_shelf.push(...SKILL_IDS.map((s) => book(s, 1, 0.15)));
LOOT_TABLES.office_cabinet.push(book('electrical', 1, 0.5), book('mechanics', 1, 0.5), book('firstAid', 1, 0.5));
LOOT_TABLES.hardware_shelf.push(book('carpentry', 1, 1), book('carpentry', 2, 0.5), book('metalworking', 1, 0.6), book('electrical', 1, 0.6));
LOOT_TABLES.police_locker.push(book('aiming', 1, 0.8), book('reloading', 1, 0.8), book('aiming', 2, 0.3));
LOOT_TABLES.hospital_cabinet.push(book('firstAid', 1, 1), book('firstAid', 2, 0.5));
LOOT_TABLES.gas_storage.push(book('mechanics', 1, 1), book('mechanics', 2, 0.4));
LOOT_TABLES.diner_counter.push(book('cooking', 1, 0.8));
LOOT_TABLES.sports_shelf.push(book('fishing', 1, 0.8), book('trapping', 1, 0.6), book('foraging', 1, 0.6));
LOOT_TABLES.storage_shelf.push(book('farming', 1, 0.3), book('maintenance', 1, 0.3));
for (const t of ['thrift_shelf', 'laundromat_shelf', 'bedroom_cabinet'] as const) LOOT_TABLES[t].push({ def: 'thread', weight: 2, min: 1, max: 3 });
LOOT_TABLES.thrift_shelf.push(book('tailoring', 1, 1), book('tailoring', 2, 0.4));

// Building materials, tools and recipe magazines
const entry = (def: ItemDefId, weight: number, min = 1, max = 1): LootTableEntry => ({ def, weight, min, max });
LOOT_TABLES.hardware_shelf.push(entry('planks', 4, 2, 5), entry('blowtorch', 0.6), entry('mag:metalwork', 0.5));
LOOT_TABLES.storage_shelf.push(entry('planks', 3, 1, 4), entry('scrap_metal', 1, 1, 2));
LOOT_TABLES.gas_storage.push(entry('planks', 2, 1, 3), entry('blowtorch', 0.8), entry('mag:metalwork', 0.3));
LOOT_TABLES.electronics_shelf.push(entry('electronics_scrap', 3, 1, 3), entry('mag:electronics', 0.8));
LOOT_TABLES.books_shelf.push(entry('mag:metalwork', 0.6), entry('mag:electronics', 0.6), entry('mag:tailoring', 0.6));
LOOT_TABLES.thrift_shelf.push(entry('rags', 2, 2, 6), entry('mag:tailoring', 0.6));
LOOT_TABLES.laundromat_shelf.push(entry('rags', 2, 2, 6));
LOOT_TABLES.bedroom_cabinet.push(entry('rags', 1, 1, 3));
LOOT_TABLES.living_shelf.push(entry('mag:electronics', 0.15), entry('mag:tailoring', 0.15));

// World simulation (Phase 6): meat to cook, bottles to refill, fuel and generators
LOOT_TABLES.kitchen_fridge.push(entry('raw_meat', 3, 1, 2));
LOOT_TABLES.store_fridge.push(entry('raw_meat', 2, 1, 2));
LOOT_TABLES.fridge.push(entry('raw_meat', 2, 1, 1));
LOOT_TABLES.diner_counter.push(entry('raw_meat', 2, 1, 2));
LOOT_TABLES.kitchen_counter.push(entry('empty_bottle', 2, 1, 2));
LOOT_TABLES.gas_shelf.push(entry('empty_bottle', 1, 1, 2));
LOOT_TABLES.gas_storage.push(entry('gas_can_full', 1.5), entry('generator', 0.6), entry('mag:electronics', 0.2));
LOOT_TABLES.hardware_shelf.push(entry('generator', 0.3), entry('gas_can', 0.6));
LOOT_TABLES.storage_shelf.push(entry('gas_can', 0.6), entry('empty_bottle', 1, 1, 2));

// Phase 7: vehicles and food production
LOOT_TABLES.trunk = [
  entry('spare_tire', 2),
  entry('gas_can', 2),
  entry('gas_can_full', 0.8),
  entry('wrench', 1.5),
  entry('duct_tape', 2),
  entry('water_bottle', 2, 1, 2),
  entry('rope', 1),
  entry('empty_bottle', 1),
  entry('car_battery', 0.5),
  entry('screwdriver', 1),
  entry('chips', 1, 1, 2),
];
LOOT_TABLES.police_trunk = [
  entry('ammo:9mm', 3, 12, 24),
  entry('ammo:12ga', 2, 6, 12),
  entry('bandage', 2, 1, 2),
  entry('weapon:bat', 1),
  entry('spare_tire', 1),
  entry('gas_can_full', 0.6),
];
LOOT_TABLES.ambulance_trunk = [
  entry('bandage', 4, 1, 3),
  entry('disinfectant', 3, 1, 2),
  entry('splint', 2),
  entry('painkillers', 3, 1, 3),
  entry('water_bottle', 1, 1, 2),
];
LOOT_TABLES.hardware_shelf.push(entry('shovel', 1.2), entry('potato_seeds', 1, 1, 3), entry('cabbage_seeds', 1, 1, 3), entry('fishing_rod', 0.5));
LOOT_TABLES.storage_shelf.push(entry('shovel', 0.8), entry('potato_seeds', 0.6, 1, 2), entry('cabbage_seeds', 0.6, 1, 2));
LOOT_TABLES.sports_shelf.push(entry('fishing_rod', 1.5), entry('worms', 0.5, 2, 5));
LOOT_TABLES.gas_storage.push(entry('fishing_rod', 0.4));
LOOT_TABLES.kitchen_fridge.push(entry('tomato', 1, 1, 2), entry('carrot', 1, 1, 3));
LOOT_TABLES.store_shelf.push(entry('potato', 1.5, 1, 3), entry('carrot', 1, 1, 3), entry('cabbage', 0.8));
LOOT_TABLES.grocery_shelf.push(entry('potato', 1.5, 1, 3), entry('tomato', 1, 1, 3), entry('cabbage', 0.8));

/** Containers a POI kind is furnished with (table, rolls, respawn). */
export const POI_CONTAINERS: Record<PoiKind, { kind: ContainerKind; table: string; rolls: number; respawnSeconds: number | null }[]> = {
  grocery: [
    { kind: 'shelf', table: 'grocery_shelf', rolls: 3, respawnSeconds: 420 },
    { kind: 'shelf', table: 'grocery_shelf', rolls: 3, respawnSeconds: 420 },
    { kind: 'fridge', table: 'fridge', rolls: 3, respawnSeconds: 420 },
    { kind: 'register', table: 'register', rolls: 1, respawnSeconds: null },
  ],
  convenience: [
    { kind: 'shelf', table: 'grocery_shelf', rolls: 2, respawnSeconds: 300 },
    { kind: 'fridge', table: 'fridge', rolls: 2, respawnSeconds: 300 },
    { kind: 'register', table: 'register', rolls: 2, respawnSeconds: null },
  ],
  pharmacy: [{ kind: 'cabinet', table: 'pharmacy', rolls: 3, respawnSeconds: 600 }],
  police: [{ kind: 'crate', table: 'crate', rolls: 4, respawnSeconds: null }],
  house: [{ kind: 'cabinet', table: 'grocery_shelf', rolls: 1, respawnSeconds: null }],
};

/**
 * Rolls a container's contents. `lootMul` (difficulty) scales the number of
 * rolls down as the match goes on, never below one.
 */
export function rollLoot(table: string, rolls: number, lootMul: number, rng: () => number, uidPrefix: string): InventoryItem[] {
  const entries = LOOT_TABLES[table] ?? [];
  const total = entries.reduce((s, e) => s + e.weight, 0);
  if (!total) return [];
  const n = Math.max(1, Math.round(rolls * lootMul));
  const out: InventoryItem[] = [];
  for (let k = 0; k < n; k++) {
    let pick = rng() * total;
    const e = entries.find((x) => (pick -= x.weight) < 0) ?? entries[entries.length - 1];
    const qty = e.min + Math.floor(rng() * (e.max - e.min + 1));
    const same = out.find((i) => i.def === e.def);
    if (same) same.qty += qty;
    else out.push({ uid: `${uidPrefix}:${k}`, def: e.def, qty });
  }
  return out;
}

/** Refills an emptied, respawning container once its timer has run out. */
export function refreshContainer(c: LootContainer, now: number, lootMul: number, rng: () => number): LootContainer {
  if (c.contents.length || c.respawnSeconds === null || c.lootedAt === null) return c;
  if (now - c.lootedAt < c.respawnSeconds) return c;
  return { ...c, lootedAt: null, contents: rollLoot(c.table, c.rolls, lootMul, rng, `${c.id}@${Math.floor(now)}`) };
}

/** Removes one stack; stamps lootedAt when the container is emptied. */
export function takeFromContainer(c: LootContainer, uid: string, now: number): { container: LootContainer; item: InventoryItem | null } {
  const item = c.contents.find((i) => i.uid === uid) ?? null;
  if (!item) return { container: c, item: null };
  const contents = c.contents.filter((i) => i.uid !== uid);
  return { container: { ...c, contents, lootedAt: contents.length ? c.lootedAt : now }, item };
}
