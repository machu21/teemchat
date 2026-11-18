import { hash32, mulberry32 } from '../../art/character/appearance';
import { ITEM_DEFS, isItemDefId, rollLoot, stackWeight } from './inventory';
import type { ContainerKind, InventoryItem, LootContainer } from './types';
import { SPOIL, START_AGE_MAX, rebase, sameBatch } from './spoilage';

// ============================================================
// ZOMBIE MODE — SEARCHABLE CONTAINERS (pure, DOM-free)
// Fridges, shelves, cabinets, lockers… come from the map's furniture
// (map/city/cityContainers.ts). Each one's starting contents are rolled
// from (seed, id), so every client knows them without any traffic; only
// containers someone has changed travel on the wire. Piles are created at
// runtime: `ground` for dropped items, `corpse` for a dead survivor's things.
//
// The host owns every change (take / put / drop) and broadcasts the
// container's new contents; clients ask and wait for an ack.
// ============================================================

export interface ContainerSpawn {
  /** Stable id: index in the map's container list. */
  id: number;
  kind: ContainerKind;
  /** Building id. */
  owner: string;
  /** Furniture box (world px). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** LOOT_TABLES key. */
  table: string;
  rolls: number;
  /** Chance the container starts empty. */
  empty: number;
  /** null = one-time; else seconds after being emptied before it restocks. */
  respawn: number | null;
}

export const CONTAINER_LABELS: Record<ContainerKind, string> = {
  shelf: 'Shelf',
  fridge: 'Fridge',
  register: 'Register',
  crate: 'Crate',
  cabinet: 'Cabinet',
  counter: 'Counter',
  desk: 'Desk',
  locker: 'Locker',
  checkout: 'Checkout',
  ground: 'Ground',
  corpse: 'Body',
  trunk: 'Trunk',
};

/** Weight each kind can hold (kg). Piles are unlimited. */
export const CONTAINER_CAPACITY: Record<ContainerKind, number> = {
  shelf: 40,
  fridge: 25,
  register: 10,
  crate: 50,
  cabinet: 25,
  counter: 30,
  desk: 15,
  locker: 30,
  checkout: 10,
  ground: Infinity,
  corpse: Infinity,
  /** Per vehicle (ContainerStore.capacityOf); this is the fallback. */
  trunk: 40,
};

/** Wire order for ContainerKind. Append only. */
export const CONTAINER_KINDS: readonly ContainerKind[] = ['shelf', 'fridge', 'register', 'crate', 'cabinet', 'counter', 'desk', 'locker', 'checkout', 'ground', 'corpse', 'trunk'];

/** px from the feet to a container's edge (piles: to their centre). */
export const CONTAINER_REACH = 24;
/** Runtime piles get ids from here up (map containers are 0…n-1). */
export const PILE_ID_BASE = 1_000_000;
/** Drops land on an existing ground pile within this radius. */
export const PILE_MERGE_RADIUS = 20;

/** One item on the wire: [def, qty, condition 0–100?, magazine?, rot × 10?] (-1 = no condition / magazine). */
export type ItemRow = [string, number, number?, number?, number?];
/** One container on the wire: [id, items, kindIndex?, x?, y?] (kind and position only for piles). */
export type ContainerRow = [number, ItemRow[], number?, number?, number?];

export function encodeItem(it: InventoryItem): ItemRow {
  const row: ItemRow = [it.def, it.qty];
  if (it.rot !== undefined) {
    row.push(it.cond === undefined ? -1 : Math.round(it.cond * 100), it.mag ?? -1, Math.round(it.rot * 10));
    return row;
  }
  if (it.cond !== undefined || it.mag !== undefined) row.push(Math.round((it.cond ?? 1) * 100));
  if (it.mag !== undefined) row.push(it.mag);
  return row;
}

/** Validates a wire item (unknown defs, silly quantities and conditions are rejected). */
export function decodeItem(row: unknown, uid: string): InventoryItem | null {
  if (!Array.isArray(row)) return null;
  const [def, qty, cond, mag, rot] = row as unknown[];
  if (!isItemDefId(def) || typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1 || qty > 9999) return null;
  const it: InventoryItem = { uid, def, qty };
  if (typeof cond === 'number' && Number.isFinite(cond) && cond >= 0) it.cond = Math.min(100, cond) / 100;
  if (typeof mag === 'number' && Number.isInteger(mag) && mag >= 0 && mag <= 999) it.mag = mag;
  // Only perishables track age; a few game years either way is plenty
  if (typeof rot === 'number' && Number.isFinite(rot) && Math.abs(rot) < 1e6 && SPOIL[def]) it.rot = rot / 10;
  return it;
}

