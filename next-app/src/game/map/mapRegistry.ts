import { Rect, MAP_WIDTH, MAP_HEIGHT, WALL_THICK } from '../collision';
import { FurnitureType } from '../entities/furniture';
import { renderVillageMap } from './maps/villageMap';
import { renderSchoolMap } from './maps/schoolMap';
import { renderOfficeMap } from './maps/officeMap';
import { renderNightclubMap } from './maps/nightclubMap';
import { renderArcadeMap } from './maps/arcadeMap';
import { renderCafeMap } from './maps/cafeMap';

export type MapThemeId = 'village' | 'school' | 'office' | 'nightclub' | 'arcade' | 'cafe';

export interface ZoneDefinition {
  id: string;
  name: string;
  tag: string;
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
  icon: string;
  badgeColor: string;
  previewGradient: string;
  description: string;
  highlights: string[];
  defaultSpawn: { x: number; y: number };
  zones: ZoneDefinition[];
  boundaryWalls: Rect[];
  defaultProps: { type: FurnitureType; x: number; y: number }[];
  isPositionInWater: (x: number, y: number) => boolean;
  getCurrentZone: (x: number, y: number) => { name: string; tag: string; color: string };
  render: (ctx: CanvasRenderingContext2D, iw: number, ih: number) => void;
}

const PERIMETER_WALLS: Rect[] = [
  { x: 0, y: 0, w: MAP_WIDTH, h: WALL_THICK },
  { x: 0, y: MAP_HEIGHT - WALL_THICK, w: MAP_WIDTH, h: WALL_THICK },
  { x: 0, y: 0, w: WALL_THICK, h: MAP_HEIGHT },
  { x: MAP_WIDTH - WALL_THICK, y: 0, w: WALL_THICK, h: MAP_HEIGHT },
];

