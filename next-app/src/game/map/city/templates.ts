// ============================================================
// ZOMBIE CITY — BUILDING & ROOM TEMPLATES
// Pure data: colours, floor-count ranges, room programmes and the
// furniture each room kind can hold. The generator (lots.ts) reads these.
// ============================================================

import type { FurnitureType } from '../../entities/furniture';
import type { IconName } from '@/lib/icons';

export type CityDistrict = 'downtown' | 'commercial' | 'residential' | 'park' | 'landmark';

export type BuildingKind =
  | 'house'
  | 'shop'
  | 'grocery'
  | 'convenience'
  | 'pharmacy'
  | 'office'
  | 'apartment'
  | 'police'
  | 'hospital'
  | 'gasStation';

/** Ground-layer tile kinds (one byte per tile in `CityPlan.ground`). */
export const GROUND = {
  GRASS: 0,
  ASPHALT: 1,
  SIDEWALK: 2,
  ALLEY: 3,
  PLAZA: 4,
  PARKING: 5,
  DIRT: 6,
  FLOOR_WOOD: 10,
  FLOOR_TILE: 11,
  FLOOR_CONCRETE: 12,
  FLOOR_CARPET: 13,
  FLOOR_LINO: 14,
} as const;
export type GroundKind = (typeof GROUND)[keyof typeof GROUND];

/** Indoor furniture drawn by the city renderer (colliders are tile-aligned rects). */
export type CityFurnitureKind =
  | 'bed'
  | 'sofa'
  | 'table'
  | 'desk'
  | 'counter'
  | 'shelf'
  | 'fridge'
  | 'stove'
  | 'locker'
  | 'hospitalBed'
  | 'cabinet'
  | 'toilet'
  | 'checkout'
  | 'cell';

/** Outdoor props. Existing `FurnitureType` names where they fit, plus city-only ones. */
export type CityPropType = FurnitureType | 'car' | 'dumpster' | 'fuelPump' | 'trashCan';

export type RoomKind =
  | 'living'
  | 'kitchen'
  | 'bedroom'
  | 'bath'
  | 'salesFloor'
  | 'convenienceFloor'
  | 'storage'
  | 'office'
  | 'lobby'
  | 'ward'
  | 'cells'
  | 'breakRoom';

export interface FurnitureSpec {
  kind: CityFurnitureKind;
  /** Size in tiles (canonical orientation; the placer may rotate 90°). */
  w: number;
  h: number;
}

export const ROOM_TEMPLATES: Record<RoomKind, FurnitureSpec[]> = {
  living: [
    { kind: 'sofa', w: 3, h: 1 },
    { kind: 'table', w: 2, h: 1 },
    { kind: 'shelf', w: 2, h: 1 },
  ],
  kitchen: [
    { kind: 'counter', w: 3, h: 1 },
    { kind: 'fridge', w: 1, h: 1 },
    { kind: 'stove', w: 1, h: 1 },
    { kind: 'table', w: 2, h: 2 },
  ],
  bedroom: [
    { kind: 'bed', w: 2, h: 3 },
    { kind: 'cabinet', w: 2, h: 1 },
  ],
  bath: [{ kind: 'toilet', w: 1, h: 1 }, { kind: 'cabinet', w: 1, h: 1 }],
  salesFloor: [
    { kind: 'checkout', w: 3, h: 1 },
    { kind: 'shelf', w: 4, h: 1 },
    { kind: 'shelf', w: 4, h: 1 },
    { kind: 'fridge', w: 2, h: 1 },
  ],
  // Corner shop: till by the door, snack aisles, a wall of drinks fridges
  convenienceFloor: [
    { kind: 'checkout', w: 3, h: 1 },
    { kind: 'fridge', w: 3, h: 1 },
    { kind: 'shelf', w: 3, h: 1 },
    { kind: 'shelf', w: 3, h: 1 },
    { kind: 'fridge', w: 2, h: 1 },
    { kind: 'shelf', w: 3, h: 1 },
  ],
  storage: [
    { kind: 'shelf', w: 3, h: 1 },
    { kind: 'shelf', w: 1, h: 3 },
    { kind: 'cabinet', w: 2, h: 1 },
  ],
  office: [
    { kind: 'desk', w: 2, h: 1 },
    { kind: 'desk', w: 2, h: 1 },
    { kind: 'cabinet', w: 1, h: 1 },
    { kind: 'shelf', w: 2, h: 1 },
  ],
  lobby: [
    { kind: 'counter', w: 4, h: 1 },
    { kind: 'sofa', w: 3, h: 1 },
  ],
  ward: [
    { kind: 'hospitalBed', w: 1, h: 2 },
    { kind: 'hospitalBed', w: 1, h: 2 },
    { kind: 'hospitalBed', w: 1, h: 2 },
    { kind: 'cabinet', w: 1, h: 1 },
  ],
  cells: [
    { kind: 'cell', w: 3, h: 2 },
    { kind: 'cell', w: 3, h: 2 },
    { kind: 'locker', w: 2, h: 1 },
  ],
  breakRoom: [
    { kind: 'table', w: 2, h: 2 },
    { kind: 'fridge', w: 1, h: 1 },
    { kind: 'counter', w: 2, h: 1 },
  ],
};

