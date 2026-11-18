import { describe, expect, it } from 'vitest';
import { CONTAINER_CAPACITY, ContainerStore, PILE_ID_BASE, decodeItem, encodeItem, type ContainerSpawn } from './containers';
import { ITEM_DEFS, LOOT_TABLES, addItemToBag, bagWeight, freshLoadout, splitStack } from './inventory';
import { CATEGORY_GROUPS, GEAR_DEFS } from './items';
import type { ItemCategory, ItemDefId } from './types';
import { generateCity } from '../../map/city/cityPlan';
import { TABLE_RULES, cityContainers } from '../../map/city/cityContainers';
import { generateCityLoot } from '../../map/city/cityLoot';

const spawn = (id: number, over: Partial<ContainerSpawn> = {}): ContainerSpawn => ({
  id,
  kind: 'fridge',
  owner: 'b1',
  x: 100 + id * 50,
  y: 100,
  w: 16,
  h: 16,
  table: 'store_fridge',
  rolls: 3,
  empty: 0,
  respawn: null,
  ...over,
});

describe('item database', () => {
  it('every item has a name, icon, description, weight and stack size', () => {
    for (const d of Object.values(ITEM_DEFS)) {
      expect(d.name.length).toBeGreaterThan(0);
      expect(d.description.length).toBeGreaterThan(3);
      expect(d.weight).toBeGreaterThanOrEqual(0);
      expect(d.maxStack).toBeGreaterThanOrEqual(1);
    }
  });

  it('covers every category in the brief, and every category has an inventory group', () => {
    const cats = new Set(Object.values(ITEM_DEFS).map((d) => d.category));
    for (const c of ['food', 'drink', 'weapon', 'ammo', 'medical', 'clothing', 'tool', 'material', 'electronics', 'farming', 'vehicle', 'misc'] as ItemCategory[]) {
      expect(cats.has(c)).toBe(true);
    }
    const grouped = new Set(CATEGORY_GROUPS.flatMap((g) => g.categories));
    for (const c of cats) expect(grouped.has(c)).toBe(true);
  });

  it('bags add capacity, clothes add warmth / protection', () => {
    expect(GEAR_DEFS.hiking_bag.equip).toMatchObject({ slot: 'back', capacityKg: 13 });
    expect(GEAR_DEFS.leather_jacket.equip?.protection).toBeGreaterThan(GEAR_DEFS.hoodie.equip?.protection ?? 0);
    expect(GEAR_DEFS.winter_jacket.equip?.insulation).toBeGreaterThan(5);
  });

  it('every loot table only names real items, and every table the city uses has rules', () => {
    for (const entries of Object.values(LOOT_TABLES)) for (const e of entries) expect(ITEM_DEFS[e.def as ItemDefId]).toBeDefined();
    for (const t of Object.keys(TABLE_RULES)) expect(LOOT_TABLES[t]?.length).toBeGreaterThan(0);
  });
});

describe('bag helpers', () => {
  it('splits a stack in two', () => {
    let n = 0;
    const bag = { ...freshLoadout().bag, items: [{ uid: 'a', def: 'nails' as const, qty: 30 }] };
    const split = splitStack(bag, 'a', 10, () => `n${n++}`);
    expect(split.items.map((i) => i.qty)).toEqual([20, 10]);
    expect(splitStack(bag, 'a', 30, () => 'x')).toBe(bag);
  });

  it('adds whole items by weight; conditioned items keep their own stack', () => {
    const bag = { ...freshLoadout().bag, maxWeight: 2 };
    const r = addItemToBag(bag, { uid: 'j', def: 'hoodie', qty: 1, cond: 0.5 });
    expect(r.added).toBe(true);
    expect(r.bag.items[0].cond).toBe(0.5);
    expect(addItemToBag(r.bag, { uid: 'b', def: 'car_battery', qty: 1 }).added).toBe(false);
    expect(addItemToBag(r.bag, { uid: 'b', def: 'car_battery', qty: 1 }, true).added).toBe(true);
    // Spilling over the stack size makes stacks with distinct uids
    const sodas = addItemToBag({ ...bag, maxWeight: 10 }, { uid: 's', def: 'soda', qty: 6 }).bag;
    expect(sodas.items.map((i) => i.qty)).toEqual([4, 2]);
    expect(new Set(sodas.items.map((i) => i.uid)).size).toBe(2);
    const nails = addItemToBag(addItemToBag(bag, { uid: 'n1', def: 'nails', qty: 10 }).bag, { uid: 'n2', def: 'nails', qty: 5 }).bag;
    expect(nails.items).toHaveLength(1);
    expect(bagWeight(nails)).toBeCloseTo(0.15);
  });
});

