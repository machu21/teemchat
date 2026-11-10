// ============================================================
// ZOMBIE CITY — PLAN DATA TYPES
// Plain, serialisable data produced by generateCity(). All world values are
// in world px unless the field name says "tile"/"col"/"row".
// ============================================================

import type { Rect } from '../../collision';
import type { Entrance } from '../../zombie/entrances';
import type {
  BuildingKind,
  CityDistrict,
  CityFurnitureKind,
  CityPropType,
  GroundKind,
  RoomKind,
} from './templates';
import type { TileRect } from './layout';
import type { IconName } from '@/lib/icons';

/** Per-tile codes inside `CityFloor.tiles`. */
export const FT = {
  FLOOR: 0,
  WALL: 1,
  DOOR: 2,
  WINDOW: 3,
  STAIR_UP: 4,
  STAIR_DOWN: 5,
} as const;
export type FloorTile = (typeof FT)[keyof typeof FT];

export interface CityStairLink {
  /** Trigger rect (world px) on this floor. */
  rect: Rect;
  /** Destination floor index in `CityBuilding.floors`. */
  toFloor: number;
  /** Top-left (world px) of the arrival tile on the destination floor, outside its triggers. */
  arrival: { x: number; y: number };
}

export interface CityFurniture {
  kind: CityFurnitureKind;
  /** Collider and draw box (world px, tile-aligned). */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CityRoom {
  kind: RoomKind;
  rect: Rect;
}

export interface CityFloor {
  index: number;
  /** '1F', '2F', ... */
  label: string;
  /** World px. Floor 0 = the ground footprint; upper floors live in the band below the city. */
  bounds: Rect;
  cols: number;
  rows: number;
  /** cols × rows tile codes (`FT`), row-major, already in world orientation. */
  tiles: Uint8Array;
  /** Shell + partition colliders (world px). Floor 0 leaves door/window gaps; upper floors are sealed. */
  walls: Rect[];
  furniture: CityFurniture[];
  rooms: CityRoom[];
  up?: CityStairLink;
  down?: CityStairLink;
}

export interface CityBuilding {
  id: string;
  /** Position in `CityPlan.buildings` (wallOwner stores index + 1). */
  index: number;
  kind: BuildingKind;
  district: CityDistrict;
  blockId: string;
  lotId: string;
  name: string;
  icon: IconName;
  color: string;
  wallFace: string;
  roofColor: string;
  floorKind: GroundKind;
  /** Storefront sign drawn on the roof's street edge (stores and landmarks). */
  sign?: { text: string; icon: IconName; color: string };
  /** Ground footprint (world px, tile-aligned) — also the roof draw area. */
  footprint: Rect;
  /** Which street the front door faces. */
  facing: 'n' | 's';
  /** The door tile (world px). */
  frontDoor: Rect;
  frontDoorEntranceId: string;
  /** Player top-left just inside / just outside the front door (world px). */
  insideSpawn: { x: number; y: number };
  outsideSpawn: { x: number; y: number };
  /** Ground-floor stairwell (world px), when the building has upper floors. */
  stairwell?: Rect;
  floors: CityFloor[];
}

export interface CityProp {
  type: CityPropType;
  /** Sprite top-left (world px). For existing FurnitureType props this matches FurnitureEntity. */
  x: number;
  y: number;
  /** Colour variant (cars) — 6 = police, 7 = ambulance. */
  variant?: number;
  /** Cars: 'h' parked along an E-W street, 'v' along a N-S avenue. */
  dir?: 'h' | 'v';
}

export interface CityZone {
  id: string;
  name: string;
  tag: string;
  district: CityDistrict;
  color: string;
  rect: Rect;
}

export interface CityRoadInfo {
  dir: 'h' | 'v';
  name: string;
  rect: Rect;
}

export interface CityPlan {
  seed: number;
  size: { w: number; h: number };
  tile: number;
  cols: number;
  rows: number;
  /** cols × rows `GROUND` kinds (ground layer under everything). */
  ground: Uint8Array;
  /** cols × rows lane-marking bit flags (`MARK`). */
  marks: Uint8Array;
  /** cols × rows wall owner: 0 none, >0 building index + 1, -1 fence, -2 city border. */
  wallOwner: Int16Array;
  roads: CityRoadInfo[];
  /** All ground-level colliders: border + fences + building shells/partitions (gaps at entrances). */
  walls: Rect[];
  /** Residential yard fences (also included in `walls`). */
  fences: Rect[];
  /** Ground-floor doors and windows. */
  entrances: Entrance[];
  buildings: CityBuilding[];
  props: CityProp[];
  zones: CityZone[];
  defaultSpawn: { x: number; y: number };
  /** Top of the band that hosts upper floors (world px). */
  upperBandY: number;
  /** Bottom edge of the packed upper floors (world px). */
  upperBandBottom: number;
}

/** Lane-marking flags in `CityPlan.marks`. */
export const MARK = {
  /** Dashed centre line on this tile's bottom edge (E-W street). */
  DASH_H: 1,
  /** Dashed centre line on this tile's right edge (N-S avenue). */
  DASH_V: 2,
  /** Zebra crossing across an E-W street. */
  ZEBRA_H: 4,
  /** Zebra crossing across a N-S avenue. */
  ZEBRA_V: 8,
} as const;

export type { TileRect };