export interface BuildingTemplate {
  kind: BuildingKind;
  names: string[];
  icon: IconName;
  /** Exterior wall / brand colour (used for the map marker too). */
  color: string;
  /** Darker wall face colour (south-facing side of walls). */
  wallFace: string;
  roof: string;
  floor: GroundKind;
  /** Inclusive [min, max] number of floors (ground floor counts). */
  floors: [number, number];
  /** Room programme for the ground floor (rooms beyond the list reuse the last one). */
  groundRooms: RoomKind[];
  upperRooms: RoomKind[];
  /** Chance the front door starts `locked`. */
  lockChance: number;
  /** Inclusive [min, max] tile spacing between windows. */
  windowStep: [number, number];
  /**
   * Storefront sign colour: stores get a roof-edge sign (icon + name) on the
   * street side so they're easy to spot. Omitted = no sign.
   */
  sign?: string;
  /** Distinct looks for one kind (each its own name, icon and colours). */
  variants?: StoreVariant[];
}

export interface StoreVariant {
  name: string;
  icon: IconName;
  color: string;
  wallFace: string;
  sign: string;
}

export const BUILDING_TEMPLATES: Record<BuildingKind, BuildingTemplate> = {
  house: {
    kind: 'house',
    names: ['Maple House', 'Birch House', 'Cedar House', 'Willow House', 'Oak House', 'Elm House', 'Aspen House', 'Pine House'],
    icon: 'house',
    color: '#C9A27A',
    wallFace: '#8C6A4A',
    roof: '#7A4B3A',
    floor: GROUND.FLOOR_WOOD,
    floors: [1, 2],
    groundRooms: ['living', 'kitchen', 'bath'],
    upperRooms: ['bedroom', 'bedroom', 'bath'],
    lockChance: 0.35,
    windowStep: [3, 5],
  },
  shop: {
    kind: 'shop',
    names: ['Hardware Shop', 'Book Nook', 'Thrift Shop', 'Electronics', 'Sports Outlet', 'Diner', 'Laundromat'],
    icon: 'shoppingBag',
    sign: '#475569',
    variants: [
      { name: 'Hardware Shop', icon: 'hammer', color: '#C9B48A', wallFace: '#8A7650', sign: '#B45309' },
      { name: 'Book Nook', icon: 'book', color: '#C7A6C9', wallFace: '#87648A', sign: '#7E22CE' },
      { name: 'Thrift Shop', icon: 'shirt', color: '#B9C9A6', wallFace: '#76885F', sign: '#4D7C0F' },
      { name: 'Electronics', icon: 'tv', color: '#A9BFD6', wallFace: '#647D97', sign: '#1D4ED8' },
      { name: 'Sports Outlet', icon: 'trophy', color: '#D6B0A9', wallFace: '#966B63', sign: '#B91C1C' },
      { name: 'Diner', icon: 'diner', color: '#E3C38F', wallFace: '#A1814C', sign: '#C2410C' },
      { name: 'Laundromat', icon: 'laundry', color: '#B6D6D9', wallFace: '#6F9497', sign: '#0E7490' },
    ],
    color: '#B8C4CC',
    wallFace: '#77848C',
    roof: '#5E666B',
    floor: GROUND.FLOOR_LINO,
    floors: [1, 2],
    groundRooms: ['salesFloor', 'storage'],
    upperRooms: ['storage', 'office'],
    lockChance: 0.15,
    windowStep: [3, 4],
  },
  grocery: {
    kind: 'grocery',
    names: ['FreshMart Grocery', 'Greenleaf Grocery', 'Harvest Foods', 'Valley Market'],
    icon: 'shoppingCart',
    sign: '#15803D',
    color: '#9FC79A',
    wallFace: '#5F8A5A',
    roof: '#4E5A52',
    floor: GROUND.FLOOR_TILE,
    floors: [1, 1],
    groundRooms: ['salesFloor', 'storage', 'breakRoom'],
    upperRooms: ['storage'],
    lockChance: 0.1,
    windowStep: [3, 4],
  },
  convenience: {
    kind: 'convenience',
    names: ['QuickStop 24/7', 'Night Owl Mart', 'Handy Mart', 'Stop & Go', 'Sunrise Mart', 'Lucky Mart', 'Pit Stop Mart', 'Corner Mart'],
    icon: 'store',
    color: '#F3DFA2',
    wallFace: '#B4923F',
    roof: '#2F7D3B',
    floor: GROUND.FLOOR_LINO,
    floors: [1, 1],
    groundRooms: ['convenienceFloor', 'storage'],
    upperRooms: ['storage'],
    lockChance: 0.05,
    windowStep: [2, 3],
    sign: '#DC2626',
  },
  pharmacy: {
    kind: 'pharmacy',
    names: ['Cross Pharmacy', 'Wellness Drugstore', 'Mercy Drugs'],
    icon: 'pharmacy',
    sign: '#0F766E',
    color: '#D7E3EE',
    wallFace: '#8FA3B5',
    roof: '#5C6670',
    floor: GROUND.FLOOR_TILE,
    floors: [1, 2],
    groundRooms: ['salesFloor', 'storage'],
    upperRooms: ['office', 'storage'],
    lockChance: 0.1,
    windowStep: [3, 4],
  },
  office: {
    kind: 'office',
    names: ['Meridian Tower', 'Halcyon Offices', 'Granite Plaza', 'Summit Building', 'Atlas House', 'Beacon Center'],
    icon: 'office',
    color: '#9AA6B8',
    wallFace: '#5E6A7C',
    roof: '#4A5058',
    floor: GROUND.FLOOR_CARPET,
    floors: [3, 4],
    groundRooms: ['lobby', 'office', 'breakRoom'],
    upperRooms: ['office', 'office', 'breakRoom'],
    lockChance: 0.2,
    windowStep: [3, 3],
  },
  apartment: {
    kind: 'apartment',
    names: ['Riverside Apartments', 'Parkview Flats', 'Linden Court', 'Harbor Lofts', 'Union Residences'],
    icon: 'building',
    color: '#C08A6E',
    wallFace: '#7E5240',
    roof: '#4F4A48',
    floor: GROUND.FLOOR_WOOD,
    floors: [3, 4],
    groundRooms: ['lobby', 'living', 'kitchen'],
    upperRooms: ['living', 'bedroom', 'kitchen'],
    lockChance: 0.25,
    windowStep: [3, 4],
  },
  police: {
    kind: 'police',
    names: ['Police Station'],
    icon: 'police',
    sign: '#1E3A8A',
    color: '#7D93B8',
    wallFace: '#47597A',
    roof: '#3C4452',
    floor: GROUND.FLOOR_LINO,
    floors: [2, 2],
    groundRooms: ['lobby', 'cells', 'office', 'storage'],
    upperRooms: ['office', 'breakRoom', 'storage'],
    lockChance: 0,
    windowStep: [4, 5],
  },
  hospital: {
    kind: 'hospital',
    names: ['St. Mercy Hospital'],
    icon: 'hospital',
    sign: '#B91C1C',
    color: '#E6E9EC',
    wallFace: '#9EA6AE',
    roof: '#6A7076',
    floor: GROUND.FLOOR_TILE,
    floors: [3, 3],
    groundRooms: ['lobby', 'ward', 'storage', 'office'],
    upperRooms: ['ward', 'ward', 'office'],
    lockChance: 0,
    windowStep: [3, 4],
  },
  gasStation: {
    kind: 'gasStation',
    names: ['Fuel Stop'],
    icon: 'fuel',
    sign: '#C0392B',
    color: '#E0B04A',
    wallFace: '#9A7428',
    roof: '#C0392B',
    floor: GROUND.FLOOR_LINO,
    floors: [1, 1],
    groundRooms: ['salesFloor', 'storage'],
    upperRooms: ['storage'],
    lockChance: 0,
    windowStep: [3, 3],
  },
};

/** Weighted building kinds per district (ignored for landmarks/park). */
export const DISTRICT_KINDS: Record<CityDistrict, { kind: BuildingKind; weight: number }[]> = {
  downtown: [
    { kind: 'office', weight: 3 },
    { kind: 'apartment', weight: 2 },
  ],
  commercial: [
    { kind: 'shop', weight: 12 },
    { kind: 'convenience', weight: 2 },
    { kind: 'grocery', weight: 1 },
    { kind: 'pharmacy', weight: 1 },
  ],
  residential: [{ kind: 'house', weight: 1 }],
  park: [],
  landmark: [],
};

export const DISTRICT_NAMES: Record<CityDistrict, string> = {
  downtown: 'Downtown',
  commercial: 'Market Street',
  residential: 'Suburbs',
  park: 'Central Park',
  landmark: 'Civic Block',
};

export const DISTRICT_COLORS: Record<CityDistrict, string> = {
  downtown: '#5E6A7C',
  commercial: '#D9822B',
  residential: '#6AA84F',
  park: '#2E8B57',
  landmark: '#3D5A99',
};
