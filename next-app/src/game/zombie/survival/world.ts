import { mulberry32 } from '../../art/character/appearance';
import { GAME_DAY_SECONDS, START_HOUR } from './daycycle';
import { WEATHER_BIAS, type WeatherFrequency } from './balance';

/** The world rules that shape the timeline (survival/balance.ts); all clients use the same. */
export interface TimelineRules {
  powerOffDays: readonly [number, number];
  waterOffDays: readonly [number, number];
  weather: WeatherFrequency;
}

// ============================================================
// ZOMBIE MODE — WORLD SIMULATION (pure, deterministic)
// Seasons, weather, the power and water shut-offs and scheduled events
// (helicopters) are all functions of (world seed, match clock). Every
// client computes the same world from the clock the host already sends,
// so none of it costs network traffic. Only the host acts on it where
// zombies are concerned (thunder, helicopter noise, migrations).
//
// The clock is ZombieMode's time-of-day clock (match seconds plus any
// time skipped by sleeping): 1 real hour = 1 game day.
// ============================================================

export type Season = 'summer' | 'autumn' | 'winter' | 'spring';
export type Weather = 'clear' | 'cloudy' | 'fog' | 'rain' | 'storm' | 'snow';

/** Tunables: shut-off windows, season length, weather odds, events. */
export const WORLD = {
  /** Mains power fails at a seeded hour within these game days (inclusive). */
  powerOffDays: [2, 4] as const,
  /** Mains water fails within these game days. */
  waterOffDays: [3, 5] as const,
  /** Game days per season; the match starts in summer. */
  seasonDays: 7,
  /** Weather holds for a seeded 3–6 game hours, then changes. */
  weatherBlockHours: [3, 6] as const,
  /** Odds per season [clear, cloudy, fog, rain, storm]; in winter rain and storms fall as snow. */
  weatherOdds: {
    summer: [5, 3, 1, 2, 1],
    autumn: [3, 3, 2, 3, 1],
    winter: [3, 4, 2, 3, 1],
    spring: [4, 3, 2, 3, 1],
  } as Record<Season, [number, number, number, number, number]>,
  /** Outdoor base temperature per season (°C, midday) and the night drop. */
  seasonTemp: { summer: 25, autumn: 14, winter: 1, spring: 13 } as Record<Season, number>,
  nightDrop: 8,
  /** One helicopter fly-over on each of these game days, at a seeded hour between 09:00 and 17:00. */
  helicopterDays: [1, 2, 3] as readonly number[],
  /** Real seconds a fly-over lasts. */
  helicopterSeconds: 120,
} as const;

export const SEASONS: readonly Season[] = ['summer', 'autumn', 'winter', 'spring'];

/** Game hours since the match started (at START_HOUR on day 1). */
export function gameHours(clock: number): number {
  return (Math.max(0, clock) / GAME_DAY_SECONDS) * 24;
}

/** Inverse: match clock (s) at a game hour offset. */
export function clockAt(hoursSinceStart: number): number {
  return (hoursSinceStart / 24) * GAME_DAY_SECONDS;
}

/** 1-based day for an hour offset since the start. */
const dayOf = (h: number) => Math.floor((START_HOUR + h) / 24) + 1;
/** Hours since the start at which day `d` (1-based) begins. */
const dayStart = (d: number) => (d - 1) * 24 - START_HOUR;

