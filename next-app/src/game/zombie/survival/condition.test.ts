import { describe, expect, it } from 'vitest';
import {
  CONDITION,
  applyConsumableCondition,
  carryCapacity,
  conditionMods,
  freshCondition,
  moodlesOf,
  onHurt,
  tickCondition,
  type CharacterCondition,
  type ConditionContext,
} from './condition';
import { addXp, levelProgress, xpToNext } from './progression';
import { SLEEP, nearestRestSpot, sleepBlock, wakeReason, type RestSpot } from './sleep';
import { freshVitals, tickVitals } from './vitals';
import { ITEM_DEFS } from './inventory';

const ctx = (over: Partial<ConditionContext> = {}): ConditionContext => ({
  dt: 1,
  timeScale: 1,
  intent: 'idle',
  sleep: null,
  indoors: false,
  light: 1,
  hunters: 0,
  nearestHunterTiles: Infinity,
  safe: false,
  vitals: freshVitals(),
  load: 0,
  swings: 0,
  shots: 0,
  ...over,
});

/** Runs `seconds` of 1 s ticks. */
function run(c: CharacterCondition, seconds: number, over: Partial<ConditionContext> = {}): CharacterCondition {
  for (let i = 0; i < seconds; i++) c = tickCondition(c, ctx(over)).condition;
  return c;
}

describe('fatigue and sleep', () => {
  it('builds while awake (faster when sprinting) and drains asleep, scaled by bed quality', () => {
    const start = freshCondition();
    const idle = run(start, 600);
    const sprint = run(start, 600, { intent: 'sprint' });
    expect(idle.fatigue).toBeCloseTo(start.fatigue + CONDITION.fatigueRise * 600, 1);
    expect(sprint.fatigue).toBeGreaterThan(idle.fatigue);

    const tired = { ...start, fatigue: 80 };
    const bed = run(tired, 5, { sleep: { quality: SLEEP.quality.bed }, timeScale: SLEEP.timeScale });
    const floor = run(tired, 5, { sleep: { quality: SLEEP.quality.floor }, timeScale: SLEEP.timeScale });
    expect(bed.fatigue).toBeLessThan(floor.fatigue);
    expect(bed.fatigue).toBeCloseTo(80 - CONDITION.fatigueSleep * SLEEP.timeScale * 5, 1);
  });

  it('a full night in bed takes about half a real minute', () => {
    let c: CharacterCondition = { ...freshCondition(), fatigue: 100 };
    let t = 0;
    while (c.fatigue > 0 && t < 120) {
      c = tickCondition(c, ctx({ dt: 0.1, sleep: { quality: 1 }, timeScale: SLEEP.timeScale, indoors: true, safe: true })).condition;
      t += 0.1;
    }
    expect(t).toBeGreaterThan(20);
    expect(t).toBeLessThan(40);
  });

  it('heavy fatigue slows you, blurs vision and blocks sprinting', () => {
    const rested = conditionMods(freshCondition(), 0);
    const wrecked = conditionMods({ ...freshCondition(), fatigue: 95 }, 0);
    expect(rested.canSprint).toBe(true);
    expect(wrecked.canSprint).toBe(false);
    expect(wrecked.speedMul).toBeLessThan(0.85);
    expect(wrecked.visionMul).toBeLessThan(1);
    expect(wrecked.staminaRegenMul).toBeLessThan(rested.staminaRegenMul);
  });
});

