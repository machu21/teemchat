// ============================================================
// ZOMBIE CITY — MAP CONFIG ADAPTER
// Turns the pure CityPlan into an ordinary MapThemeConfig so the engine
// (WorldGame, buildings/roof-lift/floors, zombie grid) needs no city-specific
// code paths:
// - ground layer streamed in chunks (renderChunk) incl. non-furniture props
// - CityBuilding → BuildingDefinition with N floors chained by stairs
// - doors/windows → `entrances` (drawn per frame via renderEntrance)
// ============================================================

import type { Rect } from '../../collision';
import type { FurnitureType } from '../../entities/furniture';
import type { Entrance } from '../../zombie/entrances';
import type { BuildingDefinition, StairLink, UpperLevel } from '../buildings';
import type { MapThemeConfig, ZoneDefinition } from '../mapRegistry';
import { cityPropCollider, generateCity } from './cityPlan';
import { generateCityLoot } from './cityLoot';
import { renderCityChunk, renderCityEntrance, renderCityFloor, renderCityProp, renderCityRoof } from './renderCity';
import type { CityBuilding, CityPlan, CityProp, CityStairLink } from './types';
import type { RestSpot } from '../../zombie/survival/sleep';
import { cityContainers } from './cityContainers';
import type { WorldFixture } from '../../zombie/survival/utilities';
import type { VehicleKind, VehicleSpawn } from '../../zombie/survival/vehicles';
import type { GroundType } from '../mapRegistry';
import { hash32 } from '../../art/character/appearance';
import { GROUND } from './templates';
import type { IconName } from '@/lib/icons';

/** City-only prop types (everything else in CityPropType is an existing FurnitureType). */
const CITY_ONLY_PROPS: ReadonlySet<string> = new Set(['car', 'dumpster', 'fuelPump', 'trashCan']);
const isFurnitureProp = (p: CityProp): boolean => !CITY_ONLY_PROPS.has(p.type);

/**
 * CityStairLink.arrival is the arrival tile's top-left; StairLink.arrival is the
 * player's top-left, whose feet (+16, +28) should land on that tile's centre.
 */
function toStairLink(link: CityStairLink, building: CityBuilding, tile: number): StairLink {
  return {
    rect: link.rect,
    toLevelId: link.toFloor === 0 ? null : levelId(building, link.toFloor),
    arrival: { x: link.arrival.x + tile / 2 - 16, y: link.arrival.y + tile / 2 - 28 },
  };
}

function levelId(b: CityBuilding, floor: number): string {
  return `${b.id}-f${floor}`;
}

const furnitureColliders = (f: CityBuilding['floors'][number]): Rect[] =>
  f.furniture.map((fu) => ({ x: fu.x, y: fu.y, w: fu.w, h: fu.h }));

function toBuilding(plan: CityPlan, b: CityBuilding): BuildingDefinition {
  const ground = b.floors[0];
  const levels: UpperLevel[] = b.floors.slice(1).map((f) => ({
    id: levelId(b, f.index),
    label: f.label,
    bounds: f.bounds,
    walls: [...f.walls, ...furnitureColliders(f)],
    // Every upper floor has a way down; buildingFloors() guarantees it
    stairs: toStairLink(f.down!, b, plan.tile),
    stairsUp: f.up ? toStairLink(f.up, b, plan.tile) : undefined,
    // WorldGame pre-scales level layers 2× for the 8px-grid maps; the city draws 1:1
    render: (ctx) => {
      ctx.save();
      ctx.scale(0.5, 0.5);
      renderCityFloor(ctx, plan, b, f.index);
      ctx.restore();
    },
  }));

  return {
    id: b.id,
    name: b.name,
    icon: b.icon,
    color: b.color,
    footprint: b.footprint,
    door: { rect: b.frontDoor, insideSpawn: b.insideSpawn, outsideSpawn: b.outsideSpawn },
    renderRoof: (ctx) => {
      ctx.save();
      ctx.scale(0.5, 0.5);
      renderCityRoof(ctx, b);
      ctx.restore();
    },
    groundLabel: ground.label,
    groundWalls: furnitureColliders(ground),
    groundStairs: ground.up ? toStairLink(ground.up, b, plan.tile) : undefined,
    levels,
  };
}

