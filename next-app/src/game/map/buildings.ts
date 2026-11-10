import { Rect, MAP_HEIGHT } from '../collision';
import {
  COTTAGE_W,
  COTTAGE_H,
  COTTAGE_STAIRS,
  COTTAGE_ARRIVAL_FEET,
  COTTAGE_GROUND_COLLIDERS,
  COTTAGE_UPPER_COLLIDERS,
  drawCottageUpper,
} from './interiors/cottage';
import {
  TOWNHALL_W,
  TOWNHALL_H,
  TOWNHALL_STAIRS,
  TOWNHALL_ARRIVAL_FEET,
  TOWNHALL_GROUND_COLLIDERS,
  TOWNHALL_UPPER_COLLIDERS,
  drawTownHallUpper,
} from './interiors/townhall';
import type { IconName } from '@/lib/icons';

// ============================================================
// ENTERABLE BUILDINGS (indoor / outdoor transitions)
// - Ground floors are in-place interiors sharing the outdoor coordinate space;
//   the roof layer is pre-rendered per building and lifted off on entry
// - Upper floors live in a coordinate band below the outdoor map
//   (y >= UPPER_LEVEL_Y), so presence, proximity voice and position
//   persistence keep working with no protocol change: a player is "upstairs"
//   purely by their coordinates
// - Pure helpers below are engine-agnostic so they can be unit-tested
// ============================================================

/** Top of the off-map band that hosts upper floors (well clear of the outdoor map). */
export const UPPER_LEVEL_Y = MAP_HEIGHT + 320;

export interface StairLink {
  /** Trigger area in world coords; walking onto it changes floor. */
  rect: Rect;
  /** Destination floor: an upper level id, or null for the ground floor. */
  toLevelId: string | null;
  /** Player top-left position on the destination floor (outside its stairs trigger). */
  arrival: { x: number; y: number };
}

export interface UpperLevel {
  id: string;
  label: string;
  /** World-space rect of this floor inside the upper-level band. */
  bounds: Rect;
  /** Outer walls + furniture colliders in world coords. */
  walls: Rect[];
  /** Stairs down to the floor below (ground floor when this is the lowest level). */
  stairs: StairLink;
  /** Stairs up to the next level, for buildings taller than two storeys. */
  stairsUp?: StairLink;
  /** Draws the floor in internal 8px-grid space (ctx pre-scaled 2x, origin at bounds top-left). */
  render: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
}

export interface DoorDefinition {
  /** Trigger area in world coords (the open doorway tiles). */
  rect: Rect;
  /** Player top-left position just inside the door (auto-walk target on Enter). */
  insideSpawn: { x: number; y: number };
  /** Player top-left position just outside the door (auto-walk target on Exit). */
  outsideSpawn: { x: number; y: number };
}

export interface BuildingDefinition {
  id: string;
  name: string;
  icon: IconName;
  color: string;
  /** Full building footprint in world coords; also the roof's draw area. */
  footprint: Rect;
  door: DoorDefinition;
  /**
   * Draws the roof in the map's internal 8px-grid space (ctx is pre-scaled 2x),
   * with the origin translated to the footprint's top-left corner.
   */
  renderRoof: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  /** Floor label for the ground floor, e.g. '1F'. */
  groundLabel?: string;
  /** Furniture colliders on the ground floor (world coords). */
  groundWalls?: Rect[];
  /** Stairs on the ground floor leading up. */
  groundStairs?: StairLink;
  /** Upper floors, lowest first. */
  levels?: UpperLevel[];
}

export interface FloorEntry {
  levelId: string | null;
  label: string;
}

/** Floors of a building ordered top → bottom, as the floor selector lists them. */
export function getFloors(b: BuildingDefinition): FloorEntry[] {
  const upper = (b.levels ?? []).map((l) => ({ levelId: l.id as string | null, label: l.label }));
  return [...upper.reverse(), { levelId: null, label: b.groundLabel ?? '1F' }];
}

/** The upper level (and its building) containing a point, if any. */
export function findLevelAt(
  buildings: BuildingDefinition[],
  x: number,
  y: number
): { building: BuildingDefinition; level: UpperLevel } | null {
  // Bounds-only test: each map places its own upper-floor band (below its own height)
  for (const building of buildings) {
    for (const level of building.levels ?? []) {
      if (containsPoint(level.bounds, x, y, EXIT_HYSTERESIS)) return { building, level };
    }
  }
  return null;
}