export function containerWeight(c: LootContainer): number {
  let w = 0;
  for (const it of c.contents) w += stackWeight(it);
  return w;
}

const CELL = 128;

export class ContainerStore {
  /** Map containers by id (ids are the map's indexes, but don't rely on it). */
  private readonly spawns = new Map<number, ContainerSpawn>();
  private readonly live = new Map<number, LootContainer>();
  private readonly buckets = new Map<string, number[]>();
  private nextPile = PILE_ID_BASE;
  /** Containers whose contents differ from their seeded roll (resent to late joiners). */
  readonly dirty = new Set<number>();
  /** Changed since the last drain (host: goes in the next snapshot). */
  readonly changed = new Set<number>();
  private uidSeq = 0;
  private readonly capacities = new Map<number, number>();
  /**
   * Spoilage: the aging-clock reading for a place right now (spoilage.ts).
   * ZombieMode sets it from the world clock; until then nothing ages.
   */
  agingClock: (where: ContainerKind | 'bag') => number = () => 0;

  constructor(
    spawns: ContainerSpawn[],
    private readonly seed: number
  ) {
    for (const s of spawns) this.addSpawn(s);
  }

  /**
   * Another seeded container (vehicle trunks are added after the map's). Trunks
   * move, so they aren't in the position index: they're opened through their vehicle.
   */
  addSpawn(s: ContainerSpawn, capacity?: number) {
    this.spawns.set(s.id, s);
    if (capacity !== undefined) this.capacities.set(s.id, capacity);
    if (s.kind !== 'trunk') this.index(s.id, s.x, s.y, s.w, s.h);
  }

  /** Moves a trunk with its vehicle. */
  moveSpawn(id: number, x: number, y: number) {
    const s = this.spawns.get(id);
    if (!s) return;
    s.x = x;
    s.y = y;
    const live = this.live.get(id);
    if (live) {
      live.x = x;
      live.y = y;
    }
  }

  /** How much a container holds (kg): per-container override, else by kind. */
  capacityOf(c: Pick<LootContainer, 'id' | 'kind'>): number {
    return this.capacities.get(c.id) ?? CONTAINER_CAPACITY[c.kind];
  }

  get size(): number {
    return this.spawns.size;
  }

  private index(id: number, x: number, y: number, w: number, h: number) {
    for (let cy = Math.floor(y / CELL); cy <= Math.floor((y + h) / CELL); cy++) {
      for (let cx = Math.floor(x / CELL); cx <= Math.floor((x + w) / CELL); cx++) {
        const k = `${cx},${cy}`;
        const list = this.buckets.get(k);
        if (list) list.push(id);
        else this.buckets.set(k, [id]);
      }
    }
  }