const DISTRICT_ICONS: Record<CityPlan['zones'][number]['district'], IconName> = {
  downtown: 'office',
  commercial: 'store',
  residential: 'house',
  park: 'tree',
  landmark: 'landmark',
};

/** Every bed and sofa in the city (all floors), read straight from the existing plan. */
export function cityRestSpots(plan: CityPlan): RestSpot[] {
  const out: RestSpot[] = [];
  for (const b of plan.buildings) {
    for (const f of b.floors) {
      for (const fu of f.furniture) {
        if (fu.kind === 'bed' || fu.kind === 'sofa') out.push({ kind: fu.kind, x: fu.x, y: fu.y, w: fu.w, h: fu.h });
      }
    }
  }
  return out;
}

/**
 * Water, heat and fuel points (Zombie Survival world simulation): kitchen
 * counters have the tap, stoves cook, toilets hold a tank of water, and the
 * gas stations' pumps fill cans while the power lasts.
 */
export function cityFixtures(plan: CityPlan): WorldFixture[] {
  const out: WorldFixture[] = [];
  const inside = (fu: { x: number; y: number; w: number; h: number }, r: { x: number; y: number; w: number; h: number }) =>
    fu.x + fu.w / 2 >= r.x && fu.x + fu.w / 2 < r.x + r.w && fu.y + fu.h / 2 >= r.y && fu.y + fu.h / 2 < r.y + r.h;
  for (const b of plan.buildings) {
    for (const f of b.floors) {
      const kitchens = f.rooms.filter((rm) => rm.kind === 'kitchen' || rm.kind === 'breakRoom').map((rm) => rm.rect);
      for (const fu of f.furniture) {
        const box = { x: fu.x, y: fu.y, w: fu.w, h: fu.h };
        if (fu.kind === 'stove') out.push({ kind: 'stove', ...box });
        else if (fu.kind === 'toilet') out.push({ kind: 'toilet', ...box });
        else if (fu.kind === 'counter' && kitchens.some((k) => inside(fu, k))) out.push({ kind: 'tap', ...box });
      }
    }
  }
  for (const p of plan.props) {
    if (p.type === 'fuelPump') out.push({ kind: 'pump', x: p.x, y: p.y, w: 16, h: 24 });
    // Park fountains: the only open water in the city (fish, and water to boil)
    if (p.type === 'villageFountain') out.push({ kind: 'fountain', x: p.x + 8, y: p.y + 16, w: 64, h: 48 });
  }
  return out;
}

/**
 * The parked cars become drivable vehicles, in the same spots and colours
 * (police cars and ambulances at their stations; the rest a seeded mix of
 * sedans, pickups, vans and box trucks).
 */
export function cityVehicles(plan: CityPlan): VehicleSpawn[] {
  const out: VehicleSpawn[] = [];
  for (const p of plan.props) {
    if (p.type !== 'car') continue;
    const v = p.dir === 'v';
    const roll = (hash32(`vehicle-kind:${p.x},${p.y}`) >>> 0) % 100;
    const kind: VehicleKind =
      p.variant === 6 ? 'police' : p.variant === 7 ? 'ambulance' : roll < 55 ? 'sedan' : roll < 72 ? 'pickup' : roll < 87 ? 'van' : 'truck';
    out.push({
      id: out.length,
      kind,
      variant: p.variant ?? 0,
      // The baked sprite was 48 × 28 (or 28 × 48) from its top-left; nose east (h) or north (v)
      x: p.x + (v ? 14 : 24),
      y: p.y + (v ? 24 : 14),
      angle: v ? -Math.PI / 2 : 0,
    });
  }
  return out;
}

/** What the ground is at a world point (farm plots, traps, foraging). */
export function cityGroundAt(plan: CityPlan): (x: number, y: number) => GroundType | null {
  const T = plan.size.w / plan.cols;
  const parks = plan.zones.filter((z) => z.district === 'park').map((z) => z.rect);
  return (x, y) => {
    const c = Math.floor(x / T);
    const r = Math.floor(y / T);
    if (c < 0 || r < 0 || c >= plan.cols || r >= plan.rows) return null;
    const g = plan.ground[r * plan.cols + c];
    if (g === GROUND.GRASS) return parks.some((p) => x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h) ? 'park' : 'grass';
    if (g === GROUND.DIRT) return 'dirt';
    return g >= GROUND.FLOOR_WOOD ? 'floor' : 'paved';
  };
}

