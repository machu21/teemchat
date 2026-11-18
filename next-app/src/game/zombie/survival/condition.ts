import type { ConsumableEffect, MovementIntent, PlayerVitals } from './types';
import { BAG_MAX_WEIGHT } from './inventory';
import { addXp, type LevelStat } from './progression';
import type { IconName } from '@/lib/icons';

// ============================================================
// ZOMBIE MODE — CHARACTER CONDITION (pure, deterministic)
// The slower, Zomboid-style layer on top of vitals.ts: fatigue, stress,
// panic, boredom, unhappiness, body temperature, body weight, fitness and
// strength.
//
//   conditionMods(c, load) → multipliers fed into tickVitals / movement
//   tickCondition(c, ctx)  → advances the condition one frame
//
// Like vitals, it runs locally for the owning player and is never sent
// over the network. Rates are per second of *personal* time: `dt` is real
// seconds and `timeScale` > 1 while asleep (a night's sleep passes in
// about half a minute).
// ============================================================

export interface CharacterCondition {
  /** 0 = fully rested, 100 = about to collapse. */
  fatigue: number;
  /** 0–100. Builds while hunted, hurt or starving; eases somewhere safe. */
  stress: number;
  /** 0–100. Spikes with zombies close by, fades fast once they're gone. */
  panic: number;
  /** 0–100. Builds while idle indoors; action and exploring cure it. */
  boredom: number;
  /** 0–100. Fed by boredom, stress and hunger; tasty food and a bed help. */
  unhappiness: number;
  /** °C, 37 is normal. Follows the weather (time of day, indoors) and activity. */
  bodyTemp: number;
  /** kg. Drifts slowly with how well fed you are. */
  bodyWeight: number;
  /** 0 = dry, 100 = soaked. Rain and snow outdoors; dries indoors (world.ts weather). */
  wet: number;
  /** Stamina efficiency. Trained by sprinting and fighting. */
  fitness: LevelStat;
  /** Carry capacity. Trained by melee and hauling heavy loads. */
  strength: LevelStat;
}

export const CONDITION = {
  /** Fatigue gained per second awake (≈16 game hours from rested to 100). */
  fatigueRise: 0.042,
  fatigueIntentMul: { idle: 1, walk: 1.1, sprint: 1.5 } as Record<MovementIntent, number>,
  /** Fatigue recovered per personal second asleep, × sleep quality. */
  fatigueSleep: 0.095,

  /** Zombies chasing within this many tiles count as a threat. */
  threatTiles: 12,
  /** …and within this many they cause panic. */
  panicTiles: 7,
  stressPerHunter: 0.6,
  stressStarving: 0.1,
  stressDecay: 0.1,
  stressDecaySafe: 0.35,
  panicPerHunter: 8,
  panicDecay: 6,
  panicDecayThreat: 2,

  boredomIdleIndoors: 0.08,
  boredomWalkIndoors: 0.03,
  boredomOutdoors: -0.04,
  boredomFight: -0.3,
  boredomPerAction: -1.5,

  unhappyFromBoredom: 0.05,
  unhappyFromStress: 0.03,
  unhappyFromHunger: 0.03,
  unhappyDecay: 0.03,
  unhappyBedSleep: 0.02,
  unhappyFloorSleep: 0.01,

  normalTemp: 37,
  /** Comfortable ambient temperature (°C); every degree off shifts body temp. */
  comfortAmbient: 20,
  ambientCoupling: 0.09,
  indoorAmbient: 20,
  nightAmbient: 9,
  dayAmbient: 22,
  activityHeat: { idle: 0, walk: 0.4, sprint: 1.4 } as Record<MovementIntent, number>,
  sleepHeat: -0.3,
  /** How fast body temp follows its target (per second). */
  tempRate: 0.01,
  /** Hypothermia / hyperthermia HP loss per second past the limits. */
  coldLimit: 35,
  heatLimit: 39.5,
  tempDamage: 0.15,

  /** Wetness per real second in full precipitation outdoors (a storm soaks you in under 2 min). */
  wetRise: 1,
  /** Drying per personal second indoors / outdoors when it isn't raining. */
  dryIndoors: 0.25,
  dryOutdoors: 0.1,
  /** °C of chill when soaked; wet clothes also lose half their warmth. */
  wetChill: 8,
  unhappyWet: 0.012,

  startWeight: 80,
  /** kg per game day (3600 personal seconds). */
  weightGainFed: 0.6,
  weightLossStarving: 1,
  weightLossSprint: 0.4,
  minWeight: 45,
  maxWeight: 130,

  startLevel: 5,
  /** XP per second sprinting / per melee swing / per second hauling a heavy load. */
  fitnessXpSprint: 1,
  fitnessXpSwing: 0.5,
  strengthXpSwing: 3,
  strengthXpHaul: 0.3,
  /** Load fraction (bag weight / capacity) that counts as heavy. */
  heavyLoad: 0.75,
} as const;

