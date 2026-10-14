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
});
