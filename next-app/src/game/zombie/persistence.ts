import type { ZombieSnapshot } from '@/lib/services/zombieSync';
import { isItemDefId } from './survival/inventory';
import type { InventoryItem } from './survival/types';

// ============================================================
// ZOMBIE MODE — SAVE FORMAT (pure)
// World save: everything the host would send a late joiner (a full
// snapshot: clock, every zombie, doors and windows, taken loot, changed
// containers, structures and their state, claims, changed vehicles,
// bodies) plus a little host-only bookkeeping. It's loaded by feeding the
// snapshot through the same code clients use, then adopting it.
// Player save: one survivor (character, body, skills, inventory, gear,
// weapons, position). Transient things (effects in flight, toasts,
// floaters, particles, sounds) are never saved.
//
// Saves are validated on load: anything malformed is rejected, and the
// world falls back to its other slot (two alternate, so an interrupted or
// corrupted save never loses more than one autosave).
// ============================================================

export const WORLD_SAVE_VERSION = 1;
export const PLAYER_SAVE_VERSION = 1;

/** How often the host saves the world / a player their survivor (real seconds). */
export const WORLD_AUTOSAVE_SECONDS = 60;
export const PLAYER_AUTOSAVE_SECONDS = 30;

export interface WorldSave {
  v: number;
  /** Real seconds the world has run (difficulty curve). */
  elapsed: number;
  /** Game-clock seconds added on top (sleep, time speed). */
  skip: number;
  /** A full snapshot (zombies, entrances, loot, containers, structures, vehicles, claims, bodies). */
  snap: ZombieSnapshot;
  /** Buildings whose alarm already went off (each only once). */
  alarms: string[];
  /** Epoch ms when saved. */
  at: number;
}

export interface PlayerSave {
  v: number;
  survivor: { name: string; occupation: string; traits: string[] };
  /** Feet position (world px). */
  pos: { x: number; y: number };
  vitals: unknown;
  condition: unknown;
  body: unknown;
  skills: unknown;
  booksRead: unknown;
  recipes: string[];
  bag: InventoryItem[];
  equipped: Record<string, InventoryItem>;
  weapons: { owned: string[]; current: string; durability: Record<string, number>; mags: Record<string, number>; reserve: Record<string, number> };
  at: number;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A world save, or null if it's malformed / from an unknown version. */
export function validateWorldSave(raw: unknown): WorldSave | null {
  if (!isObj(raw) || raw.v !== WORLD_SAVE_VERSION) return null;
  // `skip` can be negative: a world running slower than real time (rules.timeSpeed < 1)
  if (!isNum(raw.elapsed) || raw.elapsed < 0 || !isNum(raw.skip)) return null;
  const snap = raw.snap;
  if (!isObj(snap) || !Array.isArray(snap.z)) return null;
  // Every zombie row must be numbers (the snapshot decoder trusts its host)
  for (const row of snap.z as unknown[]) {
    if (!Array.isArray(row) || row.length < 8 || !row.every(isNum)) return null;
  }
  for (const k of ['d', 't', 'c', 'cs', 'bs', 'sh', 'vh']) {
    if (snap[k] !== undefined && !Array.isArray(snap[k])) return null;
  }
  const alarms = Array.isArray(raw.alarms) ? raw.alarms.filter((a): a is string => typeof a === 'string') : [];
  return { v: WORLD_SAVE_VERSION, elapsed: raw.elapsed, skip: raw.skip, snap: snap as unknown as ZombieSnapshot, alarms, at: isNum(raw.at) ? raw.at : 0 };
}

function validItem(it: unknown): it is InventoryItem {
  if (!isObj(it) || typeof it.uid !== 'string' || !isItemDefId(it.def) || !isNum(it.qty) || it.qty < 1 || it.qty > 9999) return false;
  if (it.cond !== undefined && (!isNum(it.cond) || it.cond < 0 || it.cond > 1)) return false;
  if (it.mag !== undefined && (!isNum(it.mag) || it.mag < 0)) return false;
  if (it.rot !== undefined && !isNum(it.rot)) return false;
  return true;
}

const numRecord = (v: unknown): Record<string, number> => {
  if (!isObj(v)) return {};
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(v)) if (isNum(n) && n >= 0) out[k] = n;
  return out;
};

/** A survivor save, or null. Invalid items are dropped rather than failing the whole save. */
export function validatePlayerSave(raw: unknown): PlayerSave | null {
  if (!isObj(raw) || raw.v !== PLAYER_SAVE_VERSION) return null;
  const s = raw.survivor;
  if (!isObj(s) || typeof s.name !== 'string' || typeof s.occupation !== 'string' || !Array.isArray(s.traits)) return null;
  const pos = raw.pos;
  if (!isObj(pos) || !isNum(pos.x) || !isNum(pos.y)) return null;
  if (!isObj(raw.vitals) || !isNum((raw.vitals as Record<string, unknown>).health)) return null;
  if (!isObj(raw.condition) || !isObj(raw.body) || !isObj(raw.skills)) return null;
  const w = isObj(raw.weapons) ? raw.weapons : {};
  const bag = Array.isArray(raw.bag) ? raw.bag.filter(validItem) : [];
  const equipped: Record<string, InventoryItem> = {};
  if (isObj(raw.equipped)) for (const [slot, it] of Object.entries(raw.equipped)) if (validItem(it)) equipped[slot] = it;
  return {
    v: PLAYER_SAVE_VERSION,
    survivor: { name: s.name.slice(0, 24), occupation: s.occupation, traits: s.traits.filter((t): t is string => typeof t === 'string') },
    pos: { x: pos.x, y: pos.y },
    vitals: raw.vitals,
    condition: raw.condition,
    body: raw.body,
    skills: raw.skills,
    booksRead: isObj(raw.booksRead) ? raw.booksRead : {},
    recipes: Array.isArray(raw.recipes) ? raw.recipes.filter((r): r is string => typeof r === 'string') : [],
    bag,
    equipped,
    weapons: {
      owned: Array.isArray(w.owned) ? w.owned.filter((x): x is string => typeof x === 'string') : ['fists', 'axe'],
      current: typeof w.current === 'string' ? w.current : 'axe',
      durability: numRecord(w.durability),
      mags: numRecord(w.mags),
      reserve: numRecord(w.reserve),
    },
    at: isNum(raw.at) ? raw.at : 0,
  };
}

export interface SlotRow {
  slot: number;
  seq: number;
  state: unknown;
}

/**
 * The newest slot that validates (an interrupted or corrupted save falls
 * back to the other one), and the seq to write next.
 */
export function pickWorldSave(rows: SlotRow[]): { save: WorldSave | null; nextSeq: number } {
  const sorted = [...rows].sort((a, b) => b.seq - a.seq);
  const nextSeq = (sorted[0]?.seq ?? -1) + 1;
  for (const r of sorted) {
    const save = validateWorldSave(r.state);
    if (save) return { save, nextSeq };
  }
  return { save: null, nextSeq };
}

/** Which slot a save with this seq goes to (they alternate). */
export function slotFor(seq: number): 0 | 1 {
  return (seq % 2) as 0 | 1;
}