const DAY_SECONDS = 3600;

const clamp = (v: number, lo = 0, hi = 100) => (v < lo ? lo : v > hi ? hi : v);

export function freshCondition(): CharacterCondition {
  return {
    fatigue: 10,
    stress: 0,
    panic: 0,
    boredom: 0,
    unhappiness: 0,
    bodyTemp: CONDITION.normalTemp,
    bodyWeight: CONDITION.startWeight,
    wet: 0,
    fitness: { level: CONDITION.startLevel, xp: 0 },
    strength: { level: CONDITION.startLevel, xp: 0 },
  };
}

/** Bag weight limit (kg): 14 kg at strength 0, 20 at 5, 26 at 10. */
export function carryCapacity(strength: LevelStat): number {
  return Math.round(BAG_MAX_WEIGHT * (0.7 + 0.06 * strength.level) * 10) / 10;
}

// ---------------------------------------------------------------- modifiers

export interface ConditionMods {
  /** Movement speed multiplier. */
  speedMul: number;
  staminaRegenMul: number;
  sprintCostMul: number;
  hungerMul: number;
  hydrationMul: number;
  /** FOV radius multiplier (tired eyes, tunnel vision). */
  visionMul: number;
  /** False when too tired to sprint. */
  canSprint: boolean;
}

/** What the current condition does to the body this frame. `load` = bag weight / capacity. */
export function conditionMods(c: CharacterCondition, load: number): ConditionMods {
  let speed = 1;
  let regen = 1;
  let sprintCost = 1;
  let hunger = 1;
  let hydration = 1;
  let vision = 1;
  let canSprint = true;

  // Fitness: level 5 is neutral
  sprintCost *= 1.25 - 0.05 * c.fitness.level;
  regen *= 0.8 + 0.04 * c.fitness.level;

  if (c.fatigue >= 50) regen *= 0.8;
  if (c.fatigue >= 75) {
    speed *= 0.92;
    vision *= 0.9;
  }
  if (c.fatigue >= 90) {
    speed *= 0.88;
    canSprint = false;
  }

  if (c.stress >= 50) regen *= 0.85;
  // Tunnel vision: up to −25 % view radius at full panic
  if (c.panic >= 25) vision *= 1 - (0.25 * (c.panic - 25)) / 75;

  if (c.unhappiness >= 50) regen *= 0.9;
  if (c.unhappiness >= 75) speed *= 0.93;

  if (c.bodyTemp < 36.2) hunger *= 1.25;
  if (c.bodyTemp < 35.5) {
    speed *= 0.92;
    regen *= 0.85;
  }
  if (c.bodyTemp > 38) hydration *= 1.4;
  if (c.bodyTemp > 39) regen *= 0.8;

  if (c.bodyWeight < 70) regen *= 0.9;
  if (c.bodyWeight < 60) speed *= 0.95;
  if (c.bodyWeight > 95) sprintCost *= 1.15;
  if (c.bodyWeight > 105) sprintCost *= 1.15;

  if (load > CONDITION.heavyLoad) {
    regen *= 0.75;
    sprintCost *= 1.2;
  }
  // Over the limit: every 10 % over costs 15 % speed (never below half)
  if (load > 1) speed *= Math.max(0.5, 1 - (load - 1) * 1.5);

  return { speedMul: speed, staminaRegenMul: regen, sprintCostMul: sprintCost, hungerMul: hunger, hydrationMul: hydration, visionMul: vision, canSprint };
}

// ---------------------------------------------------------------- tick

