import { describe, expect, it } from 'vitest';
import {
  WEATHER_FX,
  WORLD,
  clockAt,
  gameHours,
  helicopterPlan,
  indoorTemp,
  lightningBetween,
  powerOffHour,
  seasonAt,
  waterOffHour,
  weatherAt,
  worldAt,
  type Weather,
} from './world';
import { GAME_DAY_SECONDS, START_HOUR } from './daycycle';

// Phase 6: the deterministic world timeline (seasons, weather, shut-offs, events).

const SIZE = { w: 4000, h: 3000 };
const SEEDS = [1, 7, 42, 1234, 99999, 0xdeadbeef];

describe('world clock', () => {
  it('one real hour is one game day', () => {
    expect(gameHours(GAME_DAY_SECONDS)).toBeCloseTo(24);
    expect(clockAt(24)).toBeCloseTo(GAME_DAY_SECONDS);
    expect(gameHours(clockAt(37.5))).toBeCloseTo(37.5);
  });

  it('seasons last a week each, starting in summer', () => {
    expect(seasonAt(0)).toBe('summer');
    // Day 8 starts 7 days after day 1 (the match starts at START_HOUR on day 1)
    const day8 = 7 * 24 - START_HOUR;
    expect(seasonAt(day8 - 0.1)).toBe('summer');
    expect(seasonAt(day8)).toBe('autumn');
    expect(seasonAt(day8 + 7 * 24)).toBe('winter');
    expect(seasonAt(day8 + 14 * 24)).toBe('spring');
    expect(seasonAt(day8 + 21 * 24)).toBe('summer');
  });
});

describe('utility shut-offs', () => {
  it('power and water fail once, within their configured days, the same on every client', () => {
    for (const seed of SEEDS) {
      const p = powerOffHour(seed);
      const w = waterOffHour(seed);
      expect(powerOffHour(seed)).toBe(p);
      const pDay = Math.floor((START_HOUR + p) / 24) + 1;
      const wDay = Math.floor((START_HOUR + w) / 24) + 1;
      expect(pDay).toBeGreaterThanOrEqual(WORLD.powerOffDays[0]);
      expect(pDay).toBeLessThanOrEqual(WORLD.powerOffDays[1]);
      expect(wDay).toBeGreaterThanOrEqual(WORLD.waterOffDays[0]);
      expect(wDay).toBeLessThanOrEqual(WORLD.waterOffDays[1]);
      expect(worldAt(seed, clockAt(p - 0.01), 1, SIZE).power).toBe(true);
      expect(worldAt(seed, clockAt(p + 0.01), 1, SIZE).power).toBe(false);
      expect(worldAt(seed, clockAt(w + 0.01), 1, SIZE).water).toBe(false);
      // …and never come back
      expect(worldAt(seed, clockAt(p + 500), 1, SIZE).power).toBe(false);
    }
  });

  it('different worlds lose power at different times', () => {
    expect(new Set(SEEDS.map((s) => powerOffHour(s))).size).toBeGreaterThan(3);
  });
});

