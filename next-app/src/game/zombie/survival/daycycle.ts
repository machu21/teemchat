// ============================================================
// ZOMBIE MODE — DAY / NIGHT CYCLE (pure)
// One in-game day = one real hour, derived from the match clock
// (`ZombieMode.elapsed`, which the host broadcasts in every snapshot),
// so every player sees the same sky with no extra network traffic.
// Daylight widens vision; nights are darker, faster and busier.
// ============================================================

/** Real seconds per in-game day. */
export const GAME_DAY_SECONDS = 3600;
/** A match opens on a fresh morning. */
export const START_HOUR = 8;

const DAWN_START = 5;
const DAWN_END = 7;
const DUSK_START = 18;
const DUSK_END = 20;

export type DayPhase = 'dawn' | 'day' | 'dusk' | 'night';

export interface TimeOfDay {
  /** 1-based day counter. */
  day: number;
  /** 0–23. */
  hour: number;
  /** 0–59. */
  minute: number;
  /** Fractional hour 0–24. */
  clock: number;
  /** 0 = full night, 1 = full daylight. */
  light: number;
  phase: DayPhase;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (t: number) => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Daylight 0–1 for a fractional hour (smoothstepped through dawn and dusk). */
export function lightAt(clock: number): number {
  if (clock >= DAWN_END && clock < DUSK_START) return 1;
  if (clock >= DAWN_START && clock < DAWN_END) return smooth((clock - DAWN_START) / (DAWN_END - DAWN_START));
  if (clock >= DUSK_START && clock < DUSK_END) return 1 - smooth((clock - DUSK_START) / (DUSK_END - DUSK_START));
  return 0;
}

export function timeOfDay(elapsedSeconds: number): TimeOfDay {
  const gameHours = START_HOUR + (Math.max(0, elapsedSeconds) / GAME_DAY_SECONDS) * 24;
  // Whole game minutes (epsilon guards float error at exact minute boundaries)
  const totalMinutes = Math.floor(gameHours * 60 + 1e-6);
  const day = Math.floor(totalMinutes / 1440) + 1;
  const clock = gameHours % 24;
  const hour = Math.floor(totalMinutes / 60) % 24;
  const minute = totalMinutes % 60;
  const phase: DayPhase =
    clock >= DAWN_START && clock < DAWN_END
      ? 'dawn'
      : clock >= DAWN_END && clock < DUSK_START
        ? 'day'
        : clock >= DUSK_START && clock < DUSK_END
          ? 'dusk'
          : 'night';
  return { day, hour, minute, clock, light: lightAt(clock), phase };
}

export interface DaylightVision {
  /** Multiplier on the base 14-tile view radius. */
  radiusMul: number;
  /** Full cone width (radians). */
  coneAngle: number;
  /** Always-aware radius (tiles). */
  peripheral: number;
}

const deg = (d: number) => (d * Math.PI) / 180;

/** Daylight widens vision: 7 tiles / 90° at night → 18 tiles / 120° at noon. */
export function daylightVision(light: number): DaylightVision {
  return {
    radiusMul: lerp(0.5, 1.3, light),
    coneAngle: lerp(deg(90), deg(120), light),
    peripheral: lerp(1.5, 2.5, light),
  };
}

/** Flashlight: a narrow beam that reaches as far as daylight, whatever the hour. */
export const FLASHLIGHT = { coneAngle: deg(40), radiusMul: 1.3 } as const;

/** Night threat: zombies move faster and gather in bigger crowds. */
export function nightThreat(light: number): { speedMul: number; hordeMul: number } {
  return { speedMul: lerp(1.15, 1, light), hordeMul: lerp(1.3, 1, light) };
}

/** Street lamps switch on below this much daylight. */
export const LAMPS_ON_BELOW = 0.6;

export interface SkyTint {
  /** Night darkness colour + alpha (0 by day). */
  night: { r: number; g: number; b: number; a: number };
  /** Warm sunrise / sunset wash (0 outside dawn and dusk). */
  warm: { r: number; g: number; b: number; a: number };
}

export function skyTint(t: TimeOfDay): SkyTint {
  const dark = 1 - t.light;
  // Warmth peaks mid-transition (sin over the dawn/dusk window)
  const warmT =
    t.phase === 'dawn'
      ? (t.clock - DAWN_START) / (DAWN_END - DAWN_START)
      : t.phase === 'dusk'
        ? (t.clock - DUSK_START) / (DUSK_END - DUSK_START)
        : -1;
  const warm = warmT >= 0 ? Math.sin(Math.PI * warmT) : 0;
  return {
    night: { r: 6, g: 12, b: 38, a: 0.58 * dark },
    warm: { r: 255, g: 138, b: 60, a: 0.16 * warm },
  };
}

/** "Day 2 · 21:40" */
export function clockLabel(t: TimeOfDay): string {
  return `Day ${t.day} · ${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
}
