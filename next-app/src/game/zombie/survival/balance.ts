// ============================================================
// ZOMBIE MODE — WORLD RULES (difficulty presets and custom balancing)
// One object holds every tunable the brief asks for. A space's admins
// pick a preset or set custom values (stored in `survival_rules`); the
// host spreads them to everyone in the snapshot (`cfg`), and every
// system reads its multiplier from here instead of hard-coding it.
// Multipliers are 1 at Normal.
// ============================================================

export type PresetId = 'beginner' | 'normal' | 'survival' | 'hardcore' | 'custom';
export type WeatherFrequency = 'calm' | 'normal' | 'stormy';

export interface WorldRules {
  preset: PresetId;
  /** Zombies in the city (population target and spawn waves). */
  population: number;
  /** Walking / running speed. */
  zombieSpeed: number;
  /** How hard a bite hits. */
  zombieStrength: number;
  /** How far they see and hear. */
  detection: number;
  /** Chance a wound carries the infection. */
  infection: number;
  hunger: number;
  thirst: number;
  fatigue: number;
  /** Restocking and floor-loot respawn. */
  loot: number;
  /** All skill XP. */
  xp: number;
  /** Game days in which the mains power / water fail (inclusive). */
  powerOffDays: [number, number];
  waterOffDays: [number, number];
  /** How fast the world clock runs (1 = one game day per real hour). */
  timeSpeed: number;
  weather: WeatherFrequency;
  /** How quickly the dead are replaced (waves and top-ups). */
  respawn: number;
  /** Damage survivors deal. */
  playerDamage: number;
}

export const PRESETS: Record<Exclude<PresetId, 'custom'>, WorldRules> = {
  beginner: {
    preset: 'beginner',
    population: 0.6,
    zombieSpeed: 0.85,
    zombieStrength: 0.6,
    detection: 0.8,
    infection: 0.3,
    hunger: 0.7,
    thirst: 0.7,
    fatigue: 0.8,
    loot: 1.5,
    xp: 1.5,
    powerOffDays: [6, 9],
    waterOffDays: [7, 10],
    timeSpeed: 1,
    weather: 'calm',
    respawn: 0.6,
    playerDamage: 1.3,
  },
  normal: {
    preset: 'normal',
    population: 1,
    zombieSpeed: 1,
    zombieStrength: 1,
    detection: 1,
    infection: 1,
    hunger: 1,
    thirst: 1,
    fatigue: 1,
    loot: 1,
    xp: 1,
    powerOffDays: [2, 4],
    waterOffDays: [3, 5],
    timeSpeed: 1,
    weather: 'normal',
    respawn: 1,
    playerDamage: 1,
  },
  survival: {
    preset: 'survival',
    population: 1.4,
    zombieSpeed: 1.1,
    zombieStrength: 1.25,
    detection: 1.15,
    infection: 1.3,
    hunger: 1.2,
    thirst: 1.2,
    fatigue: 1.1,
    loot: 0.7,
    xp: 0.8,
    powerOffDays: [1, 3],
    waterOffDays: [2, 3],
    timeSpeed: 1,
    weather: 'normal',
    respawn: 1.3,
    playerDamage: 0.9,
  },
  hardcore: {
    preset: 'hardcore',
    population: 2,
    zombieSpeed: 1.25,
    zombieStrength: 1.6,
    detection: 1.35,
    infection: 2,
    hunger: 1.4,
    thirst: 1.4,
    fatigue: 1.25,
    loot: 0.45,
    xp: 0.6,
    powerOffDays: [1, 1],
    waterOffDays: [1, 2],
    timeSpeed: 1,
    weather: 'stormy',
    respawn: 1.8,
    playerDamage: 0.8,
  },
};

export const NORMAL_RULES = PRESETS.normal;

export const PRESET_INFO: Record<PresetId, { label: string; description: string }> = {
  beginner: { label: 'Beginner', description: 'Fewer, slower zombies, plenty of loot, the power lasts a week.' },
  normal: { label: 'Normal', description: 'The intended balance.' },
  survival: { label: 'Survival', description: 'More and tougher zombies, scarcer loot, early outages.' },
  hardcore: { label: 'Hardcore', description: 'A huge, fast, sharp-eyed horde; the lights go out on day one.' },
  custom: { label: 'Custom', description: 'Your own settings.' },
};

