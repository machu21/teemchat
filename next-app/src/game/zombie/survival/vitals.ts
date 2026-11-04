import type { ConsumableEffect, MovementIntent, PlayerVitals, StatusEffect } from './types';

// ============================================================
// ZOMBIE MODE — VITALS (pure, deterministic)
// tickVitals(v, ctx) → next vitals + derived movement modifiers.
// Runs locally for the owning player (like HP does today); only the
// summary (alive, health bucket) needs to go on the wire.
// ============================================================

export const VITALS = {
  max: 100,
  /** Per second at decayMul 1 (≈12 min full → empty). */
  hungerDecay: 0.14,
  /** ≈9 min full → empty while walking. */
  hydrationDecay: 0.185,
  /** Hydration decay multiplier per movement intent. */
  hydrationIntentMul: { idle: 0.8, walk: 1, sprint: 2.5 } as Record<MovementIntent, number>,
  sprintCost: 14,
  staminaRegen: { idle: 10, walk: 5, sprint: 0 } as Record<MovementIntent, number>,
  restRegen: 25,
  /** After hitting 0, sprint is locked until stamina reaches this. */
  exhaustionRecover: 25,
  /** "Low" threshold: below it the player slows down. */
  lowThreshold: 15,
  lowSpeedMul: 0.85,
  starvationDamage: 0.5,
  dehydrationDamage: 0.8,
  /** Safe-zone decay multiplier and passive HP regen (needs hunger & hydration ≥ 50). */
  safeDecayMul: 0.25,
  safeHealthRegen: 0.3,
  stimulantSprintCostMul: 0.4,
} as const;

export interface VitalsContext {
  dt: number;
  intent: MovementIntent;
  /** Standing in a safe zone. */
  inSafeZone: boolean;
  /** Not moving and not attacking (resting). */
  resting: boolean;
  /** From difficultyAt(). */
  decayMul: number;
}

export interface VitalsResult {
  vitals: PlayerVitals;
  /** Multiplier on base walk/sprint speed (0 while knocked down). */
  speedMul: number;
  /** False while exhausted (unless stimulated) or knocked down. */
  canSprint: boolean;
  /** False while knocked down (no attacks / interactions). */
  canAct: boolean;
  /** Multiplier on FOV radius (gas). */
  visionMul: number;
  /** HP lost this tick from metabolism + effects (for damage numbers / hit flash). */
  damage: number;
  died: boolean;
}

const clamp = (v: number) => (v < 0 ? 0 : v > VITALS.max ? VITALS.max : v);

export function freshVitals(): PlayerVitals {
  return { health: 100, hunger: 100, hydration: 100, stamina: 100, exhausted: false, effects: [] };
}

export function hasEffect(v: PlayerVitals, kind: StatusEffect['kind']): boolean {
  return v.effects.some((e) => e.kind === kind && e.remaining > 0);
}

/** Adds an effect; same kind+source refreshes duration and keeps the stronger magnitude. */
export function addEffect(effects: StatusEffect[], e: StatusEffect): StatusEffect[] {
  const i = effects.findIndex((o) => o.kind === e.kind && o.source === e.source);
  if (i < 0) return [...effects, { ...e }];
  const cur = effects[i];
  const stronger = e.kind === 'slow' || e.kind === 'blinded' ? Math.min(cur.magnitude, e.magnitude) : Math.max(cur.magnitude, e.magnitude);
  const next = effects.slice();
  next[i] = { ...cur, remaining: Math.max(cur.remaining, e.remaining), magnitude: stronger };
  return next;
}