export interface ConditionContext {
  /** Real seconds this frame. */
  dt: number;
  /** Personal time multiplier: 1 awake, SLEEP.timeScale asleep. */
  timeScale: number;
  /** What the body actually did (sprint only when really sprinting). */
  intent: MovementIntent;
  /** Asleep, and how good the bed is (0–1). */
  sleep: { quality: number } | null;
  indoors: boolean;
  /** Daylight 0–1 (daycycle.ts). */
  light: number;
  /** Air temperature where you are (°C, world.ts); without it, a mild default from `light`. */
  ambient?: number;
  /** 0–1 rain or snow falling on you (0 indoors). */
  precipitation?: number;
  /** Zombies chasing or attacking within CONDITION.threatTiles. */
  hunters: number;
  /** Tiles to the nearest chasing zombie (Infinity when none). */
  nearestHunterTiles: number;
  /** Indoors with nothing hunting nearby. */
  safe: boolean;
  vitals: PlayerVitals;
  /** Bag weight / capacity. */
  load: number;
  /** Melee swings this frame. */
  swings: number;
  /** Shots fired this frame. */
  shots: number;
  /** °C of warmth from worn clothes (a winter jacket is about 8). */
  insulation?: number;
  /** Survivor traits (survivor.ts): learning, tiring, panicking, feeling the weather. */
  learnMul?: number;
  fatigueMul?: number;
  panicMul?: number;
  exposureMul?: number;
}

export interface ConditionResult {
  condition: CharacterCondition;
  /** HP lost to hypo- / hyperthermia this frame. */
  damage: number;
  /** Stats that gained a level this frame. */
  leveled: ('fitness' | 'strength')[];
}

export function ambientTemp(indoors: boolean, light: number): number {
  return indoors ? CONDITION.indoorAmbient : CONDITION.nightAmbient + (CONDITION.dayAmbient - CONDITION.nightAmbient) * light;
}