describe('wire encoding', () => {
  it('round-trips items and rejects junk', () => {
    expect(decodeItem(encodeItem({ uid: 'x', def: 'weapon:bat', qty: 1, cond: 0.42 }), 'y')).toEqual({ uid: 'y', def: 'weapon:bat', qty: 1, cond: 0.42 });
    expect(decodeItem(encodeItem({ uid: 'x', def: 'weapon:pistol', qty: 1, cond: 1, mag: 7 }), 'y')).toMatchObject({ mag: 7 });
    expect(decodeItem(['not_an_item', 1], 'y')).toBeNull();
    expect(decodeItem(['nails', 0], 'y')).toBeNull();
    expect(decodeItem(['nails', 1.5], 'y')).toBeNull();
    expect(decodeItem('nails', 'y')).toBeNull();
  });
});

describe('ContainerStore', () => {
  it('rolls the same contents on every client from the seed, lazily', () => {
    const a = new ContainerStore([spawn(0), spawn(1)], 99);
    const b = new ContainerStore([spawn(0), spawn(1)], 99);
    expect(a.get(0)!.contents.length).toBeGreaterThan(0);
    expect(a.get(0)!.contents.map((i) => [i.def, i.qty])).toEqual(b.get(0)!.contents.map((i) => [i.def, i.qty]));
    const other = new ContainerStore([spawn(0)], 100);
    expect(JSON.stringify(other.get(0)!.contents.map((i) => [i.def, i.qty]))).not.toBe(JSON.stringify(a.get(0)!.contents.map((i) => [i.def, i.qty])));
    expect(new ContainerStore([spawn(0, { empty: 1 })], 99).get(0)!.contents).toEqual([]);
    expect(a.dirty.size).toBe(0);
  });

  it('takes part or all of a stack, marking the container changed', () => {
    const s = new ContainerStore([spawn(0, { table: 'hardware_shelf' })], 1);
    s.put(0, { uid: 'x', def: 'nails', qty: 20 });
    s.changed.clear();
    const part = s.take(0, 'nails', 5, 10);
    expect(part).toMatchObject({ def: 'nails', qty: 5 });
    expect(s.changed.has(0)).toBe(true);
    expect(s.take(0, 'radio', 1, 10)).toBeNull();
  });

  it('stamps when emptied and restocks shop containers after their timer', () => {
    const s = new ContainerStore([spawn(0, { respawn: 60 })], 1);
    for (const it of [...s.get(0)!.contents]) s.take(0, it.def, it.qty, 100);
    expect(s.get(0)!.contents).toEqual([]);
    expect(s.get(0)!.lootedAt).toBe(100);
    expect(s.restock(150, 1, () => 0.3)).toBe(0);
    expect(s.restock(161, 1, () => 0.3)).toBe(1);
    expect(s.get(0)!.contents.length).toBeGreaterThan(0);
  });

  it('respects capacity; plain stacks merge, worn items stay separate', () => {
    const s = new ContainerStore([spawn(0, { kind: 'desk', empty: 1 })], 1);
    expect(s.put(0, { uid: 'a', def: 'battery', qty: 2 })).toBe(true);
    expect(s.put(0, { uid: 'b', def: 'battery', qty: 3 })).toBe(true);
    expect(s.get(0)!.contents).toHaveLength(1);
    expect(s.get(0)!.contents[0].qty).toBe(5);
    expect(s.put(0, { uid: 'c', def: 'car_battery', qty: 1 })).toBe(true);
    expect(s.put(0, { uid: 'd', def: 'spare_tire', qty: 1 })).toBe(false); // 12 + 9 > 15 kg desk
    expect(CONTAINER_CAPACITY.ground).toBe(Infinity);
  });

  it('drops land on a nearby ground pile; empty piles disappear', () => {
    const s = new ContainerStore([], 1);
    const p = s.groundPileAt(50, 50);
    expect(p.id).toBeGreaterThanOrEqual(PILE_ID_BASE);
    s.put(p.id, { uid: 'a', def: 'rope', qty: 1 });
    expect(s.groundPileAt(55, 52).id).toBe(p.id);
    expect(s.groundPileAt(200, 200).id).not.toBe(p.id);
    expect(s.near(52, 50)?.id).toBe(p.id);
    s.take(p.id, 'rope', 1, 0);
    expect(s.get(p.id)).toBeNull();
    expect(s.encode(p.id)).toEqual([p.id, []]);
  });

  it('a client mirrors the host from container rows (furniture and piles)', () => {
    const host = new ContainerStore([spawn(0)], 5);
    const client = new ContainerStore([spawn(0)], 5);
    const first = host.get(0)!.contents[0];
    host.take(0, first.def, first.qty, 1);
    const pile = host.createPile('corpse', 300, 300, [{ uid: 'k', def: 'weapon:knife', qty: 1, cond: 0.3 }]);
    for (const id of host.changed) client.apply(host.encode(id)!);
    expect(client.get(0)!.contents.map((i) => i.def)).toEqual(host.get(0)!.contents.map((i) => i.def));
    expect(client.get(pile.id)).toMatchObject({ kind: 'corpse', x: 300, y: 300 });
    expect(client.get(pile.id)!.contents[0]).toMatchObject({ def: 'weapon:knife', cond: 0.3 });
    host.take(pile.id, 'weapon:knife', 1, 2);
    client.apply(host.encode(pile.id)!);
    expect(client.get(pile.id)).toBeNull();
  });

  it('finds the nearest container in reach, and a veto (wall) skips it', () => {
    const s = new ContainerStore([spawn(0), spawn(1)], 1);
    expect(s.near(105, 125)?.id).toBe(0);
    expect(s.near(155, 125)?.id).toBe(1);
    expect(s.near(105, 125, 24, (c) => c.x !== 100)).toBeNull();
    expect(s.near(400, 400)).toBeNull();
  });
});

