import { describe, expect, it } from 'vitest';
import { FRIDGE_RATE, SPOIL, START_AGE_MAX, ageOn, agingClock, freshnessOf, fridgeClock, rebase, sameBatch, spoilPenalty } from './spoilage';
import { ContainerStore, decodeItem, encodeItem, type ContainerSpawn } from './containers';
import { ITEM_DEFS, addItemToBag, addToBag } from './inventory';
import type { Bag, InventoryItem } from './types';

// Phase 6: food spoilage, fridges and the power cut, and how ages travel.

const bag = (items: InventoryItem[] = []): Bag => ({ slots: 40, maxWeight: 100, items });

describe('freshness', () => {
  it('fresh, then stale, then rotten; non-perishables never spoil', () => {
    const s = SPOIL.raw_meat!;
    expect(freshnessOf('raw_meat', 0)).toBe('fresh');
    expect(freshnessOf('raw_meat', s.fresh - 0.1)).toBe('fresh');
    expect(freshnessOf('raw_meat', s.fresh)).toBe('stale');
    expect(freshnessOf('raw_meat', s.rotten)).toBe('rotten');
    expect(freshnessOf('canned_beans', 10_000)).toBe('fresh');
  });

  it('stale food fills you less; rotten food poisons you', () => {
    const eff = ITEM_DEFS.bread.consume!;
    expect(spoilPenalty(eff, 'fresh')).toBeNull();
    const stale = spoilPenalty(eff, 'stale')!;
    expect(stale.hunger).toBeLessThan(0);
    expect(stale.effects).toBeUndefined();
    const rotten = spoilPenalty(eff, 'rotten')!;
    expect(rotten.hunger!).toBeLessThan(stale.hunger!);
    expect(rotten.effects?.[0]).toMatchObject({ kind: 'poison', source: 'food_poisoning' });
  });
});

describe('fridges and the power cut', () => {
  it('a fridge ages food slowly while the mains are on, at full speed after', () => {
    const off = 50;
    expect(fridgeClock(10, off)).toBeCloseTo(10 * FRIDGE_RATE);
    expect(fridgeClock(off + 10, off) - fridgeClock(off, off)).toBeCloseTo(10);
    expect(agingClock('shelf', 30, off)).toBe(30);
    expect(agingClock('bag', 30, off)).toBe(30);
    expect(agingClock('fridge', 30, off)).toBeCloseTo(30 * FRIDGE_RATE);
  });

  it('moving food between places keeps its age', () => {
    const it: InventoryItem = { uid: 'a', def: 'apple', qty: 1, rot: 5 };
    const moved = rebase(it, 20, 3);
    expect(ageOn(moved, 3)).toBeCloseTo(ageOn(it, 20));
    expect(rebase({ uid: 'b', def: 'apple', qty: 1 }, 20, 3).rot).toBeUndefined();
  });

  it('food in a fridge lasts much longer than on a shelf until the power fails', () => {
    const spawns: ContainerSpawn[] = [
      { id: 0, kind: 'fridge', owner: 'b', x: 0, y: 0, w: 16, h: 16, table: 'kitchen_fridge', rolls: 0, empty: 1, respawn: null },
      { id: 1, kind: 'shelf', owner: 'b', x: 40, y: 0, w: 16, h: 16, table: 'store_shelf', rolls: 0, empty: 1, respawn: null },
    ];
    const store = new ContainerStore(spawns, 1);
    const off = 60;
    let hours = 0;
    store.agingClock = (where) => agingClock(where, hours, off);
    // Put fresh meat into both at hour 0
    store.put(0, { uid: 'm1', def: 'raw_meat', qty: 1, rot: 0 });
    store.put(1, { uid: 'm2', def: 'raw_meat', qty: 1, rot: 0 });
    hours = 30; // past raw meat's 18 fresh hours
    const fromFridge = store.take(0, 'raw_meat', 1, 0)!;
    const fromShelf = store.take(1, 'raw_meat', 1, 0)!;
    expect(freshnessOf('raw_meat', ageOn(fromShelf, hours))).toBe('stale');
    expect(freshnessOf('raw_meat', ageOn(fromFridge, hours))).toBe('fresh');
    expect(ageOn(fromFridge, hours)).toBeCloseTo(30 * FRIDGE_RATE);
  });

  it('starting loot is a little aged, seeded per container (same on every client)', () => {
    const spawns: ContainerSpawn[] = Array.from({ length: 40 }, (_, i) => ({
      id: i, kind: 'fridge' as const, owner: 'b', x: i * 20, y: 0, w: 16, h: 16, table: 'kitchen_fridge', rolls: 4, empty: 0, respawn: null,
    }));
    const a = new ContainerStore(spawns, 9);
    const b = new ContainerStore(spawns, 9);
    let perishables = 0;
    for (let i = 0; i < 40; i++) {
      const ca = a.get(i)!.contents;
      expect(b.get(i)!.contents).toEqual(ca);
      for (const it of ca) {
        if (!SPOIL[it.def]) continue;
        perishables++;
        expect(it.rot).toBeLessThanOrEqual(0);
        expect(-it.rot!).toBeLessThanOrEqual(START_AGE_MAX * SPOIL[it.def]!.fresh + 1e-9);
      }
    }
    expect(perishables).toBeGreaterThan(5);
  });
});

describe('ages on the wire and in the bag', () => {
  it('encodes and decodes rot, with or without condition and magazine', () => {
    const it: InventoryItem = { uid: 'x', def: 'apple', qty: 2, rot: -12.34 };
    const back = decodeItem(encodeItem(it), 'y')!;
    expect(back).toMatchObject({ def: 'apple', qty: 2 });
    expect(back.rot).toBeCloseTo(-12.3, 1);
    expect(back.cond).toBeUndefined();
    expect(back.mag).toBeUndefined();
    // Old rows (no rot) still decode; rot on a non-perishable is ignored
    expect(decodeItem(['planks', 3], 'z')).toMatchObject({ def: 'planks', qty: 3 });
    expect(decodeItem(['planks', 3, -1, -1, 50], 'z')!.rot).toBeUndefined();
    expect(decodeItem(['hoodie', 1, 40], 'z')!.cond).toBeCloseTo(0.4);
  });

  it('food of different ages keeps separate stacks; the same batch merges', () => {
    let b = bag();
    b = addItemToBag(b, { uid: 'a', def: 'apple', qty: 2, rot: 10 }).bag;
    b = addItemToBag(b, { uid: 'b', def: 'apple', qty: 1, rot: 40 }).bag;
    expect(b.items).toHaveLength(2);
    b = addItemToBag(b, { uid: 'c', def: 'apple', qty: 1, rot: 10.4 }).bag;
    expect(b.items).toHaveLength(2);
    expect(b.items[0].qty).toBe(3);
    expect(sameBatch({ def: 'apple', rot: 1 }, { def: 'apple', rot: 5 })).toBe(false);
  });

  it('new food never tops up an older stack', () => {
    const b = addToBag(bag([{ uid: 'old', def: 'bread', qty: 1, rot: 0 }]), 'bread', 1, () => 'new').bag;
    expect(b.items).toHaveLength(2);
    expect(b.items[1]).toMatchObject({ uid: 'new', qty: 1 });
    expect(b.items[1].rot).toBeUndefined();
  });
});