function toZones(plan: CityPlan): ZoneDefinition[] {
  return plan.zones.map((z) => ({
    id: z.id,
    name: z.name,
    tag: z.tag,
    icon: DISTRICT_ICONS[z.district],
    description: z.name,
    x: Math.round(z.rect.x + z.rect.w / 2),
    y: Math.round(z.rect.y + z.rect.h / 2),
    color: z.color,
  }));
}

/** Builds the Zombie Survival city map config. Call once (cached by the registry). */
export function buildZombieCityConfig(plan: CityPlan = generateCity()): MapThemeConfig {
  const buildings = plan.buildings.map((b) => toBuilding(plan, b));
  const entranceByTile = new Map<number, Entrance>();
  for (const e of plan.entrances) entranceByTile.set(e.row * plan.cols + e.col, e);

  // Furniture-type props become FurnitureEntity (y-sorted, own hitbox);
  // city-only props (cars, dumpsters, pumps, bins) are baked into chunks + walls.
  const furnitureProps = plan.props.filter(isFurnitureProp);
  // Parked cars are vehicles now (zombie/vehicleSystem.ts draws them and makes them solid)
  const bakedProps = plan.props.filter((p) => !isFurnitureProp(p) && p.type !== 'car');
  const bakedColliders = bakedProps.map(cityPropCollider).filter((r): r is Rect => !!r);
  // Fences and bins are jumpable: keep them out of the solid walls
  const fenceSet = new Set(plan.fences);
  const solidWalls = plan.walls.filter((w) => !fenceSet.has(w));
  const zones = toZones(plan);

  return {
    id: 'zombie_city',
    name: 'Zombie City',
    tagline: 'Abandoned downtown, suburbs and a hospital — survive the night',
    category: 'Survival',
    icon: 'skull',
    badgeColor: '#DC2626',
    previewGradient: 'linear-gradient(135deg, #3F3F46 0%, #7F1D1D 55%, #14532D 100%)',
    description: 'A fixed, hand-tuned city for Zombie Survival spaces: streets, multi-storey buildings, doors and windows.',
    highlights: ['Multi-storey buildings', 'Doors, windows & barricades', 'Police station, hospital, gas station'],
    defaultSpawn: plan.defaultSpawn,
    zones,
    boundaryWalls: solidWalls,
    lowWalls: [...plan.fences, ...bakedColliders],
    loot: generateCityLoot(plan),
    restSpots: cityRestSpots(plan),
    containers: cityContainers(plan),
    fixtures: cityFixtures(plan),
    vehicles: cityVehicles(plan),
    groundAt: cityGroundAt(plan),
    defaultProps: furnitureProps.map((p) => ({ type: p.type as FurnitureType, x: p.x, y: p.y })),
    buildings,
    entrances: plan.entrances,
    size: plan.size,
    hiddenFromPicker: true,
    isPositionInWater: () => false,
    getCurrentZone: (x, y) => {
      const z = plan.zones.find((zz) => x >= zz.rect.x && x < zz.rect.x + zz.rect.w && y >= zz.rect.y && y < zz.rect.y + zz.rect.h);
      if (z) return { name: z.name, tag: z.tag, color: z.color, icon: DISTRICT_ICONS[z.district] };
      const road = plan.roads.find((r) => x >= r.rect.x && x < r.rect.x + r.rect.w && y >= r.rect.y && y < r.rect.y + r.rect.h);
      return road ? { name: road.name, tag: 'STREET', color: '#71717A' } : { name: 'Zombie City', tag: 'CITY', color: '#DC2626' };
    },
    // Never used: renderChunk streams this map
    render: () => {},
    renderChunk: (ctx, rect) => {
      // renderCityChunk expects an untranslated ctx (it translates to rect itself);
      // the chunk renderer has already translated by -rect, so undo that first.
      ctx.save();
      ctx.translate(rect.x, rect.y);
      renderCityChunk(ctx, plan, rect);
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.rect(rect.x, rect.y, rect.w, rect.h);
      ctx.clip();
      for (const p of bakedProps) {
        if (p.x > rect.x + rect.w || p.y > rect.y + rect.h || p.x + 64 < rect.x || p.y + 64 < rect.y) continue;
        renderCityProp(ctx, p);
      }
      ctx.restore();
    },
    renderEntrance: (ctx, e) => renderCityEntrance(ctx, plan, e),
  };
}