/** Every stairs trigger in a building: ground → 2F, each floor's way down, and each floor's way up. */
export function getStairLinks(building: BuildingDefinition): StairLink[] {
  const links: StairLink[] = [];
  if (building.groundStairs) links.push(building.groundStairs);
  for (const l of building.levels ?? []) {
    links.push(l.stairs);
    if (l.stairsUp) links.push(l.stairsUp);
  }
  return links;
}

/** Floor index of a level id within a building: 0 = ground, 1 = first upper level, … (-1 if unknown). */
export function floorIndex(building: BuildingDefinition, levelId: string | null): number {
  if (levelId === null) return 0;
  const i = (building.levels ?? []).findIndex((l) => l.id === levelId);
  return i < 0 ? -1 : i + 1;
}

/** Stairs trigger under the player's feet, if any. */
export function findStairAt(
  buildings: BuildingDefinition[],
  feetX: number,
  feetY: number
): { building: BuildingDefinition; stair: StairLink } | null {
  for (const building of buildings) {
    for (const stair of getStairLinks(building)) {
      if (containsPoint(stair.rect, feetX, feetY)) return { building, stair };
    }
  }
  return null;
}

/** All extra colliders contributed by buildings (ground furniture + upper floors). */
export function getBuildingWalls(buildings: BuildingDefinition[]): Rect[] {
  const walls: Rect[] = [];
  for (const b of buildings) {
    walls.push(...(b.groundWalls ?? []));
    for (const l of b.levels ?? []) walls.push(...l.walls);
  }
  return walls;
}

// ── Internal-px → world helpers (1 internal px = 2 world px) ──

function toWorld(ox: number, oy: number, r: Rect): Rect {
  return { x: ox + r.x * 2, y: oy + r.y * 2, w: r.w * 2, h: r.h * 2 };
}

/** Player top-left so that their feet (x + 16, y + 28) land on an internal-px point. */
function feetToPlayer(ox: number, oy: number, feet: { x: number; y: number }) {
  return { x: ox + feet.x * 2 - 16, y: oy + feet.y * 2 - 28 };
}

export function shellWalls(bounds: Rect, side: number = 16, north: number = 32, south: number = 16): Rect[] {
  return [
    { x: bounds.x, y: bounds.y, w: bounds.w, h: north },
    { x: bounds.x, y: bounds.y, w: side, h: bounds.h },
    { x: bounds.x + bounds.w - side, y: bounds.y, w: side, h: bounds.h },
    { x: bounds.x, y: bounds.y + bounds.h - south, w: bounds.w, h: south },
  ];
}

/** Distance (world px) from the door within which the Enter/Exit prompt shows. */
export const DOOR_PROMPT_RADIUS = 44;
/** A player only counts as "outside" again once this far past the footprint. */
export const EXIT_HYSTERESIS = 16;

export const ROOF_LIFT_MS = 220;
export const ROOF_DROP_MS = 180;
export const REDUCED_MOTION_MS = 150;

function containsPoint(r: Rect, x: number, y: number, pad: number = 0): boolean {
  return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
}

/**
 * Resolves which building (if any) the player's feet are in.
 * Entering is immediate; leaving requires moving EXIT_HYSTERESIS px past the
 * footprint so wiggling in a doorway does not make the roof flicker.
 */
export function resolveBuildingAt(
  buildings: BuildingDefinition[],
  currentId: string | null,
  feetX: number,
  feetY: number
): string | null {
  if (currentId) {
    const current = buildings.find((b) => b.id === currentId);
    if (current && containsPoint(current.footprint, feetX, feetY, EXIT_HYSTERESIS)) {
      return currentId;
    }
  }
  for (const b of buildings) {
    if (containsPoint(b.footprint, feetX, feetY)) return b.id;
  }
  return null;
}

