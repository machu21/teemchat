// ============================================================
// ZOMBIE MODE — FEEDBACK (sounds as events, floaters, screen shake)
// Gameplay code never touches audio or the DOM: ZombieMode queues
// SoundEvents (drained each frame by WorldGame into SurvivalAudio) and
// spawns floaters (damage numbers, pickups, blood, sparks) that it draws
// in world space. Everything here is pure apart from `draw`, which only
// needs a 2D context.
// ============================================================

/** One-shot sounds (synthesized in audio/survivalAudio.ts). */
export type SoundId =
  | 'shot_light'
  | 'shot_heavy'
  | 'shot_shotgun'
  | 'empty'
  | 'reload'
  | 'swing'
  | 'hit'
  | 'shove'
  | 'hurt'
  | 'death'
  | 'groan'
  | 'door'
  | 'hammer'
  | 'pry'
  | 'glass'
  | 'wood_break'
  | 'alarm'
  | 'distant_shots'
  | 'lure'
  | 'burst'
  | 'roar'
  | 'thunder'
  | 'pickup'
  | 'eat'
  | 'drink'
  | 'bandage'
  | 'craft'
  | 'level'
  | 'engine_start'
  | 'engine_fail'
  | 'horn'
  | 'crash'
  | 'splash'
  | 'rustle'
  | 'switch'
  | 'pour'
  | 'ui';

export interface SoundEvent {
  id: SoundId;
  /** World px; absent = at the listener (UI, your own body). */
  x?: number;
  y?: number;
  /** 0–1 (before distance). */
  vol?: number;
  /** Seconds to wait (thunder after the flash). */
  delay?: number;
}

/** How far each sound carries (px); beyond it, silence. */
export const SOUND_RANGE: Partial<Record<SoundId, number>> = {
  shot_light: 900,
  shot_heavy: 1100,
  shot_shotgun: 1000,
  groan: 260,
  door: 320,
  hammer: 400,
  glass: 600,
  wood_break: 600,
  alarm: 1400,
  distant_shots: 4000,
  lure: 500,
  burst: 700,
  roar: 900,
  horn: 1200,
  crash: 700,
  engine_start: 500,
};
const DEFAULT_RANGE = 400;

/**
 * Gain (0–1) and stereo pan (-1…1) for a sound heard at (lx, ly).
 * Null when it's out of earshot. Falloff is quadratic; pan follows x.
 */
export function spatialMix(listener: { x: number; y: number }, ev: SoundEvent): { gain: number; pan: number } | null {
  const vol = ev.vol ?? 1;
  if (ev.x === undefined || ev.y === undefined) return { gain: vol, pan: 0 };
  const range = SOUND_RANGE[ev.id] ?? DEFAULT_RANGE;
  const dx = ev.x - listener.x;
  const d = Math.hypot(dx, ev.y - listener.y);
  if (d >= range) return null;
  const f = 1 - d / range;
  return { gain: vol * f * f, pan: Math.max(-1, Math.min(1, dx / 300)) };
}

/** Continuous sounds, set every frame (0 = silent). */
export interface Ambience {
  /** Rain or snow falling, 0–1 (muffled under a roof). */
  rain: number;
  /** Storm wind, 0–1. */
  wind: number;
  /** Under a roof (building or car): weather sounds dull. */
  sheltered: boolean;
  /** Your car's engine: null when off; otherwise speed 0–1. */
  engine: number | null;
  /** Low health: beats per minute (0 = calm, no heartbeat). */
  heartbeat: number;
  /** Nearby helicopter / generator / campfire loudness, 0–1. */
  helicopter: number;
  generator: number;
  fire: number;
}

export const SILENCE: Ambience = { rain: 0, wind: 0, sheltered: false, engine: null, heartbeat: 0, helicopter: 0, generator: 0, fire: 0 };

/** Nearby-source loudness: 1 at the source, 0 at `range` px. */
export function proximity(d: number, range: number): number {
  return d >= range ? 0 : 1 - d / range;
}

// ---------------------------------------------------------------- floaters

export type FloaterKind = 'text' | 'blood' | 'spark' | 'dust';

export interface Floater {
  kind: FloaterKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  ttl: number;
  text?: string;
  color: string;
  size: number;
}

const MAX_FLOATERS = 160;

/** Damage numbers, pickups, level-ups, blood and sparks (world space). */
export class FeedbackLayer {
  floaters: Floater[] = [];
  private seed = 1;
  /** Turned off in the survival settings. */
  numbers = true;

