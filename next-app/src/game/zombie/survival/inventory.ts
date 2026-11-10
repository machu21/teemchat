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

// ============================================================
// ZOMBIE MODE — BAG, QUICK SLOTS & LOOT CONTAINERS (pure)
// Every function returns new objects (host diffs + broadcasts changes).
// ============================================================

export const BAG_SLOTS = 12;
export const BAG_MAX_WEIGHT = 20;
/** Pouch cap per ammo type (rounds). */
export const POUCH_CAP: AmmoPouch = { '9mm': 120, '12ga': 48, '556': 180, '762': 180, belt: 300 };

const CONSUMABLES: Record<ConsumableId, ItemDef> = {
  canned_beans: { id: 'canned_beans', name: 'Canned Beans', icon: 'soup', category: 'food', weight: 0.5, maxStack: 4, useSeconds: 2, consume: { hunger: 35, regen: { hpPerSecond: 0.5, seconds: 20 } } },
  chips: { id: 'chips', name: 'Chips', icon: 'cookie', category: 'food', weight: 0.15, maxStack: 6, useSeconds: 1, consume: { hunger: 15, hydration: -5 } },
  apple: { id: 'apple', name: 'Apple', icon: 'apple', category: 'food', weight: 0.2, maxStack: 6, useSeconds: 1, consume: { hunger: 12, hydration: 5, regen: { hpPerSecond: 0.3, seconds: 10 } } },
  bread: { id: 'bread', name: 'Bread', icon: 'bread', category: 'food', weight: 0.4, maxStack: 3, useSeconds: 2, consume: { hunger: 30, regen: { hpPerSecond: 0.4, seconds: 15 } } },
  water_bottle: { id: 'water_bottle', name: 'Water Bottle', icon: 'droplet', category: 'drink', weight: 0.5, maxStack: 4, useSeconds: 1, consume: { hydration: 40 } },
  soda: { id: 'soda', name: 'Soda', icon: 'soda', category: 'drink', weight: 0.35, maxStack: 4, useSeconds: 1, consume: { hydration: 20, stamina: 10 } },
  energy_drink: {
    id: 'energy_drink', name: 'Energy Drink', icon: 'zap', category: 'stimulant', weight: 0.3, maxStack: 4, useSeconds: 1,
    consume: { hydration: 10, stamina: 100, effects: [{ kind: 'stimulant', remaining: 30, magnitude: 1.2, source: 'energy_drink' }] },
  },
  coffee: {
    id: 'coffee', name: 'Coffee', icon: 'coffee', category: 'stimulant', weight: 0.3, maxStack: 4, useSeconds: 1,
    consume: { hydration: 5, stamina: 40, effects: [{ kind: 'stimulant', remaining: 12, magnitude: 1.1, source: 'coffee' }] },
  },
  bandage: { id: 'bandage', name: 'Bandage', icon: 'bandage', category: 'medical', weight: 0.1, maxStack: 5, useSeconds: 3, consume: { health: 15, regen: { hpPerSecond: 1, seconds: 10 } } },
};

function buildDefs(): Record<ItemDefId, ItemDef> {
  const defs = { ...CONSUMABLES } as Record<ItemDefId, ItemDef>;
  for (const w of WEAPON_ORDER) {
    const s = WEAPONS[w];
    defs[`weapon:${w}`] = { id: `weapon:${w}`, name: s.name, icon: s.icon, category: 'weapon', weight: w === 'mg' ? 8 : w === 'axe' || w === 'pistol' ? 1.5 : 3.5, maxStack: 1 };
  }
  for (const a of Object.keys(AMMO_NAMES) as AmmoType[]) {
    // Ammo never occupies bag slots (it goes to the pouch); weight is per round.
    defs[`ammo:${a}`] = { id: `ammo:${a}`, name: AMMO_NAMES[a], icon: 'package', category: 'ammo', weight: 0.01, maxStack: 999 };
  }
  return defs;
}

export const ITEM_DEFS: Record<ItemDefId, ItemDef> = buildDefs();

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
  for (const it of items) {
    if (left <= 0 || room <= 0) break;
    if (it.def !== def || it.qty >= d.maxStack) continue;
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
};

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