/** Nearest door within DOOR_PROMPT_RADIUS of the player's feet, or null. */
export function findNearestDoor(
  buildings: BuildingDefinition[],
  feetX: number,
  feetY: number
): BuildingDefinition | null {
  let best: BuildingDefinition | null = null;
  let bestDist = DOOR_PROMPT_RADIUS;
  for (const b of buildings) {
    const d = b.door.rect;
    const cx = Math.max(d.x, Math.min(feetX, d.x + d.w));
    const cy = Math.max(d.y, Math.min(feetY, d.y + d.h));
    const dist = Math.hypot(feetX - cx, feetY - cy);
    if (dist <= bestDist) {
      best = b;
      bestDist = dist;
    }
  }
  return best;
}

/** Moves roof-lift progress (0 = roof on, 1 = lifted) toward its target. */
export function stepRoofProgress(
  progress: number,
  lifted: boolean,
  dtMs: number,
  reducedMotion: boolean = false
): number {
  const duration = reducedMotion ? REDUCED_MOTION_MS : lifted ? ROOF_LIFT_MS : ROOF_DROP_MS;
  const delta = dtMs / duration;
  return lifted ? Math.min(1, progress + delta) : Math.max(0, progress - delta);
}

/** Ease-out cubic, close to cubic-bezier(0.2, 0.8, 0.2, 1). */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// ── VERDANT VILLAGE ROOF ART (internal 8px grid, matches villageMap.ts) ──

function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: string) {
  ctx.fillStyle = col;
  ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
}

/** Shingled pitched roof with a front façade strip and an open doorway. */
function drawPitchedRoof(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  palette: { base: string; light: string; dark: string; ridge: string; facade: string; facadeLine: string },
  door: { x: number; w: number },
  facadeH: number
) {
  const roofH = h - facadeH;

  // Roof body with shingle courses
  px(ctx, 0, 0, w, roofH, palette.base);
  for (let y = 2; y < roofH; y += 5) {
    px(ctx, 0, y, w, 1, palette.dark);
    const offset = (Math.floor(y / 5) % 2) * 4;
    for (let x = offset; x < w; x += 8) {
      px(ctx, x, y + 1, 1, 4, palette.dark);
    }
  }
  // Top-light highlight on the north slope, ridge line through the middle
  px(ctx, 0, 0, w, 2, palette.light);
  const ridgeY = Math.floor(roofH / 2) - 1;
  px(ctx, 0, ridgeY, w, 2, palette.ridge);
  px(ctx, 0, ridgeY + 2, w, 1, palette.light);
  // Eave shadow at the base of the roof
  px(ctx, 0, roofH - 2, w, 2, palette.dark);

  // Front façade wall with doorway
  px(ctx, 0, roofH, w, facadeH, palette.facade);
  px(ctx, 0, roofH, w, 1, palette.facadeLine);
  px(ctx, door.x - 1, roofH + 1, door.w + 2, facadeH - 1, '#1C1009');
  px(ctx, door.x, roofH + 2, door.w, facadeH - 2, '#3B2412');

  // Façade windows either side of the door
  const winY = roofH + 2;
  const winH = Math.max(2, facadeH - 5);
  const win = (wx: number) => {
    px(ctx, wx - 1, winY - 1, 10, winH + 2, '#1C1009');
    px(ctx, wx, winY, 8, winH, '#FDE68A');
    px(ctx, wx + 4, winY, 1, winH, '#B45309');
  };
  win(Math.floor(door.x / 2) - 4);
  win(door.x + door.w + Math.floor((w - door.x - door.w) / 2) - 4);
}

/** Wires a two-storey building: ground footprint + matching upper floor in the off-map band. */
function twoStorey(params: {
  upperId: string;
  footprint: Rect;
  upperOrigin: { x: number; y: number };
  stairs: Rect;
  arrivalFeet: { x: number; y: number };
  groundColliders: Rect[];
  upperColliders: Rect[];
  renderUpper: (ctx: CanvasRenderingContext2D, ox: number, oy: number) => void;
}): Pick<BuildingDefinition, 'groundLabel' | 'groundWalls' | 'groundStairs' | 'levels'> {
  const f = params.footprint;
  const u = { x: params.upperOrigin.x, y: params.upperOrigin.y, w: f.w, h: f.h };
  return {
    groundLabel: '1F',
    groundWalls: params.groundColliders.map((r) => toWorld(f.x, f.y, r)),
    groundStairs: {
      rect: toWorld(f.x, f.y, params.stairs),
      toLevelId: params.upperId,
      arrival: feetToPlayer(u.x, u.y, params.arrivalFeet),
    },
    levels: [
      {
        id: params.upperId,
        label: '2F',
        bounds: u,
        walls: [...shellWalls(u), ...params.upperColliders.map((r) => toWorld(u.x, u.y, r))],
        stairs: {
          rect: toWorld(u.x, u.y, params.stairs),
          toLevelId: null,
          arrival: feetToPlayer(f.x, f.y, params.arrivalFeet),
        },
        render: (ctx) => params.renderUpper(ctx, 0, 0),
      },
    ],
  };
}

