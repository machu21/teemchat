import { Rect, MAP_WIDTH, MAP_HEIGHT, WALL_THICK } from '../collision';
import { FurnitureType } from '../entities/furniture';
import { renderVillageMap } from './maps/villageMap';
import { renderSchoolMap } from './maps/schoolMap';
import { renderOfficeMap } from './maps/officeMap';
import { renderNightclubMap } from './maps/nightclubMap';
import { renderArcadeMap } from './maps/arcadeMap';
import { renderCafeMap } from './maps/cafeMap';
import { BuildingDefinition, VILLAGE_BUILDINGS } from './buildings';
import type { Entrance } from '../zombie/entrances';
import type { LootSpawn } from '../zombie/weapons';
import { buildZombieCityConfig } from './city/cityMap';
import type { IconName } from '@/lib/icons';

export type MapThemeId = 'village' | 'school' | 'office' | 'nightclub' | 'arcade' | 'cafe' | 'zombie_city';

export interface ZoneDefinition {
  id: string;
  name: string;
  tag: string;
  icon: IconName;
  description: string;
  x: number;
  y: number;
  color: string;
}

export interface MapThemeConfig {
  id: MapThemeId;
  name: string;
  tagline: string;
  category: string;
  icon: IconName;
  badgeColor: string;
  previewGradient: string;
  description: string;
  highlights: string[];
  defaultSpawn: { x: number; y: number };
  zones: ZoneDefinition[];
  boundaryWalls: Rect[];
  defaultProps: { type: FurnitureType; x: number; y: number }[];
  /** Enterable buildings with roof-lift interiors (optional per map). */
  buildings?: BuildingDefinition[];
  isPositionInWater: (x: number, y: number) => boolean;
  getCurrentZone: (x: number, y: number) => { name: string; tag: string; color: string; icon?: IconName };
  render: (ctx: CanvasRenderingContext2D, iw: number, ih: number) => void;
  /** Outdoor world size in px. Omitted = MAP_WIDTH × MAP_HEIGHT (all social maps). */
  size?: { w: number; h: number };
  /**
   * Draws one world-px rect of the ground layer. The ctx is already translated to
   * world coordinates (draw at world px; output outside `rect` is discarded).
   * When present the map is streamed in chunks instead of one pre-rendered
   * canvas (needed for large maps on mobile).
   */
  renderChunk?: (ctx: CanvasRenderingContext2D, rect: Rect) => void;
  /** Draws one door/window in its current state (world px), each frame. */
  renderEntrance?: (ctx: CanvasRenderingContext2D, e: Entrance) => void;
  /** Not offered in the map picker (e.g. the Zombie Survival city). */
  hiddenFromPicker?: boolean;
  /** Doors and windows (Zombie Survival); their tiles must sit in gaps of boundaryWalls. */
  entrances?: Entrance[];
  /**
   * Low obstacles (fences, cars, bins…): solid on foot, cleared mid-jump in
   * survival. Zombies can't cross them, but they don't block sight.
   */
  lowWalls?: Rect[];
  /** Weapon / ammo pickups (Zombie Survival). Ids must be stable: they're synced by id. */
  loot?: LootSpawn[];
}

/** World-edge walls for a map of the given size. */
export function perimeterWalls(w: number, h: number): Rect[] {
  return [
    { x: 0, y: 0, w, h: WALL_THICK },
    { x: 0, y: h - WALL_THICK, w, h: WALL_THICK },
    { x: 0, y: 0, w: WALL_THICK, h },
    { x: w - WALL_THICK, y: 0, w: WALL_THICK, h },
  ];
}

const PERIMETER_WALLS: Rect[] = perimeterWalls(MAP_WIDTH, MAP_HEIGHT);