  private unindex(id: number, x: number, y: number) {
    const list = this.buckets.get(`${Math.floor(x / CELL)},${Math.floor(y / CELL)}`);
    if (!list) return;
    const i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1);
  }

  private uid(prefix: string) {
    return `${prefix}~${this.uidSeq++}`;
  }

  /** A container by id, rolling a map container's seeded contents the first time it's needed. */
  get(id: number): LootContainer | null {
    const have = this.live.get(id);
    if (have) return have;
    const s = this.spawns.get(id);
    if (!s) return null;
    // Same roll on every client: seeded by (map seed, id), never by match time or difficulty
    const rng = mulberry32(this.seed ^ hash32(`container:${id}`));
    const contents = rng() < s.empty ? [] : rollLoot(s.table, s.rolls, 1, rng, `c${id}`);
    // Food was bought a while before it all started (a separate stream, so the rolls above never change)
    const ageRng = mulberry32(this.seed ^ hash32(`age:${id}`));
    for (const it of contents) {
      const spec = SPOIL[it.def];
      if (spec) it.rot = -ageRng() * START_AGE_MAX * spec.fresh;
    }
    const c: LootContainer = {
      id,
      kind: s.kind,
      poiId: s.owner,
      x: s.x,
      y: s.y,
      w: s.w,
      h: s.h,
      table: s.table,
      rolls: s.rolls,
      respawnSeconds: s.respawn,
      lootedAt: null,
      contents,
    };
    this.live.set(id, c);
    return c;
  }

  /** Every runtime pile (ground drops, bodies), for drawing. */
  piles(): LootContainer[] {
    const out: LootContainer[] = [];
    for (const c of this.live.values()) if (c.id >= PILE_ID_BASE) out.push(c);
    return out;
  }

  /** Distance from a point to a container (edge for furniture, centre for piles). */
  static distance(c: { x: number; y: number; w?: number; h?: number }, x: number, y: number): number {
    const w = c.w ?? 0;
    const h = c.h ?? 0;
    const dx = x < c.x ? c.x - x : x > c.x + w ? x - (c.x + w) : 0;
    const dy = y < c.y ? c.y - y : y > c.y + h ? y - (c.y + h) : 0;
    return Math.hypot(dx, dy);
  }

  /** The closest container within `reach` of (x, y). `accept` can veto (e.g. a wall in the way). */
  near(x: number, y: number, reach: number = CONTAINER_REACH, accept?: (c: { x: number; y: number; w?: number; h?: number }) => boolean): LootContainer | null {
    let bestId = -1;
    let bestD = reach;
    const cx = Math.floor(x / CELL);
    const cy = Math.floor(y / CELL);
    const seen = new Set<number>();
    for (let gy = cy - 1; gy <= cy + 1; gy++) {
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (const id of this.buckets.get(`${gx},${gy}`) ?? []) {
          if (seen.has(id)) continue;
          seen.add(id);
          const box = id >= PILE_ID_BASE ? this.live.get(id) : this.spawns.get(id);
          if (!box) continue;
          const d = ContainerStore.distance(box, x, y);
          if (d > bestD || (accept && !accept(box))) continue;
          bestD = d;
          bestId = id;
        }
      }
    }
    return bestId < 0 ? null : this.get(bestId);
  }

  private touch(c: LootContainer) {
    this.changed.add(c.id);
    this.dirty.add(c.id);
  }

  /**
   * Takes up to `qty` of `def` (preferring the stack at `index`). Stamps
   * `lootedAt` when the container empties. Returns what was taken, or null.
   */
  take(id: number, def: string, qty: number, now: number, index = -1): InventoryItem | null {
    const c = this.get(id);
    if (!c || qty < 1) return null;
    const i = index >= 0 && c.contents[index]?.def === def ? index : c.contents.findIndex((it) => it.def === def);
    if (i < 0) return null;
    const it = c.contents[i];
    const n = Math.min(Math.floor(qty), it.qty);
    if (n < 1) return null;
    const contents = c.contents.slice();
    if (n === it.qty) contents.splice(i, 1);
    else contents[i] = { ...it, qty: it.qty - n };
    c.contents = contents;
    if (!contents.length) c.lootedAt = now;
    this.touch(c);
    // Ground drops and bodies vanish once emptied; a built crate stays
    if (!contents.length && c.id >= PILE_ID_BASE && c.kind !== 'crate') this.removePile(c);
    // Into the bag: same age, on the bag's clock
    return rebase({ ...it, uid: this.uid('t'), qty: n }, this.agingClock(c.kind), this.agingClock('bag'));
  }

  /** Puts an item in, if the container has room. Plain stacks merge. */
  put(id: number, item: InventoryItem): boolean {
    const c = this.get(id);
    if (!c) return false;
    if (containerWeight(c) + stackWeight(item) > this.capacityOf(c) + 1e-9) return false;
    const contents = c.contents.slice();
    // Out of a bag: perishables move onto this container's aging clock
    const stored = rebase(item, this.agingClock('bag'), this.agingClock(c.kind));
    const plain = stored.cond === undefined && stored.mag === undefined && ITEM_DEFS[stored.def].maxStack > 1;
    const same = plain ? contents.findIndex((x) => sameBatch(x, stored) && x.cond === undefined && x.mag === undefined) : -1;
    if (same >= 0) contents[same] = { ...contents[same], qty: contents[same].qty + stored.qty };
    else contents.push({ ...stored, uid: this.uid('p') });
    c.contents = contents;
    c.lootedAt = null;
    this.touch(c);
    return true;
  }

  /** A new pile (host assigns the id; clients pass the one from the wire). */
  createPile(kind: 'ground' | 'corpse' | 'crate', x: number, y: number, items: InventoryItem[], id?: number): LootContainer {
    const pid = id ?? this.nextPile++;
    if (pid >= this.nextPile) this.nextPile = pid + 1;
    const c: LootContainer = {
      id: pid,
      kind,
      poiId: 'pile',
      x: Math.round(x),
      y: Math.round(y),
      w: 0,
      h: 0,
      table: '',
      rolls: 0,
      respawnSeconds: null,
      lootedAt: null,
      contents: items.map((it) => ({ ...it, uid: this.uid('g') })),
    };
    this.live.set(pid, c);
    this.index(pid, c.x, c.y, 0, 0);
    this.touch(c);
    return c;
  }

  /** The ground pile to drop onto at (x, y): an existing one nearby, or a new one. */
  groundPileAt(x: number, y: number): LootContainer {
    for (const c of this.piles()) {
      if (c.kind === 'ground' && Math.hypot(c.x - x, c.y - y) <= PILE_MERGE_RADIUS) return c;
    }
    return this.createPile('ground', x, y, []);
  }

  /** Takes a runtime pile away (a dismantled crate); returns what was inside. */
  removePileById(id: number): InventoryItem[] {
    const c = id >= PILE_ID_BASE ? this.live.get(id) : undefined;
    if (!c) return [];
    this.removePile(c);
    this.changed.add(id);
    this.dirty.add(id);
    return c.contents;
  }

  private removePile(c: LootContainer) {
    this.live.delete(c.id);
    this.unindex(c.id, c.x, c.y);
  }

  /** Host: restocks emptied shop containers whose timer has run out. Returns how many refilled. */
  restock(now: number, lootMul: number, rng: () => number): number {
    let n = 0;
    for (const c of this.live.values()) {
      if (c.respawnSeconds === null || c.lootedAt === null || c.contents.length) continue;
      if (now - c.lootedAt < c.respawnSeconds / Math.max(0.25, lootMul)) continue;
      c.contents = rollLoot(c.table, c.rolls, Math.max(0.25, lootMul), rng, `c${c.id}@${Math.floor(now)}`);
      const clock = this.agingClock(c.kind);
      for (const it of c.contents) {
        const spec = SPOIL[it.def];
        if (spec) it.rot = clock - rng() * START_AGE_MAX * spec.fresh;
      }
      c.lootedAt = null;
      this.touch(c);
      n++;
    }
    return n;
  }

  encode(id: number): ContainerRow | null {
    const c = this.live.get(id);
    if (!c) {
      // An emptied, removed pile: tell clients to drop it
      return id >= PILE_ID_BASE ? [id, []] : null;
    }
    const row: ContainerRow = [id, c.contents.map(encodeItem)];
    if (id >= PILE_ID_BASE) row.push(CONTAINER_KINDS.indexOf(c.kind), c.x, c.y);
    return row;
  }

  /** Client: the host's view of one container replaces ours. */
  apply(row: ContainerRow) {
    const [id, items, kindIdx, x, y] = row;
    if (!Array.isArray(items) || typeof id !== 'number') return;
    const contents = items.map((r, i) => decodeItem(r, `c${id}#${i}`)).filter((it): it is InventoryItem => !!it);
    if (id >= PILE_ID_BASE) {
      const existing = this.live.get(id);
      // A row without kind and contents means the pile is gone (crates stay when empty, so they always carry their kind)
      if (!contents.length && kindIdx === undefined) {
        if (existing) this.removePile(existing);
        return;
      }
      if (!existing) {
        const kind = CONTAINER_KINDS[kindIdx ?? -1];
        if ((kind !== 'ground' && kind !== 'corpse' && kind !== 'crate') || typeof x !== 'number' || typeof y !== 'number') return;
        this.createPile(kind, x, y, contents, id);
        this.changed.delete(id);
        this.dirty.delete(id);
      } else {
        existing.contents = contents;
      }
      return;
    }
    const c = this.get(id);
    if (c) c.contents = contents;
  }
}