describe('weather', () => {
  it('is a pure function of seed and time, and holds for hours at a time', () => {
    const seed = 42;
    let changes = 0;
    let prev: Weather | null = null;
    for (let h = 0; h < 24 * 6; h += 0.25) {
      const w = weatherAt(seed, h);
      expect(weatherAt(seed, h)).toBe(w);
      if (prev && w !== prev) changes++;
      prev = w;
    }
    // At most two blocks per 6-hour epoch
    expect(changes).toBeLessThanOrEqual((24 * 6) / 6 * 2);
    expect(changes).toBeGreaterThan(3);
  });

  it('every kind of summer weather turns up over a few weeks of summers', () => {
    const seen = new Set<Weather>();
    for (const seed of SEEDS) for (let h = 0; h < 6 * 24; h += 1) seen.add(weatherAt(seed, h));
    for (const w of ['clear', 'cloudy', 'fog', 'rain', 'storm'] as Weather[]) expect(seen.has(w)).toBe(true);
    expect(seen.has('snow')).toBe(false);
  });

  it('winter rain falls as snow; no fog in the afternoon', () => {
    const winterStart = 14 * 24 - START_HOUR;
    for (const seed of SEEDS) {
      for (let h = winterStart; h < winterStart + 7 * 24; h += 1) {
        const w = weatherAt(seed, h);
        expect(w === 'rain' || w === 'storm').toBe(false);
      }
      for (let h = 0; h < 7 * 24; h += 0.5) {
        const clockHour = (START_HOUR + h) % 24;
        if (clockHour >= 12 && clockHour < 18) expect(weatherAt(seed, h)).not.toBe('fog');
      }
    }
    expect(SEEDS.some((s) => Array.from({ length: 7 * 24 }, (_, i) => weatherAt(s, winterStart + i)).includes('snow'))).toBe(true);
  });

  it('rain hides footsteps and blurs the view; storms more so', () => {
    expect(WEATHER_FX.rain.hearingMul).toBeLessThan(1);
    expect(WEATHER_FX.storm.hearingMul).toBeLessThan(WEATHER_FX.rain.hearingMul);
    expect(WEATHER_FX.fog.visionMul).toBeLessThan(WEATHER_FX.rain.visionMul);
    expect(WEATHER_FX.clear).toMatchObject({ visionMul: 1, hearingMul: 1, precipitation: 0 });
    expect(WEATHER_FX.snow.precipitation).toBeGreaterThan(0);
  });
});

describe('temperature', () => {
  it('nights are colder than days, winter colder than summer, rain colder than clear', () => {
    const seed = 7;
    const noon = worldAt(seed, clockAt(4), 1, SIZE);
    const night = worldAt(seed, clockAt(4), 0, SIZE);
    expect(night.outdoorTemp).toBeCloseTo(noon.outdoorTemp - WORLD.nightDrop);
    const winter = worldAt(seed, clockAt(15 * 24), 1, SIZE);
    expect(winter.season).toBe('winter');
    expect(winter.outdoorTemp).toBeLessThan(noon.outdoorTemp - 15);
    expect(WEATHER_FX.rain.tempDelta).toBeLessThan(0);
  });

  it('heated buildings stay comfortable; without power they only blunt the cold', () => {
    expect(indoorTemp(-10, true)).toBe(20);
    expect(indoorTemp(-10, false)).toBeLessThan(10);
    expect(indoorTemp(-10, false)).toBeGreaterThan(-10);
    expect(indoorTemp(25, false)).toBeLessThan(25);
  });
});

describe('events', () => {
  it('the helicopter flies on its configured days, in daylight, across the map', () => {
    const seed = 1234;
    for (const day of WORLD.helicopterDays) {
      const plan = helicopterPlan(seed, day, SIZE)!;
      expect(plan).not.toBeNull();
      const hour = (START_HOUR + gameHours(plan.startClock)) % 24;
      expect(hour).toBeGreaterThanOrEqual(9);
      expect(hour).toBeLessThan(17.5);
      const mid = worldAt(seed, plan.startClock + WORLD.helicopterSeconds / 2, 1, SIZE).helicopter!;
      expect(mid).not.toBeNull();
      expect(mid.progress).toBeCloseTo(0.5, 1);
      expect(worldAt(seed, plan.startClock - 1, 1, SIZE).helicopter).toBeNull();
      expect(worldAt(seed, plan.startClock + WORLD.helicopterSeconds + 1, 1, SIZE).helicopter).toBeNull();
    }
    expect(helicopterPlan(seed, 9, SIZE)).toBeNull();
  });

  it('lightning only strikes in storms, and the strikes match the flashes', () => {
    const seed = 99999;
    expect(lightningBetween(seed, 0, 10_000, 'rain')).toBe(0);
    const strikes = lightningBetween(seed, 0, 2000, 'storm');
    expect(strikes).toBeGreaterThan(20);
    expect(strikes).toBeLessThanOrEqual(100);
    // Splitting the interval counts the same strikes
    let parts = 0;
    for (let t = 0; t < 2000; t += 7) parts += lightningBetween(seed, t, Math.min(2000, t + 7), 'storm');
    expect(parts).toBe(strikes);
  });
});