function seeded(seed: number, salt: number): () => number {
  return mulberry32((seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0);
}

/** Game hours after the start when mains power fails. */
export function powerOffHour(seed: number, days: readonly [number, number] = WORLD.powerOffDays): number {
  const r = seeded(seed, 11);
  const [a, b] = days;
  const day = a + Math.floor(r() * (b - a + 1));
  return Math.max(1, dayStart(day) + r() * 24);
}

export function waterOffHour(seed: number, days: readonly [number, number] = WORLD.waterOffDays): number {
  const r = seeded(seed, 23);
  const [a, b] = days;
  const day = a + Math.floor(r() * (b - a + 1));
  return Math.max(1, dayStart(day) + r() * 24);
}

export function seasonAt(hours: number): Season {
  const day = dayOf(hours);
  return SEASONS[Math.floor((day - 1) / WORLD.seasonDays) % SEASONS.length];
}

/**
 * The weather in effect at a game hour: blocks of 3–6 hours, each rolled
 * from the seed and the season. Pure, so it can be asked for any time.
 */
export function weatherAt(seed: number, hours: number, frequency: WeatherFrequency = 'normal'): Weather {
  // Walk fixed 6-hour epochs; each epoch splits into one or two seeded blocks
  const epoch = Math.floor(hours / 6);
  const r = seeded(seed, 1000 + epoch);
  const [minB, maxB] = WORLD.weatherBlockHours;
  const split = minB + r() * (maxB - minB);
  const inFirst = hours - epoch * 6 < split;
  const roll = inFirst ? r() : (r(), r());
  const season = seasonAt(hours);
  const bias = WEATHER_BIAS[frequency];
  const odds = WORLD.weatherOdds[season].map((o, i) => o * bias[i]);
  const total = odds.reduce((s, o) => s + o, 0);
  let x = roll * total;
  const kinds: Weather[] = ['clear', 'cloudy', 'fog', 'rain', 'storm'];
  let w: Weather = 'clear';
  for (let i = 0; i < kinds.length; i++) {
    x -= odds[i];
    if (x < 0) {
      w = kinds[i];
      break;
    }
  }
  // No fog in the afternoon heat; winter precipitation is snow
  const clockHour = (START_HOUR + hours) % 24;
  if (w === 'fog' && clockHour >= 12 && clockHour < 18) w = 'cloudy';
  if (season === 'winter' && (w === 'rain' || w === 'storm')) w = 'snow';
  return w;
}

export interface WeatherFx {
  /** Multiplier on how far you see. */
  visionMul: number;
  /** Extra darkness 0–1 laid over daylight. */
  gloom: number;
  /** 0–1: rain or snow falling (wets you outdoors, fills rain barrels). */
  precipitation: number;
  /** Multiplier on zombie hearing (rain drowns out footsteps). */
  hearingMul: number;
  /** °C added to the outdoor temperature. */
  tempDelta: number;
}

export const WEATHER_FX: Record<Weather, WeatherFx> = {
  clear: { visionMul: 1, gloom: 0, precipitation: 0, hearingMul: 1, tempDelta: 0 },
  cloudy: { visionMul: 0.95, gloom: 0.12, precipitation: 0, hearingMul: 1, tempDelta: -2 },
  fog: { visionMul: 0.5, gloom: 0.15, precipitation: 0, hearingMul: 0.95, tempDelta: -2 },
  rain: { visionMul: 0.85, gloom: 0.22, precipitation: 0.6, hearingMul: 0.8, tempDelta: -4 },
  storm: { visionMul: 0.72, gloom: 0.35, precipitation: 1, hearingMul: 0.65, tempDelta: -6 },
  snow: { visionMul: 0.78, gloom: 0.18, precipitation: 0.7, hearingMul: 0.85, tempDelta: -3 },
};

export const WEATHER_LABEL: Record<Weather, string> = {
  clear: 'Clear',
  cloudy: 'Cloudy',
  fog: 'Fog',
  rain: 'Rain',
  storm: 'Storm',
  snow: 'Snow',
};

export interface Helicopter {
  /** World px. */
  x: number;
  y: number;
  /** Heading (radians). */
  heading: number;
  /** 0–1 along its path. */
  progress: number;
}

export interface WorldState {
  hours: number;
  day: number;
  season: Season;
  weather: Weather;
  fx: WeatherFx;
  /** Outdoor air temperature (°C). */
  outdoorTemp: number;
  power: boolean;
  water: boolean;
  helicopter: Helicopter | null;
  /** A lightning flash right now (storms), 0–1. */
  flash: number;
}

/** The helicopter's path for a given day (null when it doesn't fly that day). */
export function helicopterPlan(seed: number, day: number, size: { w: number; h: number }) {
  if (!WORLD.helicopterDays.includes(day)) return null;
  const r = seeded(seed, 5000 + day);
  const startHours = dayStart(day) + 9 + r() * 8;
  const angle = r() * Math.PI * 2;
  const cx = size.w * (0.3 + r() * 0.4);
  const cy = size.h * (0.3 + r() * 0.4);
  const reach = Math.hypot(size.w, size.h) * 0.6;
  return {
    startClock: clockAt(startHours),
    from: { x: cx - Math.cos(angle) * reach, y: cy - Math.sin(angle) * reach },
    to: { x: cx + Math.cos(angle) * reach, y: cy + Math.sin(angle) * reach },
    heading: angle,
  };
}

function helicopterAt(seed: number, clock: number, day: number, size: { w: number; h: number }): Helicopter | null {
  for (const d of [day, day - 1]) {
    const p = helicopterPlan(seed, d, size);
    if (!p) continue;
    const t = (clock - p.startClock) / WORLD.helicopterSeconds;
    if (t < 0 || t > 1) continue;
    return { x: p.from.x + (p.to.x - p.from.x) * t, y: p.from.y + (p.to.y - p.from.y) * t, heading: p.heading, progress: t };
  }
  return null;
}

/** Lightning: in storms, a seeded flash in most 20-second windows. */
function flashAt(seed: number, clock: number, weather: Weather): number {
  if (weather !== 'storm') return 0;
  const window = Math.floor(clock / 20);
  const r = seeded(seed, 90_000 + window);
  if (r() > 0.6) return 0;
  const at = window * 20 + r() * 18;
  const dt = clock - at;
  return dt >= 0 && dt < 0.35 ? 1 - dt / 0.35 : 0;
}

/** Lightning strikes in the last `dt` seconds (host turns them into thunder noise). */
export function lightningBetween(seed: number, from: number, to: number, weather: Weather): number {
  if (weather !== 'storm' || to <= from) return 0;
  let n = 0;
  for (let w = Math.floor(from / 20); w <= Math.floor(to / 20); w++) {
    const r = seeded(seed, 90_000 + w);
    if (r() > 0.6) continue;
    const at = w * 20 + r() * 18;
    if (at > from && at <= to) n++;
  }
  return n;
}

/**
 * The whole world at a moment. `light` is daylight 0–1 (daycycle.ts) for the
 * day / night temperature swing; `size` is the map in px (helicopter path).
 */
export function worldAt(seed: number, clock: number, light: number, size: { w: number; h: number }, rules?: TimelineRules): WorldState {
  const hours = gameHours(clock);
  const day = dayOf(hours);
  const season = seasonAt(hours);
  const weather = weatherAt(seed, hours, rules?.weather);
  const fx = WEATHER_FX[weather];
  const outdoorTemp = WORLD.seasonTemp[season] - WORLD.nightDrop * (1 - light) + fx.tempDelta;
  return {
    hours,
    day,
    season,
    weather,
    fx,
    outdoorTemp,
    power: hours < powerOffHour(seed, rules?.powerOffDays),
    water: hours < waterOffHour(seed, rules?.waterOffDays),
    helicopter: helicopterAt(seed, clock, day, size),
    flash: flashAt(seed, clock, weather),
  };
}

/**
 * Indoor air: heated with power; without it, buildings only take the edge
 * off the weather outside.
 */
export function indoorTemp(outdoor: number, powered: boolean): number {
  return powered ? 20 : 12 + 0.4 * outdoor;
}