  private rnd(): number {
    // Cheap LCG: visual jitter only, never gameplay
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  /** Rising text ("−12", "+2 Planks", "Carpentry 3"). */
  text(x: number, y: number, text: string, color: string, size = 11) {
    if (!this.numbers) return;
    // Texts at the same spot stack instead of overlapping
    const near = this.floaters.filter((f) => f.kind === 'text' && Math.abs(f.x - x) < 24 && f.age < 0.4).length;
    this.push({ kind: 'text', x: x + (this.rnd() - 0.5) * 6, y: y - near * 12, vx: 0, vy: -26, age: 0, ttl: 1.3, text, color, size });
  }

  /** A burst of particles: blood on a hit, sparks on a crash, dust when something is built. */
  burst(kind: Exclude<FloaterKind, 'text'>, x: number, y: number, n: number, color: string) {
    for (let i = 0; i < n; i++) {
      const a = this.rnd() * Math.PI * 2;
      const s = 20 + this.rnd() * (kind === 'spark' ? 90 : 45);
      this.push({ kind, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (kind === 'dust' ? 10 : 0), age: 0, ttl: 0.35 + this.rnd() * 0.4, color, size: kind === 'dust' ? 3 : 2 });
    }
  }

  private push(f: Floater) {
    this.floaters.push(f);
    if (this.floaters.length > MAX_FLOATERS) this.floaters.splice(0, this.floaters.length - MAX_FLOATERS);
  }

  update(dt: number) {
    if (dt <= 0 || !this.floaters.length) return;
    for (const f of this.floaters) {
      f.age += dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      if (f.kind !== 'text') {
        // Particles slow down and fall
        f.vx *= Math.max(0, 1 - 5 * dt);
        f.vy = f.vy * Math.max(0, 1 - 5 * dt) + (f.kind === 'dust' ? -8 : 30) * dt;
      }
    }
    this.floaters = this.floaters.filter((f) => f.age < f.ttl);
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (!this.floaters.length) return;
    ctx.save();
    for (const f of this.floaters) {
      const fade = Math.max(0, 1 - f.age / f.ttl);
      ctx.globalAlpha = f.kind === 'text' ? Math.min(1, fade * 2) : fade;
      if (f.kind === 'text' && f.text) {
        ctx.font = `800 ${f.size}px "Plus Jakarta Sans", sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(17,17,17,0.9)';
        ctx.strokeText(f.text, f.x, f.y);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, f.y);
      } else {
        ctx.fillStyle = f.color;
        ctx.fillRect(Math.round(f.x), Math.round(f.y), f.size, f.size);
      }
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------- screen shake

/** Trauma-style shake: add to it on hits, it decays; offset grows with trauma². */
export class Shake {
  private trauma = 0;
  enabled = true;

  add(amount: number) {
    if (!this.enabled) return;
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(dt: number) {
    this.trauma = Math.max(0, this.trauma - Math.max(0, dt) * 1.6);
  }

  /** Screen px at time `t` (seconds). */
  offset(t: number): { x: number; y: number } {
    const m = this.trauma * this.trauma * 9;
    if (m < 0.05) return { x: 0, y: 0 };
    return { x: Math.sin(t * 61) * m, y: Math.cos(t * 47) * m };
  }

  get level(): number {
    return this.trauma;
  }
}

// ---------------------------------------------------------------- notifications

export interface Notice {
  id: number;
  text: string;
  icon: string | null;
  /** Match clock when it happened. */
  at: number;
}

/** The recent toasts (stacked on screen) and a short history (the log). */
export class NoticeLog {
  private seq = 0;
  readonly history: Notice[] = [];
  static readonly KEEP = 40;

  push(text: string, icon: string | null, at: number): Notice {
    const last = this.history[this.history.length - 1];
    // The same message again (e.g. "Bag full" while walking over loot) refreshes instead of stacking
    if (last && last.text === text && at - last.at < 3) {
      last.at = at;
      return last;
    }
    const n = { id: ++this.seq, text, icon, at };
    this.history.push(n);
    if (this.history.length > NoticeLog.KEEP) this.history.splice(0, this.history.length - NoticeLog.KEEP);
    return n;
  }

  /** The newest few still within `seconds` of `now` (newest last). */
  recent(now: number, seconds: number, max = 3): Notice[] {
    const out: Notice[] = [];
    for (let i = this.history.length - 1; i >= 0 && out.length < max; i--) {
      const n = this.history[i];
      if (now - n.at > seconds) break;
      out.unshift(n);
    }
    return out;
  }
}