describe('stress, panic, boredom, unhappiness', () => {
  it('panic spikes with zombies close by, fades once they are gone, and narrows vision', () => {
    const scared = run(freshCondition(), 5, { hunters: 3, nearestHunterTiles: 4 });
    expect(scared.panic).toBeGreaterThan(80);
    expect(scared.stress).toBeGreaterThan(5);
    expect(conditionMods(scared, 0).visionMul).toBeLessThan(0.85);
    const calm = run(scared, 20);
    expect(calm.panic).toBe(0);
  });

  it('getting hurt jolts panic and stress', () => {
    const c = onHurt(freshCondition(), 20);
    expect(c.panic).toBe(16);
    expect(c.stress).toBe(6);
  });

  it('boredom builds idling indoors, eases outdoors and in a fight; boredom feeds unhappiness', () => {
    const bored = run(freshCondition(), 900, { indoors: true });
    expect(bored.boredom).toBeGreaterThan(60);
    expect(bored.unhappiness).toBeGreaterThan(0);
    expect(run(bored, 300).boredom).toBeLessThan(bored.boredom);
    expect(tickCondition(bored, ctx({ indoors: true, swings: 2 })).condition.boredom).toBeLessThan(bored.boredom);
  });

  it('treats and caffeine change how you feel', () => {
    const c = { ...freshCondition(), fatigue: 70, boredom: 50, unhappiness: 50 };
    const chips = applyConsumableCondition(c, ITEM_DEFS.chips.consume);
    expect(chips.boredom).toBe(42);
    expect(chips.unhappiness).toBe(40);
    expect(applyConsumableCondition(c, ITEM_DEFS.coffee.consume).fatigue).toBe(50);
    expect(applyConsumableCondition(c, ITEM_DEFS.energy_drink.consume).fatigue).toBe(45);
  });
});

describe('body temperature and weight', () => {
  it('chills outdoors at night, stays normal indoors, and heats up sprinting by day', () => {
    const night = run(freshCondition(), 600, { light: 0 });
    const indoors = run(freshCondition(), 600, { light: 0, indoors: true });
    const sprint = run(freshCondition(), 600, { light: 1, intent: 'sprint' });
    expect(night.bodyTemp).toBeLessThan(36.2);
    expect(indoors.bodyTemp).toBeCloseTo(37, 1);
    expect(sprint.bodyTemp).toBeGreaterThan(38);
    expect(conditionMods(night, 0).hungerMul).toBeGreaterThan(1);
    expect(conditionMods(sprint, 0).hydrationMul).toBeGreaterThan(1);
  });

  it('hypothermia hurts', () => {
    const r = tickCondition({ ...freshCondition(), bodyTemp: 34.5 }, ctx({ light: 0 }));
    expect(r.damage).toBeGreaterThan(0);
  });

  it('weight drifts with how well fed you are', () => {
    const fed = run(freshCondition(), 3600);
    const starving = run(freshCondition(), 3600, { vitals: { ...freshVitals(), hunger: 10 } });
    expect(fed.bodyWeight).toBeCloseTo(CONDITION.startWeight + CONDITION.weightGainFed, 2);
    expect(starving.bodyWeight).toBeCloseTo(CONDITION.startWeight - CONDITION.weightLossStarving, 2);
  });
});