// zombie_city is attached below as a lazy getter (generating the city takes ~100 ms)
const EAGER_MAPS: Record<Exclude<MapThemeId, 'zombie_city'>, MapThemeConfig> = {
  // ── 1. VERDANT VILLAGE (THE CURRENT MAP) ──────────────────────
  village: {
    id: 'village',
    name: 'Verdant Village & Meadow',
    tagline: 'Cozy 16-bit retro village, pine woods & coastal pier',
    category: 'Gaming',
    icon: 'house',
    badgeColor: '#10B981',
    previewGradient: 'linear-gradient(135deg, #15803D 0%, #047857 50%, #0284C7 100%)',
    description:
      'Classic Pokémon GBA-inspired realm featuring the Village HQ lounge, Whispering Woods, Adventure Campfire, and Crystal Bay beach.',
    highlights: ['Village Plaza', 'Whispering Woods', 'River Bridge', 'Campfire Hub', 'Crystal Bay Pier'],
    defaultSpawn: { x: 420, y: 300 },
    zones: [
      {
        id: 'village',
        name: 'Verdant Village',
        tag: 'Village Plaza', icon: 'house',
        description: 'The cozy heart of the realm with central fountain and picnic tables.',
        x: 420,
        y: 300,
        color: '#8B5CF6',
      },
      {
        id: 'woods',
        name: 'Whispering Woods',
        tag: 'Deep Woods', icon: 'tree',
        description: 'Enchanted pine forest with ancient trees and tranquil nature.',
        x: 950,
        y: 220,
        color: '#10B981',
      },
      {
        id: 'bridge',
        name: 'River Crossing Bridge',
        tag: 'River Bridge', icon: 'bridge',
        description: 'Timber bridge connecting the village to the eastern shores.',
        x: 768,
        y: 700,
        color: '#D97706',
      },
      {
        id: 'camp',
        name: 'Adventure Camp',
        tag: 'Campfire', icon: 'flame',
        description: 'Roaring evening campfire, canvas tents, and log seating.',
        x: 350,
        y: 780,
        color: '#F59E0B',
      },
      {
        id: 'beach',
        name: 'Crystal Bay Beach',
        tag: 'Coastal Pier', icon: 'palm',
        description: 'Sunny shores, wooden fishing pier, and ocean waves.',
        x: 1450,
        y: 480,
        color: '#38BDF8',
      },
      {
        id: 'cottage',
        name: 'Cozy Cottage Interior',
        tag: 'Potion Shop', icon: 'house',
        description: 'Warm fireplace, alchemist study desk, and potion racks.',
        x: 184,
        y: 120,
        color: '#D97706',
      },
      {
        id: 'townhall',
        name: 'Town Hall Interior',
        tag: 'Guild Hall', icon: 'landmark',
        description: 'Grand council meeting table, reception ledger, and library.',
        x: 424,
        y: 110,
        color: '#2563EB',
      },
    ],
    boundaryWalls: [
      ...PERIMETER_WALLS,
      // Building 1 (Cottage / Potion Shop): Perimeter walls with open doorway (x: 164..204)
      { x: 80, y: 48, w: 192, h: 32 }, // North elevated wall
      { x: 80, y: 48, w: 16, h: 148 }, // West wall
      { x: 256, y: 48, w: 16, h: 148 }, // East wall
      { x: 80, y: 180, w: 84, h: 16 }, // South wall left
      { x: 204, y: 180, w: 68, h: 16 }, // South wall right (doorway open 164..204)

      // Building 2 (Town Hall / Guild House): Perimeter walls with open double doorway (x: 400..448)
      { x: 304, y: 32, w: 240, h: 32 }, // North elevated wall
      { x: 304, y: 32, w: 16, h: 156 }, // West wall
      { x: 528, y: 32, w: 16, h: 156 }, // East wall
      { x: 304, y: 172, w: 96, h: 16 }, // South wall left
      { x: 448, y: 172, w: 96, h: 16 }, // South wall right (double doorway open 400..448)
    ],
    defaultProps: [
      // Village Plaza Center & Surroundings
      { type: 'villageFountain', x: 336, y: 320 },
      { type: 'logBench', x: 224, y: 280 },
      { type: 'logBench', x: 448, y: 360 },
      { type: 'streetLantern', x: 192, y: 200 },
      { type: 'streetLantern', x: 480, y: 200 },
      { type: 'streetLantern', x: 192, y: 440 },
      { type: 'streetLantern', x: 480, y: 440 },
      { type: 'woodenSign', x: 160, y: 430 },
      { type: 'woodenSign', x: 500, y: 280 },
      { type: 'flowerPatch', x: 130, y: 460 },
      { type: 'flowerPatch', x: 530, y: 460 },
      { type: 'pottedPlant', x: 260, y: 200 },
      { type: 'pottedPlant', x: 420, y: 200 },
      { type: 'berryBush', x: 544, y: 480 },
      { type: 'pineTree', x: 576, y: 128 },
      // Woods & Camp
      { type: 'pineTree', x: 950, y: 220 },
      { type: 'pineTree', x: 1100, y: 180 },
      { type: 'campfire', x: 350, y: 780 },
      { type: 'tent', x: 280, y: 750 },
      { type: 'tent', x: 420, y: 750 },
      { type: 'logBench', x: 350, y: 840 },
    ],
    buildings: VILLAGE_BUILDINGS,
    isPositionInWater(x: number, y: number): boolean {
      if (y > MAP_HEIGHT) return false; // Upper building floors live below the outdoor map
      if (x >= 710 && x <= 826 && y >= 660 && y <= 745) return false;
      if (x >= 1290 && x <= 1590 && y >= 458 && y <= 534) return false;
      if (x >= 730 && x <= 806 && y >= 414 && y <= MAP_HEIGHT) return true;
      if (x >= 1392 && x <= MAP_WIDTH - WALL_THICK) return true;
      return false;
    },
    getCurrentZone(x: number, y: number) {
      if (x >= 96 && x <= 256 && y >= 64 && y <= 180) {
        return { name: 'Cozy Cottage Interior', tag: 'Potion Shop', icon: 'house', color: '#D97706' };
      }
      if (x >= 320 && x <= 528 && y >= 48 && y <= 172) {
        return { name: 'Town Hall Interior', tag: 'Guild Hall', icon: 'landmark', color: '#2563EB' };
      }
      if (x >= 1290) return { name: 'Crystal Bay Beach', tag: 'Coastal Bay', icon: 'palm', color: '#38BDF8' };
      if (y <= 400 && x >= 600) return { name: 'Whispering Woods', tag: 'Woods', icon: 'tree', color: '#10B981' };
      if (x >= 710 && x <= 826 && y >= 660 && y <= 745) return { name: 'River Crossing Bridge', tag: 'Bridge', icon: 'bridge', color: '#D97706' };
      if (y >= 700 && x <= 600) return { name: 'Adventure Camp', tag: 'Campfire', icon: 'flame', color: '#F59E0B' };
      return { name: 'Verdant Village', tag: 'Village Plaza', icon: 'house', color: '#8B5CF6' };
    },
    render: renderVillageMap,
  },

  // ── 2. SCHOOL RELATED: HORIZON ACADEMY ────────────────────────
  school: {
    id: 'school',
    name: 'Horizon Academy Campus',
    tagline: 'Academic campus with lecture classrooms, lab, library & gym',
    category: 'School',
    icon: 'school',
    badgeColor: '#3B82F6',
    previewGradient: 'linear-gradient(135deg, #1D4ED8 0%, #059669 50%, #D97706 100%)',
    description:
      'Immersive school environment with chalkboard classrooms, a chemical science lab, quiet library study pods, student lockers, cafeteria, and basketball gym.',
    highlights: ['Classroom 101', 'Chemistry Lab', 'Locker Commons', 'Study Library', 'Gymnasium Court'],
    defaultSpawn: { x: 360, y: 260 },
    zones: [
      {
        id: 'classroom',
        name: 'Classroom Wing 101',
        tag: 'Main Classroom', icon: 'book',
        description: 'Chalkboard, student desks, teacher podium, and globe.',
        x: 360,
        y: 260,
        color: '#2563EB',
      },
      {
        id: 'lab',
        name: 'Chemistry & Science Lab',
        tag: 'Science Lab', icon: 'flask',
        description: 'Acid-resistant counters, periodic table chart, beakers, and sinks.',
        x: 1050,
        y: 260,
        color: '#059669',
      },
      {
        id: 'hallway',
        name: 'Locker Commons & Hallway',
        tag: 'Locker Hallway', icon: 'backpack',
        description: 'School lockers, trophy case, and water fountain.',
        x: 700,
        y: 530,
        color: '#D97706',
      },
      {
        id: 'library',
        name: 'Academy Library & Study Pods',
        tag: 'Quiet Library', icon: 'bookText',
        description: 'Towering book stacks, banker lamps, and study carrels.',
        x: 360,
        y: 780,
        color: '#7C3AED',
      },
      {
        id: 'cafeteria',
        name: 'Cafeteria & Nutrition Commons',
        tag: 'School Cafeteria', icon: 'sandwich',
        description: 'Long lunch tables, snack vending machines, and tray returns.',
        x: 1050,
        y: 780,
        color: '#EA580C',
      },
      {
        id: 'gym',
        name: 'Athletic Gym & Quad',
        tag: 'Gymnasium Court', icon: 'dumbbell',
        description: 'Hardwood basketball court, spectator bleachers, and green courtyard.',
        x: 1460,
        y: 500,
        color: '#DC2626',
      },
    ],
    boundaryWalls: PERIMETER_WALLS,
    defaultProps: [
      // Classroom props
      { type: 'bookshelf', x: 80, y: 160 },
      { type: 'pottedPlant', x: 680, y: 160 },
      { type: 'blueSofa', x: 200, y: 420 },
      // Lab props
      { type: 'pottedPlant', x: 800, y: 160 },
      { type: 'officePrinter', x: 1300, y: 160 },
      // Library props
      { type: 'bookshelf', x: 80, y: 640 },
      { type: 'bookshelf', x: 220, y: 640 },
      { type: 'armchair', x: 160, y: 880 },
      { type: 'coffeeTable', x: 220, y: 880 },
      { type: 'floorLamp', x: 100, y: 880 },
      // Cafeteria props
      { type: 'vendingMachine', x: 800, y: 920 },
      { type: 'vendingMachine', x: 860, y: 920 },
      { type: 'beanBagRed', x: 1240, y: 900 },
      { type: 'beanBagBlue', x: 1290, y: 900 },
      // Courtyard props
      { type: 'logBench', x: 1440, y: 720 },
      { type: 'flowerPatch', x: 1440, y: 800 },
      { type: 'streetLantern', x: 1440, y: 600 },
    ],
    isPositionInWater() {
      return false; // Indoor school campus
    },
    getCurrentZone(x: number, y: number) {
      if (x >= 1360) return { name: 'Athletic Gym & Quad', tag: 'Gymnasium Court', icon: 'dumbbell', color: '#DC2626' };
      if (y >= 490 && y <= 580) return { name: 'Locker Commons & Hallway', tag: 'Locker Hallway', icon: 'backpack', color: '#D97706' };
      if (y < 490) {
        if (x < 740) return { name: 'Classroom Wing 101', tag: 'Main Classroom', icon: 'book', color: '#2563EB' };
        return { name: 'Chemistry & Science Lab', tag: 'Science Lab', icon: 'flask', color: '#059669' };
      } else {
        if (x < 740) return { name: 'Academy Library & Study Pods', tag: 'Quiet Library', icon: 'bookText', color: '#7C3AED' };
        return { name: 'Cafeteria & Nutrition Commons', tag: 'School Cafeteria', icon: 'sandwich', color: '#EA580C' };
      }
    },
    render: renderSchoolMap,
  },

  // ── 3. WORK OFFICE: MODERN TECH HQ ───────────────────────────
  office: {
    id: 'office',
    name: 'Modern Tech HQ & Coworking',
    tagline: 'Sleek workspace with open desks, glass boardroom, cafe & phone pods',
    category: 'Work',
    icon: 'briefcase',
    badgeColor: '#6366F1',
    previewGradient: 'linear-gradient(135deg, #1E1B4B 0%, #2563EB 50%, #06B6D4 100%)',
    description:
      'High-productivity corporate space featuring dual-monitor engineering workstations, an executive glass boardroom, coffee kitchenette, ping-pong all-hands lounge, and skyline terrace.',
    highlights: ['Workstation Pods', 'Glass Boardroom', 'Breakroom Kitchen', 'Ping-Pong Lounge', 'Private Phone Pods'],
    defaultSpawn: { x: 360, y: 260 },
    zones: [
      {
        id: 'desks',
        name: 'Open Engineering Workstations',
        tag: 'Engineering Hub', icon: 'laptop',
        description: 'Dual widescreen monitors, sprint whiteboard wall, and task desks.',
        x: 360,
        y: 260,
        color: '#2563EB',
      },
      {
        id: 'boardroom',
        name: 'Executive Glass Boardroom',
        tag: 'Boardroom Suite', icon: 'chart',
        description: 'Large conference table, 85" presentation screen, and frosted glass.',
        x: 1050,
        y: 260,
        color: '#4F46E5',
      },
      {
        id: 'lobby',
        name: 'Reception & Main Lobby',
        tag: 'Central Lobby', icon: 'office',
        description: 'Reception desk with backlit illuminated branding and guest seating.',
        x: 700,
        y: 530,
        color: '#0F172A',
      },
      {
        id: 'kitchen',
        name: 'Breakroom Kitchen & Watercooler',
        tag: 'Breakroom Cafe', icon: 'coffee',
        description: 'Espresso machine, water cooler dispenser, and high-top cafe tables.',
        x: 360,
        y: 780,
        color: '#059669',
      },
      {
        id: 'lounge',
        name: 'Town Hall Lounge & Ping Pong',
        tag: 'Town Hall Lounge', icon: 'sofa',
        description: 'Competition ping pong table, blue velvet couches, and all-hands screen.',
        x: 1050,
        y: 780,
        color: '#D97706',
      },
      {
        id: 'terrace',
        name: 'Phone Pods & Skyline Terrace',
        tag: 'Phone Pods & Balcony', icon: 'smartphone',
        description: 'Soundproof phone booths for 1-on-1s and open-air rooftop balcony.',
        x: 1460,
        y: 500,
        color: '#0284C7',
      },
    ],
    boundaryWalls: PERIMETER_WALLS,
    defaultProps: [
      // Office furniture
      { type: 'officePrinter', x: 740, y: 160 },
      { type: 'pottedPlant', x: 100, y: 160 },
      { type: 'pottedPlant', x: 680, y: 160 },
      { type: 'bookshelf', x: 800, y: 160 },
      { type: 'blueSofa', x: 1300, y: 160 },
      // Kitchen props
      { type: 'vendingMachine', x: 100, y: 920 },
      { type: 'vendingMachine', x: 160, y: 920 },
      { type: 'coffeeTable', x: 260, y: 880 },
      { type: 'pottedPlant', x: 700, y: 880 },
      // Lounge props
      { type: 'pingPongTable', x: 860, y: 700 },
      { type: 'blueSofa', x: 1100, y: 720 },
      { type: 'beanBagRed', x: 920, y: 880 },
      { type: 'beanBagBlue', x: 980, y: 880 },
      { type: 'beanBagYellow', x: 1040, y: 880 },
      // Terrace
      { type: 'pottedPlant', x: 1440, y: 640 },
      { type: 'campfire', x: 1470, y: 840 },
    ],
    isPositionInWater() {
      return false;
    },
    getCurrentZone(x: number, y: number) {
      if (x >= 1360) return { name: 'Phone Pods & Skyline Terrace', tag: 'Phone Pods & Balcony', icon: 'smartphone', color: '#0284C7' };
      if (y >= 490 && y <= 580) return { name: 'Reception & Main Lobby', tag: 'Central Lobby', icon: 'office', color: '#0F172A' };
      if (y < 490) {
        if (x < 760) return { name: 'Open Engineering Workstations', tag: 'Engineering Hub', icon: 'laptop', color: '#2563EB' };
        return { name: 'Executive Glass Boardroom', tag: 'Boardroom Suite', icon: 'chart', color: '#4F46E5' };
      } else {
        if (x < 760) return { name: 'Breakroom Kitchen & Watercooler', tag: 'Breakroom Cafe', icon: 'coffee', color: '#059669' };
        return { name: 'Town Hall Lounge & Ping Pong', tag: 'Town Hall Lounge', icon: 'sofa', color: '#D97706' };
      }
    },
    render: renderOfficeMap,
  },

  // ── 4. NIGHTCLUB PARTY: NEON VELVET ───────────────────────────
  nightclub: {
    id: 'nightclub',
    name: 'Neon Velvet Nightclub',
    tagline: 'High-energy cyberpunk club with pulsing LED floor, DJ stage & VIP lounge',
    category: 'Friends',
    icon: 'disc',
    badgeColor: '#EC4899',
    previewGradient: 'linear-gradient(135deg, #4C0519 0%, #701A75 50%, #06B6D4 100%)',
    description:
      'Atmospheric synthwave party destination featuring an interactive multi-colored dance floor, elevated DJ booth, luxury VIP bottle lounge, neon cocktail bar, and open-air rooftop fire pits.',
    highlights: ['Pulsing Dance Floor', 'Live DJ Turntable Stage', 'VIP Velvet Suite', 'Illuminated Bar', 'Sky Balcony'],
    defaultSpawn: { x: 420, y: 460 },
    zones: [
      {
        id: 'dj',
        name: 'DJ Stage & Turntable Booth',
        tag: 'DJ Riser Stage', icon: 'headphones',
        description: 'Elevated riser, vinyl turntables, subwoofers, and overhead laser truss.',
        x: 420,
        y: 160,
        color: '#7C3AED',
      },
      {
        id: 'dance',
        name: 'Pulsing LED Dance Floor',
        tag: 'Neon Dance Floor', icon: 'disc',
        description: 'Interactive glowing multi-color LED tiles and disco mirror ball reflection.',
        x: 420,
        y: 460,
        color: '#E11D48',
      },
      {
        id: 'vip',
        name: 'VIP Velvet Bottle Lounge',
        tag: 'VIP Velvet Suite', icon: 'wine',
        description: 'Crimson curved sectional booths, champagne ice buckets, and gold ropes.',
        x: 1050,
        y: 260,
        color: '#9F1239',
      },
      {
        id: 'bar',
        name: 'Neon Cocktail Mixology Bar',
        tag: 'Cocktail Bar', icon: 'cocktail',
        description: '40-foot illuminated bar counter, 30+ glowing bottles, and round barstools.',
        x: 700,
        y: 840,
        color: '#0891B2',
      },
      {
        id: 'rooftop',
        name: 'Rooftop Skyline Terrace',
        tag: 'Rooftop Sky Deck', icon: 'moonStar',
        description: 'Open-air balcony overlooking city skyscrapers with fire pit tables.',
        x: 1460,
        y: 500,
        color: '#2563EB',
      },
    ],
    boundaryWalls: PERIMETER_WALLS,
    defaultProps: [
      // DJ stage props
      { type: 'floorLamp', x: 100, y: 160 },
      { type: 'floorLamp', x: 700, y: 160 },
      // VIP lounge props
      { type: 'blueSofa', x: 880, y: 220 },
      { type: 'blueSofa', x: 1140, y: 220 },
      { type: 'coffeeTable', x: 1000, y: 240 },
      { type: 'armchair', x: 1000, y: 180 },
      { type: 'pottedPlant', x: 820, y: 140 },
      { type: 'pottedPlant', x: 1300, y: 140 },
      // Bar & Lounge props
      { type: 'beanBagRed', x: 140, y: 640 },
      { type: 'beanBagBlue', x: 190, y: 640 },
      { type: 'vendingMachine', x: 100, y: 920 },
      // Rooftop terrace
      { type: 'campfire', x: 1480, y: 320 },
      { type: 'campfire', x: 1480, y: 720 },
    ],
    isPositionInWater() {
      return false;
    },
    getCurrentZone(x: number, y: number) {
      if (x >= 1360) return { name: 'Rooftop Skyline Terrace', tag: 'Rooftop Sky Deck', icon: 'moonStar', color: '#2563EB' };
      if (y >= 740) return { name: 'Neon Cocktail Mixology Bar', tag: 'Cocktail Bar', icon: 'cocktail', color: '#0891B2' };
      if (x >= 760 && y < 740) return { name: 'VIP Velvet Bottle Lounge', tag: 'VIP Velvet Suite', icon: 'wine', color: '#9F1239' };
      if (y < 240) return { name: 'DJ Stage & Turntable Booth', tag: 'DJ Riser Stage', icon: 'headphones', color: '#7C3AED' };
      return { name: 'Pulsing LED Dance Floor', tag: 'Neon Dance Floor', icon: 'disc', color: '#E11D48' };
    },
    render: renderNightclubMap,
  },

  // ── 5. ARCADE: RETRO CYBER ARENA ──────────────────────────────
  arcade: {
    id: 'arcade',
    name: 'Retro Cyber Arcade & Arena',
    tagline: '80s/90s neon arcade with classic cabinets, esports stage & DDR dance pad',
    category: 'Gaming',
    icon: 'joystick',
    badgeColor: '#F59E0B',
    previewGradient: 'linear-gradient(135deg, #1E1B4B 0%, #D97706 50%, #EF4444 100%)',
    description:
      'Nostalgic arcade paradise with rows of pixel arcade cabinets, a competitive 5v5 esports stage, DDR dance pads, air hockey, claw prize machines, and a retro LAN lounge.',
    highlights: ['Arcade Cabinets Row', 'Esports Battle Stage', 'DDR Dance Pads', 'Air Hockey Arena', 'LAN Party Room'],
    defaultSpawn: { x: 360, y: 260 },
    zones: [
      {
        id: 'arcade_row',
        name: 'Classic Retro Arcade Row',
        tag: 'Arcade Alley', icon: 'joystick',
        description: 'Authentic 8-cabinet row with glowing marquees and balltop joysticks.',
        x: 360,
        y: 260,
        color: '#D97706',
      },
      {
        id: 'esports',
        name: 'Esports Tournament Arena',
        tag: 'Esports Stage', icon: 'trophy',
        description: 'Team Red vs Team Blue gaming battlestations and spectator bleachers.',
        x: 1050,
        y: 260,
        color: '#DC2626',
      },
      {
        id: 'ddr',
        name: 'DDR Dance Stage & Air Hockey',
        tag: 'Dance & Rhythm', icon: 'music2',
        description: 'Directional rhythm dance pads, air hockey, and skeeball ramps.',
        x: 360,
        y: 780,
        color: '#EC4899',
      },
      {
        id: 'prizes',
        name: 'Prize Counter & Slushie Bar',
        tag: 'Prize & Slushie Bar', icon: 'ticket',
        description: 'Ticket redemption counter, claw machines, and multi-flavor slushies.',
        x: 1050,
        y: 780,
        color: '#059669',
      },
      {
        id: 'lan',
        name: 'Retro LAN Party Lounge',
        tag: 'LAN Party Nook', icon: 'gamepad',
        description: 'CRT TV monitor stacks, bean bags, retro consoles, and pizza boxes.',
        x: 1460,
        y: 500,
        color: '#7C3AED',
      },
    ],
    boundaryWalls: PERIMETER_WALLS,
    defaultProps: [
      { type: 'vendingMachine', x: 740, y: 160 },
      { type: 'vendingMachine', x: 740, y: 220 },
      { type: 'wallTv', x: 1000, y: 140 },
      { type: 'pingPongTable', x: 400, y: 880 },
      { type: 'beanBagRed', x: 1440, y: 700 },
      { type: 'beanBagBlue', x: 1490, y: 700 },
      { type: 'beanBagYellow', x: 1440, y: 760 },
      { type: 'coffeeTable', x: 1460, y: 640 },
      { type: 'pottedPlant', x: 800, y: 880 },
    ],
    isPositionInWater() {
      return false;
    },
    getCurrentZone(x: number, y: number) {
      if (x >= 1360) return { name: 'Retro LAN Party Lounge', tag: 'LAN Party Nook', icon: 'gamepad', color: '#7C3AED' };
      if (y < 490) {
        if (x < 760) return { name: 'Classic Retro Arcade Row', tag: 'Arcade Alley', icon: 'joystick', color: '#D97706' };
        return { name: 'Esports Tournament Arena', tag: 'Esports Stage', icon: 'trophy', color: '#DC2626' };
      } else {
        if (x < 760) return { name: 'DDR Dance Stage & Air Hockey', tag: 'Dance & Rhythm', icon: 'music2', color: '#EC4899' };
        return { name: 'Prize Counter & Slushie Bar', tag: 'Prize & Slushie Bar', icon: 'ticket', color: '#059669' };
      }
    },
    render: renderArcadeMap,
  },

  // ── 6. COFFEE SHOP: ROAST & READ BOOK CAFE ────────────────────
  cafe: {
    id: 'cafe',
    name: 'Roast & Read Book Cafe',
    tagline: 'Artisan espresso bar, crackling stone fireplace & garden patio',
    category: 'Friends',
    icon: 'coffee',
    badgeColor: '#D97706',
    previewGradient: 'linear-gradient(135deg, #78350F 0%, #B45309 50%, #15803D 100%)',
    description:
      'Warm indie coffeehouse featuring a chrome espresso bar, pastry display, river-stone fireplace with leather armchairs, bookstore stacks, acoustic live stage, and cobblestone garden patio.',
    highlights: ['Barista Counter', 'Fireplace Hearth', 'Bookstore Stacks', 'Acoustic Stage', 'Garden Patio'],
    defaultSpawn: { x: 360, y: 260 },
    zones: [
      {
        id: 'barista',
        name: 'Barista Espresso Bar & Bakery',
        tag: 'Espresso Bar', icon: 'coffee',
        description: 'Italian espresso machine, fresh pastry glass case, and hanging chalkboard menu.',
        x: 360,
        y: 260,
        color: '#B45309',
      },
      {
        id: 'fireplace',
        name: 'Fireplace Hearth & Armchairs',
        tag: 'Fireplace Nook', icon: 'flame',
        description: 'Stone brick fireplace with glowing embers, Persian rug, and leather chairs.',
        x: 1050,
        y: 260,
        color: '#C2410C',
      },
      {
        id: 'books',
        name: 'Bookstore Stacks & Study Nook',
        tag: 'Book Stacks', icon: 'book',
        description: 'Oak library shelves, rolling brass ladder, and reading carrels.',
        x: 360,
        y: 780,
        color: '#6D28D9',
      },
      {
        id: 'stage',
        name: 'Acoustic Live Stage & Chess',
        tag: 'Acoustic Stage', icon: 'guitar',
        description: 'Vintage microphone, acoustic guitar on stand, and cafe chess tables.',
        x: 1050,
        y: 780,
        color: '#047857',
      },
      {
        id: 'patio',
        name: 'Sunlit Cobblestone Patio',
        tag: 'Garden Patio', icon: 'leaf',
        description: 'Parisian cobblestone garden with striped parasols and birdbath fountain.',
        x: 1460,
        y: 500,
        color: '#0369A1',
      },
    ],
    boundaryWalls: PERIMETER_WALLS,
    defaultProps: [
      // Cafe props
      { type: 'pottedPlant', x: 100, y: 160 },
      { type: 'pottedPlant', x: 700, y: 160 },
      { type: 'bookshelf', x: 80, y: 640 },
      { type: 'bookshelf', x: 220, y: 640 },
      { type: 'armchair', x: 180, y: 880 },
      { type: 'coffeeTable', x: 240, y: 880 },
      { type: 'floorLamp', x: 120, y: 880 },
      { type: 'blueSofa', x: 920, y: 880 },
      { type: 'coffeeTable', x: 960, y: 940 },
      // Patio props
      { type: 'flowerPatch', x: 1440, y: 200 },
      { type: 'flowerPatch', x: 1440, y: 340 },
      { type: 'logBench', x: 1440, y: 600 },
      { type: 'stoneWell', x: 1460, y: 840 },
      { type: 'streetLantern', x: 1440, y: 480 },
    ],
    isPositionInWater() {
      return false;
    },
    getCurrentZone(x: number, y: number) {
      if (x >= 1360) return { name: 'Sunlit Cobblestone Patio', tag: 'Garden Patio', icon: 'leaf', color: '#0369A1' };
      if (y < 490) {
        if (x < 760) return { name: 'Barista Espresso Bar & Bakery', tag: 'Espresso Bar', icon: 'coffee', color: '#B45309' };
        return { name: 'Fireplace Hearth & Armchairs', tag: 'Fireplace Nook', icon: 'flame', color: '#C2410C' };
      } else {
        if (x < 760) return { name: 'Bookstore Stacks & Study Nook', tag: 'Book Stacks', icon: 'book', color: '#6D28D9' };
        return { name: 'Acoustic Live Stage & Chess', tag: 'Acoustic Stage', icon: 'guitar', color: '#047857' };
      }
    },
    render: renderCafeMap,
  },
};