describe('city containers', () => {
  const plan = generateCity();
  const containers = cityContainers(plan);
  const byBuilding = (kind: string) => {
    const ids = new Set(plan.buildings.filter((b) => b.kind === kind).map((b) => b.id));
    return containers.filter((c) => ids.has(c.owner));
  };

  it('turns the existing furniture into hundreds of searchable containers with stable ids', () => {
    expect(containers.length).toBeGreaterThan(300);
    containers.forEach((c, i) => expect(c.id).toBe(i));
    expect(cityContainers(generateCity()).map((c) => c.table)).toEqual(containers.map((c) => c.table));
  });

  it('loot fits the place: police lockers, pharmacy shelves, store fridges, home kitchens', () => {
    expect(byBuilding('police').some((c) => c.table === 'police_locker')).toBe(true);
    expect(byBuilding('pharmacy').some((c) => c.table === 'pharmacy_shelf')).toBe(true);
    expect(byBuilding('grocery').some((c) => c.table === 'store_fridge' && c.respawn !== null)).toBe(true);
    expect(byBuilding('house').some((c) => c.table === 'kitchen_fridge')).toBe(true);
    expect(byBuilding('hospital').every((c) => ['hospital_cabinet', 'kitchen_fridge', 'kitchen_counter', 'office_desk', 'storage_shelf', 'checkout'].includes(c.table))).toBe(true);
    const tables = new Set(containers.map((c) => c.table));
    expect(tables.has('hardware_shelf')).toBe(true);
  });

  it('leaves the floor loot exactly as it was', () => {
    // Floor loot ids are synced by index; containers must not disturb them
    const loot = generateCityLoot(plan);
    expect(loot.length).toBeGreaterThan(0);
    expect(generateCityLoot(plan)).toEqual(loot);
  });
});