export function tickCondition(c: CharacterCondition, ctx: ConditionContext): ConditionResult {
  const K = CONDITION;
  const { intent, sleep } = ctx;
  const dt = Math.max(0, ctx.dt);
  // Personal seconds (fast-forwarded while asleep)
  const s = dt * ctx.timeScale;
  const v = ctx.vitals;

  // --- fatigue
  let fatigue = c.fatigue;
  if (sleep) {
    fatigue -= K.fatigueSleep * sleep.quality * s;
  } else {
    let rise = K.fatigueRise * K.fatigueIntentMul[intent] * (ctx.fatigueMul ?? 1);
    if (c.unhappiness >= 50) rise *= 1.15;
    if (c.stress >= 60) rise *= 1.15;
    fatigue += rise * s;
  }

  // --- stress & panic
  const threatened = ctx.hunters > 0 && ctx.nearestHunterTiles <= K.threatTiles;
  const close = ctx.hunters > 0 && ctx.nearestHunterTiles <= K.panicTiles;
  let stress = c.stress;
  if (threatened) stress += K.stressPerHunter * Math.min(ctx.hunters, 5) * dt;
  if (v.hunger < 15 || v.hydration < 15) stress += K.stressStarving * dt;
  if (!threatened) stress -= (ctx.safe ? K.stressDecaySafe : K.stressDecay) * s;

  let panic = c.panic;
  if (close) panic += K.panicPerHunter * Math.min(ctx.hunters, 4) * (ctx.panicMul ?? 1) * dt;
  else panic -= (threatened ? K.panicDecayThreat : K.panicDecay) * s;

  // --- boredom
  const actions = ctx.swings + ctx.shots;
  let boredom = c.boredom;
  if (!sleep) {
    if (threatened) boredom += K.boredomFight * dt;
    else if (!ctx.indoors) boredom += K.boredomOutdoors * dt;
    else boredom += (intent === 'idle' ? K.boredomIdleIndoors : K.boredomWalkIndoors) * dt;
    boredom += K.boredomPerAction * actions;
  }

  // --- unhappiness
  let unhappy = c.unhappiness;
  if (c.boredom > 40) unhappy += (K.unhappyFromBoredom * (c.boredom - 40)) / 60 * dt;
  if (c.stress > 60) unhappy += K.unhappyFromStress * dt;
  if (v.hunger < 25 || v.hydration < 25) unhappy += K.unhappyFromHunger * dt;
  // --- wetness
  const rainOn = ctx.indoors ? 0 : ctx.precipitation ?? 0;
  const prevWet = c.wet ?? 0;
  let wet = prevWet;
  if (rainOn > 0) wet += K.wetRise * rainOn * dt;
  else wet -= (ctx.indoors ? K.dryIndoors : K.dryOutdoors) * s;
  if (prevWet > 40) unhappy += K.unhappyWet * dt;

  if (sleep) {
    // A real bed lifts the mood; a night on the floor doesn't
    if (sleep.quality >= 0.75) unhappy -= K.unhappyBedSleep * sleep.quality * s;
    else unhappy += K.unhappyFloorSleep * s;
  } else if (ctx.safe && v.hunger >= 60 && v.hydration >= 60 && c.boredom < 40) {
    unhappy -= K.unhappyDecay * s;
  }

  // --- body temperature (exponential approach, stable at any timeScale)
  const activity = sleep ? K.sleepHeat : K.activityHeat[intent];
  const wetFrac = clamp(wet) / 100;
  const felt =
    (ctx.ambient ?? ambientTemp(ctx.indoors, ctx.light)) + (ctx.insulation ?? 0) * (1 - wetFrac / 2) - K.wetChill * wetFrac;
  const target = K.normalTemp + (felt - K.comfortAmbient) * K.ambientCoupling * (ctx.exposureMul ?? 1) + activity;
  const bodyTemp = c.bodyTemp + (target - c.bodyTemp) * (1 - Math.exp(-K.tempRate * s));
  let damage = 0;
  if (bodyTemp < K.coldLimit || bodyTemp > K.heatLimit) damage = K.tempDamage * s;

  // --- body weight (per game day)
  let weight = c.bodyWeight;
  if (v.hunger >= 75) weight += (K.weightGainFed / DAY_SECONDS) * s;
  else if (v.hunger <= 25) weight -= (K.weightLossStarving / DAY_SECONDS) * s;
  if (intent === 'sprint' && !sleep) weight -= (K.weightLossSprint / DAY_SECONDS) * dt;

  // --- fitness & strength XP
  const leveled: ConditionResult['leveled'] = [];
  let fitness = c.fitness;
  let strength = c.strength;
  if (!sleep) {
    const fitXp = (intent === 'sprint' ? K.fitnessXpSprint * dt : 0) + K.fitnessXpSwing * ctx.swings;
    const strXp = K.strengthXpSwing * ctx.swings + (ctx.load > K.heavyLoad && intent !== 'idle' ? K.strengthXpHaul * dt : 0);
    const f = addXp(fitness, fitXp, ctx.learnMul ?? 1);
    const st = addXp(strength, strXp, ctx.learnMul ?? 1);
    fitness = f.stat;
    strength = st.stat;
    if (f.leveledUp) leveled.push('fitness');
    if (st.leveledUp) leveled.push('strength');
  }

  return {
    condition: {
      fatigue: clamp(fatigue),
      stress: clamp(stress),
      panic: clamp(panic),
      boredom: clamp(boredom),
      unhappiness: clamp(unhappy),
      bodyTemp,
      bodyWeight: clamp(weight, K.minWeight, K.maxWeight),
      wet: clamp(wet),
      fitness,
      strength,
    },
    damage,
    leveled,
  };
}

// ---------------------------------------------------------------- events

/** Food, drink and meds also change how you feel. */
export function applyConsumableCondition(c: CharacterCondition, e: ConsumableEffect | undefined): CharacterCondition {
  if (!e) return c;
  return {
    ...c,
    fatigue: clamp(c.fatigue + (e.fatigue ?? 0)),
    boredom: clamp(c.boredom + (e.boredom ?? 0)),
    unhappiness: clamp(c.unhappiness + (e.unhappiness ?? 0)),
    stress: clamp(c.stress + (e.stress ?? 0)),
    // Hot food warms you up when you're cold (never past normal)
    bodyTemp: e.warmth && c.bodyTemp < CONDITION.normalTemp ? Math.min(CONDITION.normalTemp, c.bodyTemp + e.warmth) : c.bodyTemp,
  };
}

/** Getting hurt: a jolt of panic and stress. */
export function onHurt(c: CharacterCondition, amount: number): CharacterCondition {
  if (amount <= 0) return c;
  return {
    ...c,
    stress: clamp(c.stress + amount * 0.3),
    panic: clamp(c.panic + amount * 0.8),
    unhappiness: clamp(c.unhappiness + 1),
  };
}

