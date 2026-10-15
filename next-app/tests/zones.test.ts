import { describe, it, expect } from 'vitest';
import { getCurrentZone, isPositionInWater } from '../src/game/map/zones';

describe('Map Zones & Swimming Logic', () => {
  it('identifies Crystal Bay Beach zone', () => {
    const zone = getCurrentZone(1300, 500);
    expect(zone.name).toBe('Crystal Bay Beach');
  });

  it('identifies Whispering Woods zone', () => {
    const zone = getCurrentZone(700, 300);
    expect(zone.name).toBe('Whispering Woods');
  });

  it('identifies River Crossing Bridge zone', () => {
    const zone = getCurrentZone(750, 700);
    expect(zone.name).toBe('River Crossing Bridge');
  });

  it('identifies Adventure Camp zone', () => {
    const zone = getCurrentZone(300, 800);
    expect(zone.name).toBe('Adventure Camp');
  });

  it('identifies Verdant Village default plaza', () => {
    const zone = getCurrentZone(500, 500);
    expect(zone.name).toBe('Verdant Village');
  });

  it('correctly detects water in river stream', () => {
    // Within river stream (x: 730-806, y: 414-MAP_HEIGHT)
    expect(isPositionInWater(750, 500)).toBe(true);
  });

  it('excludes bridge deck from water (allows walking across)', () => {
    // Bridge deck (x: 710-826, y: 660-745)
    expect(isPositionInWater(750, 700)).toBe(false);
  });

  it('correctly detects ocean water in Crystal Bay', () => {
    expect(isPositionInWater(1450, 600)).toBe(true);
  });

  it('excludes pier from water', () => {
    // Pier (x: 1290-1590, y: 458-534)
    expect(isPositionInWater(1350, 490)).toBe(false);
  });

  it('detects dry land in village', () => {
    expect(isPositionInWater(400, 400)).toBe(false);
  });

  it('verifies all WORLD_ZONES map accurately to their respective zone definitions', () => {
    const zones = [
      { name: 'Verdant Village', x: 420, y: 300 },
      { name: 'Whispering Woods', x: 950, y: 220 },
      { name: 'River Crossing Bridge', x: 768, y: 700 },
      { name: 'Adventure Camp', x: 350, y: 780 },
      { name: 'Crystal Bay Beach', x: 1450, y: 480 },
    ];

    for (const z of zones) {
      const detected = getCurrentZone(z.x, z.y);
      expect(detected.name).toBe(z.name);
    }
  });

  describe('Horizon Academy Campus (School) Zones', () => {
    it('identifies school zones accurately', () => {
      expect(getCurrentZone(360, 260, 'school').name).toBe('Classroom Wing 101');
      expect(getCurrentZone(1050, 260, 'school').name).toBe('Chemistry & Science Lab');
      expect(getCurrentZone(700, 530, 'school').name).toBe('Locker Commons & Hallway');
      expect(getCurrentZone(360, 780, 'school').name).toBe('Academy Library & Study Pods');
      expect(getCurrentZone(1050, 780, 'school').name).toBe('Cafeteria & Nutrition Commons');
      expect(getCurrentZone(1460, 500, 'school').name).toBe('Athletic Gym & Quad');
    });

    it('does not allow swimming in school', () => {
      expect(isPositionInWater(750, 500, 'school')).toBe(false);
      expect(isPositionInWater(1450, 600, 'school')).toBe(false);
    });
  });

  describe('Modern Tech HQ (Office) Zones', () => {
    it('identifies office zones accurately', () => {
      expect(getCurrentZone(360, 260, 'office').name).toBe('Open Engineering Workstations');
      expect(getCurrentZone(1050, 260, 'office').name).toBe('Executive Glass Boardroom');
      expect(getCurrentZone(700, 530, 'office').name).toBe('Reception & Main Lobby');
      expect(getCurrentZone(360, 780, 'office').name).toBe('Breakroom Kitchen & Watercooler');
      expect(getCurrentZone(1050, 780, 'office').name).toBe('Town Hall Lounge & Ping Pong');
      expect(getCurrentZone(1460, 500, 'office').name).toBe('Phone Pods & Skyline Terrace');
    });

    it('does not allow swimming in office', () => {
      expect(isPositionInWater(750, 500, 'office')).toBe(false);
    });
  });

  describe('Neon Velvet Nightclub Zones', () => {
    it('identifies nightclub zones accurately', () => {
      expect(getCurrentZone(420, 160, 'nightclub').name).toBe('DJ Stage & Turntable Booth');
      expect(getCurrentZone(420, 460, 'nightclub').name).toBe('Pulsing LED Dance Floor');
      expect(getCurrentZone(1050, 260, 'nightclub').name).toBe('VIP Velvet Bottle Lounge');
      expect(getCurrentZone(700, 840, 'nightclub').name).toBe('Neon Cocktail Mixology Bar');
      expect(getCurrentZone(1460, 500, 'nightclub').name).toBe('Rooftop Skyline Terrace');
    });

    it('does not allow swimming in nightclub', () => {
      expect(isPositionInWater(750, 500, 'nightclub')).toBe(false);
    });
  });

  describe('Retro Cyber Arcade & Arena Zones', () => {
    it('identifies arcade zones accurately', () => {
      expect(getCurrentZone(360, 260, 'arcade').name).toBe('Classic Retro Arcade Row');
      expect(getCurrentZone(1050, 260, 'arcade').name).toBe('Esports Tournament Arena');
      expect(getCurrentZone(360, 780, 'arcade').name).toBe('DDR Dance Stage & Air Hockey');
      expect(getCurrentZone(1050, 780, 'arcade').name).toBe('Prize Counter & Slushie Bar');
      expect(getCurrentZone(1460, 500, 'arcade').name).toBe('Retro LAN Party Lounge');
    });

    it('does not allow swimming in arcade', () => {
      expect(isPositionInWater(750, 500, 'arcade')).toBe(false);
    });
  });

  describe('Roast & Read Book Cafe Zones', () => {
    it('identifies cafe zones accurately', () => {
      expect(getCurrentZone(360, 260, 'cafe').name).toBe('Barista Espresso Bar & Bakery');
      expect(getCurrentZone(1050, 260, 'cafe').name).toBe('Fireplace Hearth & Armchairs');
      expect(getCurrentZone(360, 780, 'cafe').name).toBe('Bookstore Stacks & Study Nook');
      expect(getCurrentZone(1050, 780, 'cafe').name).toBe('Acoustic Live Stage & Chess');
      expect(getCurrentZone(1460, 500, 'cafe').name).toBe('Sunlit Cobblestone Patio');
    });

    it('does not allow swimming in cafe', () => {
      expect(isPositionInWater(750, 500, 'cafe')).toBe(false);
    });
  });
});

