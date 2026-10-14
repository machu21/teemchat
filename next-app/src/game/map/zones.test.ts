import { describe, it, expect } from 'vitest';
import { isPositionInWater, getCurrentZone } from './zones';

describe('Map Zones & Swimming Logic', () => {
  it('detects swimmable river stream correctly', () => {
    // Inside river stream: x in [730, 806], y >= 414
    expect(isPositionInWater(750, 500)).toBe(true);
    // On wooden bridge deck: should NOT be in water
    expect(isPositionInWater(750, 700)).toBe(false);
  });

  it('detects ocean surf in Crystal Bay', () => {
    // Ocean surf: x >= 1392 (outside the wooden pier y in [458, 534])
    expect(isPositionInWater(1420, 600)).toBe(true);
    // On wooden pier (x: 1290-1590, y: 458-534): should NOT be in water
    expect(isPositionInWater(1400, 500)).toBe(false);
  });

  it('identifies zones accurately', () => {
    expect(getCurrentZone(200, 300).name).toBe('Verdant Village');
    expect(getCurrentZone(800, 200).name).toBe('Whispering Woods');
    expect(getCurrentZone(1400, 500).name).toBe('Crystal Bay Beach');
  });
});
