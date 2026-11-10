import { describe, expect, it } from 'vitest';
import { GAME_DAY_SECONDS, clockLabel, daylightVision, lightAt, nightThreat, skyTint, timeOfDay } from './daycycle';

const atHour = (h: number) => ((h - 8 + 24) % 24) * (GAME_DAY_SECONDS / 24);

describe('day cycle', () => {
  it('starts at 08:00 on day 1 and one day lasts one real hour', () => {
    const t0 = timeOfDay(0);
    expect([t0.day, t0.hour, t0.minute, t0.phase]).toEqual([1, 8, 0, 'day']);
    const t1 = timeOfDay(GAME_DAY_SECONDS);
    expect([t1.day, t1.hour]).toEqual([2, 8]);
    // 1 game hour = 150 real seconds
    expect(timeOfDay(150).hour).toBe(9);
  });

  it('is bright at noon, dark at night, and continuous through dawn and dusk', () => {
    expect(timeOfDay(atHour(12)).light).toBe(1);
    expect(timeOfDay(atHour(23)).light).toBe(0);
    expect(timeOfDay(atHour(23)).phase).toBe('night');
    expect(timeOfDay(atHour(19)).phase).toBe('dusk');
    let prev = lightAt(0);
    for (let h = 0; h <= 24; h += 0.05) {
      const l = lightAt(h % 24);
      expect(Math.abs(l - prev)).toBeLessThan(0.1);
      prev = l;
    }
  });

  it('daylight widens vision; nights are faster and busier', () => {
    expect(daylightVision(1).radiusMul).toBeCloseTo(1.3);
    expect(daylightVision(0).radiusMul).toBeCloseTo(0.5);
    expect(daylightVision(1).coneAngle).toBeGreaterThan(daylightVision(0).coneAngle);
    expect(nightThreat(0)).toEqual({ speedMul: 1.15, hordeMul: 1.3 });
    expect(nightThreat(1)).toEqual({ speedMul: 1, hordeMul: 1 });
  });

  it('tints the sky dark at night and warm at sunset', () => {
    expect(skyTint(timeOfDay(atHour(12))).night.a).toBe(0);
    expect(skyTint(timeOfDay(atHour(0))).night.a).toBeGreaterThan(0.5);
    expect(skyTint(timeOfDay(atHour(19))).warm.a).toBeGreaterThan(0.1);
    expect(clockLabel(timeOfDay(atHour(21) + 100))).toMatch(/^Day 1 · 21:40$/);
  });
});