const COTTAGE_FOOTPRINT: Rect = { x: 80, y: 48, w: COTTAGE_W * 2, h: COTTAGE_H * 2 };
const TOWNHALL_FOOTPRINT: Rect = { x: 304, y: 32, w: TOWNHALL_W * 2, h: TOWNHALL_H * 2 };

export const VILLAGE_BUILDINGS: BuildingDefinition[] = [
  {
    id: 'cottage',
    name: 'Cozy Cottage',
    icon: 'house',
    color: '#D97706',
    // Internal (40, 24, 96, 74) scaled 2x
    footprint: COTTAGE_FOOTPRINT,
    door: {
      rect: { x: 164, y: 176, w: 40, h: 20 },
      insideSpawn: { x: 168, y: 140 },
      outsideSpawn: { x: 168, y: 190 },
    },
    ...twoStorey({
      upperId: 'cottage:2F',
      footprint: COTTAGE_FOOTPRINT,
      upperOrigin: { x: 80, y: UPPER_LEVEL_Y },
      stairs: COTTAGE_STAIRS,
      arrivalFeet: COTTAGE_ARRIVAL_FEET,
      groundColliders: COTTAGE_GROUND_COLLIDERS,
      upperColliders: COTTAGE_UPPER_COLLIDERS,
      renderUpper: drawCottageUpper,
    }),
    renderRoof(ctx, w, h) {
      drawPitchedRoof(
        ctx,
        w,
        h,
        {
          base: '#B45309',
          light: '#F59E0B',
          dark: '#7C2D12',
          ridge: '#451A03',
          facade: '#E7D3B0',
          facadeLine: '#FFF7E6',
        },
        { x: 42, w: 20 },
        10
      );
      // Chimney stack over the fireplace
      px(ctx, 10, 4, 10, 12, '#57534E');
      px(ctx, 10, 4, 10, 2, '#A8A29E');
      px(ctx, 12, 1, 6, 3, '#292524');
    },
  },
  {
    id: 'townhall',
    name: 'Town Hall',
    icon: 'landmark',
    color: '#2563EB',
    // Internal (152, 16, 120, 78) scaled 2x
    footprint: TOWNHALL_FOOTPRINT,
    door: {
      rect: { x: 400, y: 168, w: 48, h: 20 },
      insideSpawn: { x: 408, y: 124 },
      outsideSpawn: { x: 408, y: 182 },
    },
    ...twoStorey({
      upperId: 'townhall:2F',
      footprint: TOWNHALL_FOOTPRINT,
      upperOrigin: { x: 400, y: UPPER_LEVEL_Y },
      stairs: TOWNHALL_STAIRS,
      arrivalFeet: TOWNHALL_ARRIVAL_FEET,
      groundColliders: TOWNHALL_GROUND_COLLIDERS,
      upperColliders: TOWNHALL_UPPER_COLLIDERS,
      renderUpper: drawTownHallUpper,
    }),
    renderRoof(ctx, w, h) {
      drawPitchedRoof(
        ctx,
        w,
        h,
        {
          base: '#334155',
          light: '#64748B',
          dark: '#1E293B',
          ridge: '#0F172A',
          facade: '#E2E8F0',
          facadeLine: '#F8FAFC',
        },
        { x: 48, w: 24 },
        12
      );
      // Gold guild crest on the ridge
      const cx = Math.floor(w / 2);
      px(ctx, cx - 7, 14, 14, 12, '#1E3A8A');
      px(ctx, cx - 5, 16, 10, 8, '#2563EB');
      px(ctx, cx - 1, 17, 2, 6, '#FBBF24');
      px(ctx, cx - 3, 19, 6, 2, '#FBBF24');
    },
  },
];