export const MAP_REGISTRY = EAGER_MAPS as Record<MapThemeId, MapThemeConfig>;

/** Maps generated on first access instead of at import (never listed in the picker). */
const LAZY_MAPS: ReadonlySet<MapThemeId> = new Set<MapThemeId>(['zombie_city']);
let zombieCityConfig: MapThemeConfig | null = null;
Object.defineProperty(MAP_REGISTRY, 'zombie_city', {
  enumerable: true,
  get: () => (zombieCityConfig ??= buildZombieCityConfig()),
});

// ── REGISTRY HELPER UTILITIES ──────────────────────────────────

export function getMapConfig(themeId?: string | null): MapThemeConfig {
  if (!themeId || !(themeId in MAP_REGISTRY)) {
    return MAP_REGISTRY.village;
  }
  return MAP_REGISTRY[themeId as MapThemeId];
}

/** Pickable maps. Skips lazily generated hidden maps so listing never pays for generating them. */
export function getAllMapConfigs(): MapThemeConfig[] {
  return (Object.keys(MAP_REGISTRY) as MapThemeId[]).filter((id) => !LAZY_MAPS.has(id)).map((id) => MAP_REGISTRY[id]);
}

/** Outdoor world size of a map in px. */
export function getMapSize(themeId?: string | null): { w: number; h: number } {
  return getMapConfig(themeId).size ?? { w: MAP_WIDTH, h: MAP_HEIGHT };
}

export function getZonesForMap(themeId?: string | null): ZoneDefinition[] {
  return getMapConfig(themeId).zones;
}

export function getBoundaryWallsForMap(themeId?: string | null): Rect[] {
  return getMapConfig(themeId).boundaryWalls;
}

export function getBuildingsForMap(themeId?: string | null): BuildingDefinition[] {
  return getMapConfig(themeId).buildings ?? [];
}

export function getDefaultPropsForMap(themeId?: string | null): { type: FurnitureType; x: number; y: number }[] {
  return getMapConfig(themeId).defaultProps;
}
