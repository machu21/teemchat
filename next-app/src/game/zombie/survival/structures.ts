import { TILE_ENTRANCE, TILE_SOLID, inBounds, type TileGrid } from '../grid';
import type { Entrance } from '../entrances';
import type { ItemDefId } from './types';
import type { IconName } from '@/lib/icons';

// ============================================================
// ZOMBIE MODE — BUILDABLE STRUCTURES (pure)
// Walls, fences and doors are entrances of kind wall / fence / door with
// `built` set: they block movement (walls also sight), zombies route to
// them and batter them down like any door, and their health syncs with
// the existing entrance rows. Crates (storage) and workbenches (faster
// crafting, needed for metalwork) are plain solid tiles.
// ============================================================

export type StructureKind =
  | 'wood_wall'
  | 'metal_wall'
  | 'fence'
  | 'wood_door'
  | 'crate'
  | 'workbench'
  | 'generator'
  | 'rain_collector'
  | 'campfire'
  | 'farm_plot'
  | 'snare_trap';

/** Wire order. Append only. */
export const STRUCTURE_KINDS: readonly StructureKind[] = [
  'wood_wall',
  'metal_wall',
  'fence',
  'wood_door',
  'crate',
  'workbench',
  'generator',
  'rain_collector',
  'campfire',
  'farm_plot',
  'snare_trap',
];

export interface StructureSpec {
  label: string;
  icon: IconName;
  /** How it lives on the grid: a damageable entrance, a solid tile, or flat on the floor (walkable). */
  as: 'entrance' | 'solid' | 'floor';
  /** Must go on grass or dirt outdoors (farm plots, traps). */
  soil?: boolean;
  entranceKind?: 'wall' | 'fence' | 'door';
  material: 'wood' | 'metal';
  /** Hit points (entrances only; zombies do ~15 per blow). */
  hp: number;
  /** Seconds of work to put it up (before skill). */
  seconds: number;
  /** Tools for taking it down (any one of each group), and what you get back. */
  dismantle: { tools: ItemDefId[][]; returns: { def: ItemDefId; qty: number }[] };
}

export const STRUCTURES: Record<StructureKind, StructureSpec> = {
  wood_wall: {
    label: 'Wooden Wall',
    icon: 'wall',
    as: 'entrance',
    entranceKind: 'wall',
    material: 'wood',
    hp: 150,
    seconds: 5,
    dismantle: { tools: [['weapon:hammer', 'weapon:crowbar']], returns: [{ def: 'planks', qty: 2 }, { def: 'nails', qty: 3 }] },
  },
  metal_wall: {
    label: 'Metal Wall',
    icon: 'shield',
    as: 'entrance',
    entranceKind: 'wall',
    material: 'metal',
    hp: 400,
    seconds: 7,
    dismantle: { tools: [['blowtorch']], returns: [{ def: 'metal_sheet', qty: 1 }, { def: 'scrap_metal', qty: 1 }] },
  },
  fence: {
    label: 'Fence',
    icon: 'fence',
    as: 'entrance',
    entranceKind: 'fence',
    material: 'wood',
    hp: 60,
    seconds: 3,
    dismantle: { tools: [['weapon:hammer', 'weapon:crowbar']], returns: [{ def: 'planks', qty: 1 }, { def: 'nails', qty: 2 }] },
  },
  wood_door: {
    label: 'Wooden Door',
    icon: 'door',
    as: 'entrance',
    entranceKind: 'door',
    material: 'wood',
    hp: 100,
    seconds: 6,
    dismantle: { tools: [['weapon:hammer', 'weapon:crowbar']], returns: [{ def: 'planks', qty: 2 }, { def: 'nails', qty: 4 }] },
  },
  crate: {
    label: 'Wooden Crate',
    icon: 'package',
    as: 'solid',
    material: 'wood',
    hp: 0,
    seconds: 4,
    dismantle: { tools: [['weapon:hammer', 'weapon:crowbar']], returns: [{ def: 'planks', qty: 1 }, { def: 'nails', qty: 2 }] },
  },
  workbench: {
    label: 'Workbench',
    icon: 'hammer',
    as: 'solid',
    material: 'wood',
    hp: 0,
    seconds: 6,
    dismantle: { tools: [['weapon:hammer', 'weapon:crowbar']], returns: [{ def: 'planks', qty: 3 }, { def: 'nails', qty: 4 }] },
  },
  // Utilities (survival/utilities.ts): state synced with the structure list
  generator: {
    label: 'Generator',
    icon: 'generator',
    as: 'solid',
    material: 'metal',
    hp: 0,
    seconds: 4,
    // Packed up again, fuel and all wear lost
    dismantle: { tools: [['screwdriver', 'wrench']], returns: [{ def: 'generator', qty: 1 }] },
  },
  rain_collector: {
    label: 'Rain Collector',
    icon: 'barrel',
    as: 'solid',
    material: 'wood',
    hp: 0,
    seconds: 6,
    dismantle: { tools: [['weapon:hammer', 'weapon:crowbar']], returns: [{ def: 'planks', qty: 2 }, { def: 'rags', qty: 2 }] },
  },
  campfire: {
    label: 'Campfire',
    icon: 'campfire',
    as: 'solid',
    material: 'wood',
    hp: 0,
    seconds: 3,
    // Kicked apart: nothing worth keeping
    dismantle: { tools: [], returns: [] },
  },
  farm_plot: {
    label: 'Farm Plot',
    icon: 'sprout',
    as: 'floor',
    soil: true,
    material: 'wood',
    hp: 0,
    seconds: 5,
    // Filled back in (whatever was growing is lost)
    dismantle: { tools: [['shovel']], returns: [] },
  },
  snare_trap: {
    label: 'Snare Trap',
    icon: 'rabbit',
    as: 'floor',
    soil: true,
    material: 'wood',
    hp: 0,
    seconds: 3,
    dismantle: { tools: [], returns: [{ def: 'branch', qty: 1 }] },
  },
};