describe('fitness and strength', () => {
  it('levels on a rising XP curve', () => {
    expect(xpToNext(0)).toBe(50);
    expect(xpToNext(5)).toBeGreaterThan(xpToNext(4));
    const r = addXp({ level: 0, xp: 0 }, 60);
    expect(r).toEqual({ stat: { level: 1, xp: 10 }, leveledUp: true });
    expect(levelProgress({ level: 10, xp: 0 })).toBe(1);
    expect(addXp({ level: 10, xp: 0 }, 999).leveledUp).toBe(false);
  });

  it('sprinting trains fitness; swings and hauling train strength', () => {
    const need = xpToNext(CONDITION.startLevel);
    let c = freshCondition();
    let leveled = false;
    for (let i = 0; i < need + 5; i++) {
      const r = tickCondition(c, ctx({ intent: 'sprint' }));
      c = r.condition;
      leveled ||= r.leveled.includes('fitness');
    }
    expect(leveled).toBe(true);
    expect(c.fitness.level).toBe(CONDITION.startLevel + 1);
    const swung = tickCondition(freshCondition(), ctx({ swings: 2 })).condition;
    expect(swung.strength.xp).toBe(CONDITION.strengthXpSwing * 2);
    const hauled = tickCondition(freshCondition(), ctx({ intent: 'walk', load: 0.9 })).condition;
    expect(hauled.strength.xp).toBeCloseTo(CONDITION.strengthXpHaul);
  });

  it('fitness makes sprinting cheaper; strength raises carry capacity', () => {
    const fit = conditionMods({ ...freshCondition(), fitness: { level: 10, xp: 0 } }, 0);
    const unfit = conditionMods({ ...freshCondition(), fitness: { level: 0, xp: 0 } }, 0);
    expect(fit.sprintCostMul).toBeLessThan(unfit.sprintCostMul);
    expect(fit.staminaRegenMul).toBeGreaterThan(unfit.staminaRegenMul);
    expect(carryCapacity({ level: 0, xp: 0 })).toBe(14);
    expect(carryCapacity({ level: 5, xp: 0 })).toBe(20);
    expect(carryCapacity({ level: 10, xp: 0 })).toBe(26);
  });

  it('condition modifiers really change vitals: a heavy load slows stamina recovery', () => {
    const v = { ...freshVitals(), stamina: 50 };
    const base = { dt: 1, intent: 'idle' as const, inSafeZone: false, resting: false, decayMul: 1 };
    const light = tickVitals(v, { ...base, mods: conditionMods(freshCondition(), 0) });
    const heavy = tickVitals(v, { ...base, mods: conditionMods(freshCondition(), 0.9) });
    expect(heavy.vitals.stamina).toBeLessThan(light.vitals.stamina);
  });
});

describe('moodles', () => {
  it('show only what is active, with a severity', () => {
    expect(moodlesOf(freshCondition(), 0)).toEqual([]);
    const m = moodlesOf({ ...freshCondition(), fatigue: 88, bodyTemp: 35.4, panic: 60 }, 0.8);
    expect(m).toContainEqual({ id: 'tired', level: 3 });
    expect(m).toContainEqual({ id: 'cold', level: 2 });
    expect(m).toContainEqual({ id: 'panicked', level: 3 });
    expect(m).toContainEqual({ id: 'heavyLoad', level: 1 });
    expect(m[0].id).toBe('panicked');
  });
});

describe('sleep rules', () => {
  const spots: RestSpot[] = [
    { kind: 'sofa', x: 100, y: 100, w: 48, h: 16 },
    { kind: 'bed', x: 300, y: 100, w: 32, h: 48 },
  ];

  it('finds the bed or sofa within reach of the feet', () => {
    expect(nearestRestSpot(spots, 120, 125)?.kind).toBe('sofa');
    expect(nearestRestSpot(spots, 290, 120)?.kind).toBe('bed');
    expect(nearestRestSpot(spots, 200, 300)).toBeNull();
  });

  it('needs you tired, calm, fed and unhunted', () => {
    const v = freshVitals();
    const tired = { ...freshCondition(), fatigue: 60 };
    expect(sleepBlock(freshCondition(), v, Infinity)).toBe('notTired');
    expect(sleepBlock(tired, v, Infinity)).toBeNull();
    expect(sleepBlock(tired, v, 10)).toBe('threat');
    expect(sleepBlock({ ...tired, panic: 50 }, v, Infinity)).toBe('panic');
    expect(sleepBlock(tired, { ...v, hunger: 5 }, Infinity)).toBe('hungry');
    expect(sleepBlock(tired, { ...v, hydration: 5 }, Infinity)).toBe('thirsty');
  });

  it('wakes you when hurt, hunted, starving or rested', () => {
    const v = freshVitals();
    const asleep = { ...freshCondition(), fatigue: 40 };
    expect(wakeReason(asleep, v, Infinity, false)).toBeNull();
    expect(wakeReason(asleep, v, Infinity, true)).toBe('hurt');
    expect(wakeReason(asleep, v, 5, false)).toBe('threat');
    expect(wakeReason(asleep, { ...v, hunger: 3 }, Infinity, false)).toBe('hungry');
    expect(wakeReason({ ...asleep, fatigue: 0 }, v, Infinity, false)).toBe('rested');
  });
});