export const MAP_REGISTRY: Record<MapThemeId, MapThemeConfig> = {
  // ── 1. VERDANT VILLAGE (THE CURRENT MAP) ──────────────────────
  village: {
    id: 'village',
    name: 'Verdant Village & Meadow',
    tagline: 'Cozy 16-bit retro village, pine woods & coastal pier',
    category: 'Gaming',
    icon: '🏡',
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
        tag: '🏡 Village Plaza',
        description: 'The cozy heart of the realm with central fountain and picnic tables.',
        x: 420,
        y: 300,
        color: '#8B5CF6',
      },
      {
        id: 'woods',
        name: 'Whispering Woods',
        tag: '🌲 Deep Woods',
        description: 'Enchanted pine forest with ancient trees and tranquil nature.',
        x: 950,
        y: 220,
        color: '#10B981',
      },
      {
        id: 'bridge',
        name: 'River Crossing Bridge',
        tag: '🌉 River Bridge',
        description: 'Timber bridge connecting the village to the eastern shores.',
        x: 768,
        y: 700,
        color: '#D97706',
      },
      {
        id: 'camp',
        name: 'Adventure Camp',
        tag: '🔥 Campfire',
        description: 'Roaring evening campfire, canvas tents, and log seating.',
        x: 350,
        y: 780,
        color: '#F59E0B',
      },
      {
        id: 'beach',
        name: 'Crystal Bay Beach',
        tag: '🏖️ Coastal Pier',
        description: 'Sunny shores, wooden fishing pier, and ocean waves.',
        x: 1450,
        y: 480,
        color: '#38BDF8',
      },
    ],
    boundaryWalls: [
      ...PERIMETER_WALLS,
      // Building 1 (Village HQ)
      { x: 16 * 5, y: 16 * 5, w: 16 * 12, h: 16 * 8 },
      // Building 2 (Library / Cafe)
      { x: 16 * 19, y: 16 * 4, w: 16 * 15, h: 16 * 9 },
    ],
    defaultProps: [
      // Lounge Area
      { type: 'blueSofa', x: 128, y: 272 },
      { type: 'coffeeTable', x: 144, y: 224 },
      { type: 'armchair', x: 224, y: 208 },
      { type: 'floorLamp', x: 88, y: 256 },
      { type: 'pottedPlant', x: 88, y: 192 },
      { type: 'pingPongTable', x: 368, y: 224 },
      { type: 'beanBagRed', x: 304, y: 352 },
      { type: 'beanBagBlue', x: 352, y: 352 },
      { type: 'beanBagYellow', x: 400, y: 352 },
      { type: 'pottedPlant', x: 496, y: 336 },
      // Outdoor Village
      { type: 'stoneWell', x: 288, y: 448 },
      { type: 'woodenSign', x: 224, y: 448 },
      { type: 'streetLantern', x: 64, y: 448 },
      { type: 'streetLantern', x: 560, y: 448 },
      { type: 'woodenFence', x: 96, y: 496 },
      { type: 'flowerPatch', x: 96, y: 528 },
      { type: 'logBench', x: 368, y: 480 },
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
    isPositionInWater(x: number, y: number): boolean {
      if (x >= 710 && x <= 826 && y >= 660 && y <= 745) return false;
      if (x >= 1290 && x <= 1590 && y >= 458 && y <= 534) return false;
      if (x >= 730 && x <= 806 && y >= 414 && y <= MAP_HEIGHT) return true;
      if (x >= 1392 && x <= MAP_WIDTH - WALL_THICK) return true;
      return false;
    },
    getCurrentZone(x: number, y: number) {
      if (x >= 1290) return { name: 'Crystal Bay Beach', tag: '🏖️ Coastal Bay', color: '#38BDF8' };
      if (y <= 400 && x >= 600) return { name: 'Whispering Woods', tag: '🌲 Woods', color: '#10B981' };
      if (x >= 710 && x <= 826 && y >= 660 && y <= 745) return { name: 'River Crossing Bridge', tag: '🌉 Bridge', color: '#D97706' };
      if (y >= 700 && x <= 600) return { name: 'Adventure Camp', tag: '🔥 Campfire', color: '#F59E0B' };
      return { name: 'Verdant Village', tag: '🏡 Village Plaza', color: '#8B5CF6' };
    },
    render: renderVillageMap,
  },

  // ── 2. SCHOOL RELATED: HORIZON ACADEMY ────────────────────────
  school: {
    id: 'school',
    name: 'Horizon Academy Campus',
    tagline: 'Academic campus with lecture classrooms, lab, library & gym',
    category: 'School',
    icon: '🏫',
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
        tag: '📚 Main Classroom',
        description: 'Chalkboard, student desks, teacher podium, and globe.',
        x: 360,
        y: 260,
        color: '#2563EB',
      },
      {
        id: 'lab',
        name: 'Chemistry & Science Lab',
        tag: '🧪 Science Lab',
        description: 'Acid-resistant counters, periodic table chart, beakers, and sinks.',
        x: 1050,
        y: 260,
        color: '#059669',
      },
      {
        id: 'hallway',
        name: 'Locker Commons & Hallway',
        tag: '🎒 Locker Hallway',
        description: 'School lockers, trophy case, and water fountain.',
        x: 700,
        y: 530,
        color: '#D97706',
      },
      {
        id: 'library',
        name: 'Academy Library & Study Pods',
        tag: '📖 Quiet Library',
        description: 'Towering book stacks, banker lamps, and study carrels.',
        x: 360,
        y: 780,
        color: '#7C3AED',
      },
      {
        id: 'cafeteria',
        name: 'Cafeteria & Nutrition Commons',
        tag: '🥪 School Cafeteria',
        description: 'Long lunch tables, snack vending machines, and tray returns.',
        x: 1050,
        y: 780,
        color: '#EA580C',
      },
      {
        id: 'gym',
        name: 'Athletic Gym & Quad',
        tag: '🏀 Gymnasium Court',
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
      if (x >= 1360) return { name: 'Athletic Gym & Quad', tag: '🏀 Gymnasium Court', color: '#DC2626' };
      if (y >= 490 && y <= 580) return { name: 'Locker Commons & Hallway', tag: '🎒 Locker Hallway', color: '#D97706' };
      if (y < 490) {
        if (x < 740) return { name: 'Classroom Wing 101', tag: '📚 Main Classroom', color: '#2563EB' };
        return { name: 'Chemistry & Science Lab', tag: '🧪 Science Lab', color: '#059669' };
      } else {
        if (x < 740) return { name: 'Academy Library & Study Pods', tag: '📖 Quiet Library', color: '#7C3AED' };
        return { name: 'Cafeteria & Nutrition Commons', tag: '🥪 School Cafeteria', color: '#EA580C' };
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
    icon: '💼',
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
        tag: '💻 Engineering Hub',
        description: 'Dual widescreen monitors, sprint whiteboard wall, and task desks.',
        x: 360,
        y: 260,
        color: '#2563EB',
      },
      {
        id: 'boardroom',
        name: 'Executive Glass Boardroom',
        tag: '📊 Boardroom Suite',
        description: 'Large conference table, 85" presentation screen, and frosted glass.',
        x: 1050,
        y: 260,
        color: '#4F46E5',
      },
      {
        id: 'lobby',
        name: 'Reception & Main Lobby',
        tag: '🏢 Central Lobby',
        description: 'Reception desk with backlit illuminated branding and guest seating.',
        x: 700,
        y: 530,
        color: '#0F172A',
      },
      {
        id: 'kitchen',
        name: 'Breakroom Kitchen & Watercooler',
        tag: '☕ Breakroom Cafe',
        description: 'Espresso machine, water cooler dispenser, and high-top cafe tables.',
        x: 360,
        y: 780,
        color: '#059669',
      },
      {
        id: 'lounge',
        name: 'Town Hall Lounge & Ping Pong',
        tag: '🏓 Town Hall Lounge',
        description: 'Competition ping pong table, blue velvet couches, and all-hands screen.',
        x: 1050,
        y: 780,
        color: '#D97706',
      },
      {
        id: 'terrace',
        name: 'Phone Pods & Skyline Terrace',
        tag: '📱 Phone Pods & Balcony',
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
      if (x >= 1360) return { name: 'Phone Pods & Skyline Terrace', tag: '📱 Phone Pods & Balcony', color: '#0284C7' };
      if (y >= 490 && y <= 580) return { name: 'Reception & Main Lobby', tag: '🏢 Central Lobby', color: '#0F172A' };
      if (y < 490) {
        if (x < 760) return { name: 'Open Engineering Workstations', tag: '💻 Engineering Hub', color: '#2563EB' };
        return { name: 'Executive Glass Boardroom', tag: '📊 Boardroom Suite', color: '#4F46E5' };
      } else {
        if (x < 760) return { name: 'Breakroom Kitchen & Watercooler', tag: '☕ Breakroom Cafe', color: '#059669' };
        return { name: 'Town Hall Lounge & Ping Pong', tag: '🏓 Town Hall Lounge', color: '#D97706' };
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
    icon: '🪩',
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
        tag: '🎧 DJ Riser Stage',
        description: 'Elevated riser, vinyl turntables, subwoofers, and overhead laser truss.',
        x: 420,
        y: 160,
        color: '#7C3AED',
      },
      {
        id: 'dance',
        name: 'Pulsing LED Dance Floor',
        tag: '🪩 Neon Dance Floor',
        description: 'Interactive glowing multi-color LED tiles and disco mirror ball reflection.',
        x: 420,
        y: 460,
        color: '#E11D48',
      },
      {
        id: 'vip',
        name: 'VIP Velvet Bottle Lounge',
        tag: '🍾 VIP Velvet Suite',
        description: 'Crimson curved sectional booths, champagne ice buckets, and gold ropes.',
        x: 1050,
        y: 260,
        color: '#9F1239',
      },
      {
        id: 'bar',
        name: 'Neon Cocktail Mixology Bar',
        tag: '🍸 Cocktail Bar',
        description: '40-foot illuminated bar counter, 30+ glowing bottles, and round barstools.',
        x: 700,
        y: 840,
        color: '#0891B2',
      },
      {
        id: 'rooftop',
        name: 'Rooftop Skyline Terrace',
        tag: '🌌 Rooftop Sky Deck',
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
      if (x >= 1360) return { name: 'Rooftop Skyline Terrace', tag: '🌌 Rooftop Sky Deck', color: '#2563EB' };
      if (y >= 740) return { name: 'Neon Cocktail Mixology Bar', tag: '🍸 Cocktail Bar', color: '#0891B2' };
      if (x >= 760 && y < 740) return { name: 'VIP Velvet Bottle Lounge', tag: '🍾 VIP Velvet Suite', color: '#9F1239' };
      if (y < 240) return { name: 'DJ Stage & Turntable Booth', tag: '🎧 DJ Riser Stage', color: '#7C3AED' };
      return { name: 'Pulsing LED Dance Floor', tag: '🪩 Neon Dance Floor', color: '#E11D48' };
    },
    render: renderNightclubMap,
  },

  // ── 5. ARCADE: RETRO CYBER ARENA ──────────────────────────────
  arcade: {
    id: 'arcade',
    name: 'Retro Cyber Arcade & Arena',
    tagline: '80s/90s neon arcade with classic cabinets, esports stage & DDR dance pad',
    category: 'Gaming',
    icon: '🕹️',
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
        tag: '🕹️ Arcade Alley',
        description: 'Authentic 8-cabinet row with glowing marquees and balltop joysticks.',
        x: 360,
        y: 260,
        color: '#D97706',
      },
      {
        id: 'esports',
        name: 'Esports Tournament Arena',
        tag: '🏆 Esports Stage',
        description: 'Team Red vs Team Blue gaming battlestations and spectator bleachers.',
        x: 1050,
        y: 260,
        color: '#DC2626',
      },
      {
        id: 'ddr',
        name: 'DDR Dance Stage & Air Hockey',
        tag: '💃 Dance & Rhythm',
        description: 'Directional rhythm dance pads, air hockey, and skeeball ramps.',
        x: 360,
        y: 780,
        color: '#EC4899',
      },
      {
        id: 'prizes',
        name: 'Prize Counter & Slushie Bar',
        tag: '🎟️ Prize & Slushie Bar',
        description: 'Ticket redemption counter, claw machines, and multi-flavor slushies.',
        x: 1050,
        y: 780,
        color: '#059669',
      },
      {
        id: 'lan',
        name: 'Retro LAN Party Lounge',
        tag: '🎮 LAN Party Nook',
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
      if (x >= 1360) return { name: 'Retro LAN Party Lounge', tag: '🎮 LAN Party Nook', color: '#7C3AED' };
      if (y < 490) {
        if (x < 760) return { name: 'Classic Retro Arcade Row', tag: '🕹️ Arcade Alley', color: '#D97706' };
        return { name: 'Esports Tournament Arena', tag: '🏆 Esports Stage', color: '#DC2626' };
      } else {
        if (x < 760) return { name: 'DDR Dance Stage & Air Hockey', tag: '💃 Dance & Rhythm', color: '#EC4899' };
        return { name: 'Prize Counter & Slushie Bar', tag: '🎟️ Prize & Slushie Bar', color: '#059669' };
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
    icon: '☕',
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
        tag: '☕ Espresso Bar',
        description: 'Italian espresso machine, fresh pastry glass case, and hanging chalkboard menu.',
        x: 360,
        y: 260,
        color: '#B45309',
      },
      {
        id: 'fireplace',
        name: 'Fireplace Hearth & Armchairs',
        tag: '🔥 Fireplace Nook',
        description: 'Stone brick fireplace with glowing embers, Persian rug, and leather chairs.',
        x: 1050,
        y: 260,
        color: '#C2410C',
      },
      {
        id: 'books',
        name: 'Bookstore Stacks & Study Nook',
        tag: '📚 Book Stacks',
        description: 'Oak library shelves, rolling brass ladder, and reading carrels.',
        x: 360,
        y: 780,
        color: '#6D28D9',
      },
      {
        id: 'stage',
        name: 'Acoustic Live Stage & Chess',
        tag: '🎸 Acoustic Stage',
        description: 'Vintage microphone, acoustic guitar on stand, and cafe chess tables.',
        x: 1050,
        y: 780,
        color: '#047857',
      },
      {
        id: 'patio',
        name: 'Sunlit Cobblestone Patio',
        tag: '🌿 Garden Patio',
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
      if (x >= 1360) return { name: 'Sunlit Cobblestone Patio', tag: '🌿 Garden Patio', color: '#0369A1' };
      if (y < 490) {
        if (x < 760) return { name: 'Barista Espresso Bar & Bakery', tag: '☕ Espresso Bar', color: '#B45309' };
        return { name: 'Fireplace Hearth & Armchairs', tag: '🔥 Fireplace Nook', color: '#C2410C' };
      } else {
        if (x < 760) return { name: 'Bookstore Stacks & Study Nook', tag: '📚 Book Stacks', color: '#6D28D9' };
        return { name: 'Acoustic Live Stage & Chess', tag: '🎸 Acoustic Stage', color: '#047857' };
      }
    },
    render: renderCafeMap,
  },
};

// ── REGISTRY HELPER UTILITIES ──────────────────────────────────

export function getMapConfig(themeId?: string | null): MapThemeConfig {
  if (!themeId || !(themeId in MAP_REGISTRY)) {
    return MAP_REGISTRY.village;
  }
  return MAP_REGISTRY[themeId as MapThemeId];
}

export function getAllMapConfigs(): MapThemeConfig[] {
  return Object.values(MAP_REGISTRY);
}

export function getZonesForMap(themeId?: string | null): ZoneDefinition[] {
  return getMapConfig(themeId).zones;
}

export function getBoundaryWallsForMap(themeId?: string | null): Rect[] {
  return getMapConfig(themeId).boundaryWalls;
}

export function getDefaultPropsForMap(themeId?: string | null): { type: FurnitureType; x: number; y: number }[] {
  return getMapConfig(themeId).defaultProps;
}