/** The sliders a Custom world offers: [min, max, step]. */
export const RULE_RANGES: Record<
  Exclude<keyof WorldRules, 'preset' | 'powerOffDays' | 'waterOffDays' | 'weather'>,
  { label: string; min: number; max: number; step: number }
> = {
  population: { label: 'Zombie population', min: 0.25, max: 3, step: 0.05 },
  zombieSpeed: { label: 'Zombie speed', min: 0.5, max: 1.6, step: 0.05 },
  zombieStrength: { label: 'Zombie strength', min: 0.25, max: 3, step: 0.05 },
  detection: { label: 'Zombie sight and hearing', min: 0.5, max: 2, step: 0.05 },
  infection: { label: 'Infection chance', min: 0, max: 3, step: 0.1 },
  hunger: { label: 'Hunger rate', min: 0.25, max: 3, step: 0.05 },
  thirst: { label: 'Thirst rate', min: 0.25, max: 3, step: 0.05 },
  fatigue: { label: 'Fatigue rate', min: 0.25, max: 3, step: 0.05 },
  loot: { label: 'Loot abundance', min: 0.25, max: 3, step: 0.05 },
  xp: { label: 'Skill XP', min: 0.25, max: 5, step: 0.25 },
  timeSpeed: { label: 'World time speed', min: 0.5, max: 4, step: 0.25 },
  respawn: { label: 'Zombie respawn', min: 0, max: 3, step: 0.1 },
  playerDamage: { label: 'Damage you deal', min: 0.25, max: 3, step: 0.05 },
};

const clamp = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback;

function days(v: unknown, fallback: [number, number]): [number, number] {
  if (!Array.isArray(v) || v.length !== 2) return fallback;
  const a = Math.round(clamp(v[0], 1, 30, fallback[0]));
  const b = Math.round(clamp(v[1], 1, 30, fallback[1]));
  return [Math.min(a, b), Math.max(a, b)];
}

/**
 * Validates rules from the database or the wire. A named preset always
 * means exactly that preset; anything else becomes Custom with every
 * number clamped to its range.
 */
export function sanitizeRules(raw: unknown): WorldRules {
  if (!raw || typeof raw !== 'object') return { ...NORMAL_RULES };
  const r = raw as Record<string, unknown>;
  if (typeof r.preset === 'string' && r.preset !== 'custom' && r.preset in PRESETS) return { ...PRESETS[r.preset as Exclude<PresetId, 'custom'>] };
  const out: WorldRules = { ...NORMAL_RULES, preset: 'custom' };
  for (const [k, range] of Object.entries(RULE_RANGES) as [keyof typeof RULE_RANGES, (typeof RULE_RANGES)[keyof typeof RULE_RANGES]][]) {
    out[k] = clamp(r[k], range.min, range.max, NORMAL_RULES[k]);
  }
  out.powerOffDays = days(r.powerOffDays, NORMAL_RULES.powerOffDays);
  out.waterOffDays = days(r.waterOffDays, NORMAL_RULES.waterOffDays);
  out.weather = r.weather === 'calm' || r.weather === 'stormy' ? r.weather : 'normal';
  return out;
}

/** Same rules (used to skip resending). */
export function sameRules(a: WorldRules, b: WorldRules): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The difficulty curve (difficulty.ts) with the world rules folded in:
 * population, waves, detection and loot. Pure.
 */
export function applyRules<T extends { populationMul: number; spawnIntervalSeconds: number; aggroMul: number; lootMul: number }>(d: T, r: WorldRules): T {
  return {
    ...d,
    populationMul: d.populationMul * r.population,
    // Respawn 0: no extra waves at all
    spawnIntervalSeconds: r.respawn <= 0 ? Infinity : d.spawnIntervalSeconds / r.respawn,
    aggroMul: d.aggroMul * r.detection,
    lootMul: d.lootMul * r.loot,
  };
}

/** Weather odds per frequency: multipliers on [clear, cloudy, fog, rain, storm]. */
export const WEATHER_BIAS: Record<WeatherFrequency, [number, number, number, number, number]> = {
  calm: [1.8, 1.2, 0.8, 0.5, 0.25],
  normal: [1, 1, 1, 1, 1],
  stormy: [0.6, 1, 1, 1.7, 2.2],
};