/** px from the feet to a tile's centre to build on it. */
export const BUILD_REACH = 30;
/** Crafting at a workbench within this many px is faster (and metalwork needs one). */
export const WORKBENCH_REACH = 40;

/** The entrance a built wall / fence / door is on the grid. */
export function builtEntrance(kind: StructureKind, col: number, row: number): Entrance {
  const s = STRUCTURES[kind];
  return {
    id: `built:${col},${row}`,
    kind: s.entranceKind ?? 'wall',
    col,
    row,
    state: 'closed',
    planks: 0,
    hp: s.hp,
    built: kind,
  };
}

export type PlaceBlock = 'outOfMap' | 'solid' | 'occupied' | 'stairs' | 'tooFar' | 'safehouse' | 'notSoil';

export const PLACE_BLOCK_TEXT: Record<PlaceBlock, string> = {
  outOfMap: 'You can only build inside the map',
  solid: "There's something in the way",
  occupied: 'Someone is standing there',
  stairs: "You can't build on the stairs",
  tooFar: 'Too far away',
  safehouse: "That's someone else's safehouse",
  notSoil: 'Needs grass or dirt, outdoors',
};

/**
 * Whether a structure can go on this tile. A broken built structure's tile
 * counts as free (you build over the rubble); a map door or window never does.
 * `occupants` are feet points of players and zombies.
 */
export function placeBlock(grid: TileGrid, col: number, row: number, occupants: { x: number; y: number }[]): PlaceBlock | null {
  if (!inBounds(grid, col, row)) return 'outOfMap';
  const i = row * grid.cols + col;
  const f = grid.flags[i];
  if (f & TILE_ENTRANCE) {
    const e = grid.entrances.get(i);
    if (!e || !e.built || e.state !== 'broken') return 'solid';
  } else if (f & TILE_SOLID) {
    return 'solid';
  }
  if (grid.portalOut.has(i) || grid.portalIn.has(i)) return 'stairs';
  const ts = grid.tileSize;
  const x0 = col * ts;
  const y0 = row * ts;
  if (occupants.some((p) => p.x >= x0 - 4 && p.x <= x0 + ts + 4 && p.y >= y0 - 4 && p.y <= y0 + ts + 4)) return 'occupied';
  return null;
}