/** Woken by a threat: the adrenaline hits at once. */
export function startle(c: CharacterCondition): CharacterCondition {
  return { ...c, panic: clamp(c.panic + 40), stress: clamp(c.stress + 10) };
}

// ---------------------------------------------------------------- moodles

export type MoodleId =
  | 'tired'
  | 'stressed'
  | 'panicked'
  | 'bored'
  | 'unhappy'
  | 'cold'
  | 'hot'
  | 'underweight'
  | 'overweight'
  | 'heavyLoad'
  | 'wet'
  // Body (survival/body.ts)
  | 'bleeding'
  | 'pain'
  | 'fracture'
  | 'sick';

export interface Moodle {
  id: MoodleId;
  /** Severity 1–4. */
  level: number;
}

export const MOODLE_INFO: Record<MoodleId, { label: string; icon: IconName; hint: string }> = {
  tired: { label: 'Tired', icon: 'moon', hint: 'Slower stamina; very tired slows you and blocks sprinting. Sleep it off.' },
  stressed: { label: 'Stressed', icon: 'brain', hint: 'Slower stamina recovery. Calms down somewhere safe.' },
  panicked: { label: 'Panicked', icon: 'heartPulse', hint: 'Tunnel vision. Fades once the zombies are gone.' },
  bored: { label: 'Bored', icon: 'hourglass', hint: 'Makes you unhappy. Go outside, fight, or snack.' },
  unhappy: { label: 'Unhappy', icon: 'frown', hint: 'Tires you faster; depression slows you. Tasty food and a bed help.' },
  cold: { label: 'Cold', icon: 'thermometerSnowflake', hint: 'Burns food faster; freezing slows you and hurts. Get indoors.' },
  hot: { label: 'Hot', icon: 'thermometerSun', hint: 'Thirst rises faster; overheating hurts. Stop sprinting.' },
  underweight: { label: 'Underweight', icon: 'weight', hint: 'Less stamina recovery. Eat well to put weight on.' },
  overweight: { label: 'Overweight', icon: 'weight', hint: 'Sprinting costs more stamina.' },
  wet: { label: 'Wet', icon: 'cloudRain', hint: 'Soaked clothes chill you and lose their warmth. Dry off indoors.' },
  heavyLoad: { label: 'Heavy load', icon: 'backpack', hint: 'Stamina recovers slower and sprinting costs more; over the limit you slow right down.' },
  bleeding: { label: 'Bleeding', icon: 'droplets', hint: 'Losing health and no natural healing. Bandage the wound.' },
  pain: { label: 'Pain', icon: 'activity', hint: 'Slower stamina, shakier aim; severe pain slows you. Painkillers help.' },
  fracture: { label: 'Fracture', icon: 'bone', hint: 'Broken leg: slow, no jumping or sprinting. Broken arm: weak swings. Splint it.' },
  sick: { label: 'Sick', icon: 'thermometer', hint: "Something is very wrong. Rest won't fix it." },
};

/** Level 0–4 for a value against ascending thresholds. */
function rank(v: number, t: readonly [number, number, number, number]): number {
  let l = 0;
  for (const x of t) if (v >= x) l++;
  return l;
}

export function moodlesOf(c: CharacterCondition, load: number): Moodle[] {
  const out: Moodle[] = [];
  const push = (id: MoodleId, level: number) => {
    if (level > 0) out.push({ id, level });
  };
  push('panicked', rank(c.panic, [10, 30, 55, 80]));
  push('tired', rank(c.fatigue, [50, 70, 85, 95]));
  push('stressed', rank(c.stress, [25, 50, 75, 90]));
  push('unhappy', rank(c.unhappiness, [40, 60, 75, 90]));
  push('bored', rank(c.boredom, [40, 60, 75, 90]));
  push('cold', rank(-c.bodyTemp, [-36.2, -35.5, -35, -34]));
  push('hot', rank(c.bodyTemp, [37.8, 38.5, 39.5, 40.5]));
  push('underweight', rank(-c.bodyWeight, [-75, -70, -60, -50]));
  push('overweight', rank(c.bodyWeight, [90, 95, 105, 115]));
  push('wet', rank(c.wet ?? 0, [15, 40, 70, 90]));
  push('heavyLoad', rank(load, [CONDITION.heavyLoad, 0.9, 1.0001, 1.15]));
  return out;
}