export function tickVitals(v: PlayerVitals, ctx: VitalsContext): VitalsResult {
  const { dt } = ctx;
  if (v.health <= 0) {
    return { vitals: v, speedMul: 0, canSprint: false, canAct: false, visionMul: 1, damage: 0, died: false };
  }
  const stimulated = hasEffect(v, 'stimulant');
  const knocked = hasEffect(v, 'knockdown');
  const safeRest = ctx.inSafeZone && ctx.resting;
  const decay = ctx.decayMul * (ctx.inSafeZone ? VITALS.safeDecayMul : 1);

  const hunger = clamp(v.hunger - VITALS.hungerDecay * decay * dt);
  const hydration = clamp(v.hydration - VITALS.hydrationDecay * VITALS.hydrationIntentMul[ctx.intent] * decay * dt);

  // --- stamina
  const sprinting = ctx.intent === 'sprint' && !knocked && (stimulated || !v.exhausted);
  let stamina = v.stamina;
  if (sprinting) stamina -= VITALS.sprintCost * (stimulated ? VITALS.stimulantSprintCostMul : 1) * dt;
  else stamina += (safeRest ? VITALS.restRegen : VITALS.staminaRegen[ctx.intent]) * dt;
  stamina = clamp(stamina);
  let exhausted = v.exhausted;
  if (stamina <= 0 && !stimulated) exhausted = true;
  if (exhausted && (stamina >= VITALS.exhaustionRecover || stimulated)) exhausted = false;

  // --- HP from metabolism (a safe-zone rest stabilises: no starvation damage)
  let damage = 0;
  let heal = 0;
  if (!safeRest) {
    if (hunger <= 0) damage += VITALS.starvationDamage * dt;
    if (hydration <= 0) damage += VITALS.dehydrationDamage * dt;
  } else if (hunger >= 50 && hydration >= 50) {
    heal += VITALS.safeHealthRegen * dt;
  }

  // --- effects
  let speedMul = 1;
  let visionMul = 1;
  const effects: StatusEffect[] = [];
  for (const e of v.effects) {
    const active = Math.min(dt, e.remaining);
    switch (e.kind) {
      case 'poison':
        damage += e.magnitude * active;
        break;
      case 'regen':
        heal += e.magnitude * active;
        break;
      case 'slow':
        speedMul = Math.min(speedMul, e.magnitude);
        break;
      case 'blinded':
        visionMul = Math.min(visionMul, e.magnitude);
        break;
      case 'stimulant':
        speedMul *= e.magnitude;
        break;
      case 'knockdown':
        break;
    }
    const remaining = e.remaining - dt;
    if (remaining > 0) effects.push({ ...e, remaining });
  }
  if (!stimulated && (hunger < VITALS.lowThreshold || hydration < VITALS.lowThreshold)) speedMul *= VITALS.lowSpeedMul;
  if (knocked) speedMul = 0;

  const health = clamp(v.health - damage + heal);
  return {
    vitals: { health, hunger, hydration, stamina, exhausted, effects },
    speedMul,
    canSprint: !knocked && (stimulated || !exhausted) && stamina > 0,
    canAct: !knocked,
    visionMul,
    damage,
    died: health <= 0,
  };
}

/** Applies a consumable instantly (deltas) and queues its timed effects. */
export function consume(v: PlayerVitals, c: ConsumableEffect): PlayerVitals {
  let effects = v.effects;
  if (c.regen) effects = addEffect(effects, { kind: 'regen', remaining: c.regen.seconds, magnitude: c.regen.hpPerSecond, source: 'food' });
  for (const e of c.effects ?? []) effects = addEffect(effects, e);
  const stimulant = c.effects?.some((e) => e.kind === 'stimulant') ?? false;
  return {
    health: clamp(v.health + (c.health ?? 0)),
    hunger: clamp(v.hunger + (c.hunger ?? 0)),
    hydration: clamp(v.hydration + (c.hydration ?? 0)),
    stamina: clamp(v.stamina + (c.stamina ?? 0)),
    exhausted: stimulant ? false : v.exhausted,
    effects,
  };
}

/** Direct damage (bites, PvP, explosions) — knockdown etc. come in as effects. */
export function damageVitals(v: PlayerVitals, amount: number, effects: StatusEffect[] = []): PlayerVitals {
  let next = v.effects;
  for (const e of effects) next = addEffect(next, e);
  return { ...v, health: clamp(v.health - Math.max(0, amount)), effects: next };
}
