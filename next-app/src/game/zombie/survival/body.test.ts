import { describe, expect, it } from 'vitest';
import {
  BODY,
  BODY_PARTS,
  bodyMoodles,
  bodyPain,
  canTreat,
  freshBody,
  infectionStage,
  injure,
  tickBody,
  treat,
  type BodyState,
  type Wound,
} from './body';
import { DEFAULT_TRAIT_ODDS, NORMAL_TRAITS, PACKED_NORMAL, packTraits, rollTraits, traitMul, unpackTraits } from './zombieTraits';
import { HEAVY_ATTACK, MELEE_ORDER, WEAPONS, isMelee, meleeMultiplier, shotAngles } from '../weapons';
import { mulberry32 } from '../../art/character/appearance';

/** A roll source that returns the given values in order (then repeats the last). */
const rolls = (...v: number[]) => {
  let i = 0;
  return () => v[Math.min(i++, v.length - 1)];
};

const wound = (over: Partial<Wound> = {}): Wound => ({
  id: 1,
  part: 'leftArm',
  kind: 'laceration',
  bleeding: true,
  bandaged: false,
  bandageAge: 0,
  disinfected: false,
  sepsis: 0,
  age: 0,
  healLeft: BODY.healSeconds.laceration,
  ...over,
});
const withWounds = (...w: Wound[]): BodyState => ({ ...freshBody(), wounds: w, nextId: w.length + 1 });

function run(b: BodyState, seconds: number, step = 1) {
  let damage = 0;
  let last = tickBody(b, { dt: 0, timeScale: 1 });
  for (let t = 0; t < seconds; t += step) {
    last = tickBody(last.body, { dt: step, timeScale: 1 });
    damage += last.damage;
  }
  return { ...last, damage };
}

describe('injuries', () => {
  it('a zombie hit lands on a body part, mostly arms and hands, as a scratch, laceration or bite', () => {
    const rng = mulberry32(42);
    const parts: Record<string, number> = {};
    const kinds: Record<string, number> = {};
    let b = freshBody();
    for (let i = 0; i < 4000; i++) {
      const r = injure(freshBody(), rng, 'zombie');
      parts[r.part] = (parts[r.part] ?? 0) + 1;
      kinds[r.wound!.kind] = (kinds[r.wound!.kind] ?? 0) + 1;
      if (i < 3) b = injure(b, rng, 'zombie').body;
    }
    expect(Object.keys(parts).sort()).toEqual([...BODY_PARTS].sort());
    const arms = parts.leftArm + parts.rightArm + parts.leftHand + parts.rightHand;
    expect(arms / 4000).toBeGreaterThan(0.45);
    expect(kinds.scratch).toBeGreaterThan(kinds.laceration);
    expect(kinds.laceration).toBeGreaterThan(kinds.bite);
    expect(b.wounds.map((w) => w.id)).toEqual([1, 2, 3]);
  });

  it('neck and head hits hurt more than a hand', () => {
    // roll 0 → first part in the weight table (head); 0.999 → last (right foot)
    expect(injure(freshBody(), rolls(0, 0.5, 0.99), 'zombie').damageMul).toBe(1.5);
    expect(injure(freshBody(), rolls(0.999, 0.5, 0.99), 'zombie').damageMul).toBe(0.6);
  });

  it('a bite usually carries the infection; a scratch rarely does', () => {
    // part, kind (0.95 → bite), infection roll
    const bite = injure(freshBody(), rolls(0.3, 0.95, 0.5), 'zombie');
    expect(bite.wound!.kind).toBe('bite');
    expect(bite.infected).toBe(true);
    expect(bite.body.infection).toEqual({ progress: 0 });
    const scratch = injure(freshBody(), rolls(0.3, 0.1, 0.5), 'zombie');
    expect(scratch.wound!.kind).toBe('scratch');
    expect(scratch.infected).toBe(false);
  });

  it('a charger impact can break an arm or a leg', () => {
    const r = injure(freshBody(), rolls(0, 0.1), 'impact');
    expect(r.fracture).toMatchObject({ splinted: false });
    expect(['leftArm', 'rightArm', 'leftLeg', 'rightLeg']).toContain(r.part);
    expect(injure(freshBody(), rolls(0, 0.9), 'impact').fracture).toBeNull();
  });
});

describe('bleeding, healing and treatment', () => {
  it('an open laceration bleeds until bandaged, and blocks natural healing', () => {
    const open = run(withWounds(wound()), 10);
    expect(open.damage).toBeCloseTo(BODY.bleedRate.laceration * 10, 1);
    expect(open.mods.canRegen).toBe(false);
    const { body } = treat(withWounds(wound()), 'bandage');
    const wrapped = run(body, 10);
    expect(wrapped.damage).toBe(0);
    expect(wrapped.mods.canRegen).toBe(true);
  });

  it('scratches clot on their own; deep wounds heal much slower unbandaged', () => {
    const s = run(withWounds(wound({ kind: 'scratch', healLeft: BODY.healSeconds.scratch })), BODY.scratchClotSeconds + 2);
    expect(s.body.wounds[0].bleeding).toBe(false);
    const open = run(withWounds(wound({ bleeding: false })), 100).body.wounds[0].healLeft;
    const wrapped = run(withWounds(wound({ bleeding: false, bandaged: true, disinfected: true })), 100).body.wounds[0].healLeft;
    expect(BODY.healSeconds.laceration - wrapped).toBeCloseTo(100, 0);
    expect(BODY.healSeconds.laceration - open).toBeCloseTo(100 * BODY.unbandagedHealMul, 0);
  });

  it('wounds heal completely, faster while asleep', () => {
    const b = withWounds(wound({ bleeding: false, bandaged: true, disinfected: true, healLeft: 30 }));
    const r = tickBody(b, { dt: 1, timeScale: 40 });
    expect(r.body.wounds).toEqual([]);
    expect(r.healed).toHaveLength(1);
  });

  it('undisinfected wounds fester (pain, no healing); disinfectant clears it', () => {
    const fester = run(withWounds(wound({ bleeding: false, bandaged: true })), 400, 5);
    expect(fester.body.wounds[0].sepsis).toBeGreaterThan(BODY.sepsisStopsHealing);
    const stuck = fester.body.wounds[0].healLeft;
    expect(run(fester.body, 50, 5).body.wounds[0].healLeft).toBeCloseTo(stuck, 5);
    expect(canTreat(fester.body, 'disinfect')).toBe(true);
    const clean = treat(fester.body, 'disinfect').body;
    expect(clean.wounds[0]).toMatchObject({ sepsis: 0, disinfected: true });
    expect(bodyPain(clean)).toBeLessThan(bodyPain(fester.body));
  });

  it('bandages bleeding wounds first, and a dirty bandage can be changed', () => {
    const b = withWounds(wound({ id: 1, kind: 'scratch', bleeding: false }), wound({ id: 2, kind: 'bite', part: 'neck' }));
    expect(treat(b, 'bandage').part).toBe('neck');
    const dirty = withWounds(wound({ bleeding: false, bandaged: true, bandageAge: BODY.bandageDirtySeconds + 1 }));
    expect(canTreat(dirty, 'bandage')).toBe(true);
    expect(treat(dirty, 'bandage').body.wounds[0].bandageAge).toBe(0);
    expect(canTreat(freshBody(), 'bandage')).toBe(false);
    expect(canTreat(freshBody(), 'disinfect')).toBe(false);
    expect(treat(freshBody(), 'splint').part).toBeNull();
  });

  it('a broken leg slows you and stops jumping and sprinting; a splint helps', () => {
    const broken: BodyState = { ...freshBody(), fractures: [{ part: 'leftLeg', splinted: false, healLeft: BODY.fractureSeconds }] };
    const r = tickBody(broken, { dt: 0, timeScale: 1 });
    expect(r.mods).toMatchObject({ canJump: false, canSprint: false });
    expect(r.mods.speedMul).toBeCloseTo(0.6);
    const splinted = tickBody(treat(broken, 'splint').body, { dt: 0, timeScale: 1 });
    expect(splinted.mods).toMatchObject({ canJump: false, canSprint: true });
    expect(splinted.mods.speedMul).toBeCloseTo(0.8);
    expect(splinted.pain).toBeLessThan(r.pain);
  });

  it('a broken arm weakens swings and shakes the aim', () => {
    const r = tickBody({ ...freshBody(), fractures: [{ part: 'rightArm', splinted: false, healLeft: 100 }] }, { dt: 0, timeScale: 1 });
    expect(r.mods.meleeMul).toBe(0.5);
    expect(r.mods.spreadMul).toBeGreaterThan(1);
  });

  it('painkillers dull the pain for a while', () => {
    const b = withWounds(wound({ kind: 'bite', bandaged: true, bleeding: false, disinfected: true }), wound({ id: 2, part: 'torso', bandaged: true, bleeding: false, disinfected: true }));
    const before = bodyPain(b);
    const dosed = treat(b, 'painkiller').body;
    expect(bodyPain(dosed)).toBeCloseTo(before * BODY.painkillerMul);
    expect(bodyPain(run(dosed, BODY.painkillerSeconds + 5, 5).body)).toBeGreaterThan(before * 0.5);
  });
});

describe('the infection', () => {
  it('hides, then makes you sick, then kills you', () => {
    let b: BodyState = { ...freshBody(), infection: { progress: 0 } };
    expect(infectionStage(b)).toBe('incubating');
    expect(bodyMoodles(b, 0)).toEqual([]);
    b = run(b, BODY.infectionSeconds * 0.4, 10).body;
    expect(infectionStage(b)).toBe('queasy');
    expect(bodyMoodles(b, 0)).toContainEqual({ id: 'sick', level: 1 });
    const fever = run(b, BODY.infectionSeconds * 0.25, 10);
    expect(fever.stage).toBe('feverish');
    expect(fever.mods.canRegen).toBe(false);
    const end = run(fever.body, BODY.infectionSeconds * 0.4, 10);
    expect(end.stage).toBe('terminal');
    expect(end.damage).toBeGreaterThan(100);
  });
});

describe('body moodles', () => {
  it('bleeding, pain and fractures show with a severity', () => {
    const b: BodyState = { ...withWounds(wound({ kind: 'bite' }), wound({ id: 2 })), fractures: [{ part: 'leftLeg', splinted: false, healLeft: 10 }] };
    const m = bodyMoodles(b, bodyPain(b));
    expect(m.find((x) => x.id === 'bleeding')?.level).toBe(3);
    expect(m.find((x) => x.id === 'fracture')?.level).toBe(3);
    expect(m.find((x) => x.id === 'pain')?.level).toBeGreaterThanOrEqual(3);
  });
});

describe('zombie traits', () => {
  it('pack and unpack round-trip', () => {
    expect(packTraits(NORMAL_TRAITS)).toBe(PACKED_NORMAL);
    const t = { speed: 2, strength: 0, sight: 1, hearing: 2, toughness: 0 } as const;
    expect(unpackTraits(packTraits(t))).toEqual(t);
  });

  it('most zombies are average, a few are sprinters', () => {
    const rng = mulberry32(9);
    let fast = 0;
    let normal = 0;
    for (let i = 0; i < 5000; i++) {
      const t = rollTraits(rng, DEFAULT_TRAIT_ODDS);
      if (t.speed === 2) fast++;
      if (t.speed === 1) normal++;
    }
    expect(fast / 5000).toBeCloseTo(DEFAULT_TRAIT_ODDS.speed[2], 1);
    expect(normal / 5000).toBeGreaterThan(0.55);
    expect(traitMul({ ...NORMAL_TRAITS, speed: 2 }, 'speed')).toBeGreaterThan(1.4);
    expect(traitMul(undefined, 'sight')).toBe(1);
  });
});

describe('melee weapons', () => {
  it('every melee weapon has handling stats; guns do not', () => {
    for (const w of MELEE_ORDER) {
      expect(isMelee(w)).toBe(true);
      expect(WEAPONS[w].slot).toBe(1);
      expect(WEAPONS[w].melee!.stamina).toBeGreaterThan(0);
    }
    expect(isMelee('pistol')).toBe(false);
    expect(WEAPONS.fists.melee!.durability).toBe(Infinity);
    expect(WEAPONS.crowbar.melee!.durability).toBeGreaterThan(WEAPONS.plank.melee!.durability);
  });

  it('strength, fatigue, injuries, winded swings, power attacks and crits all count', () => {
    const base = { strengthLevel: 5, bodyMul: 1, tired: false, winded: false, heavy: false, crit: false };
    expect(meleeMultiplier(base)).toBeCloseTo(1);
    expect(meleeMultiplier({ ...base, strengthLevel: 10 })).toBeCloseTo(1.2);
    expect(meleeMultiplier({ ...base, tired: true })).toBeCloseTo(0.85);
    expect(meleeMultiplier({ ...base, winded: true })).toBeCloseTo(0.5);
    expect(meleeMultiplier({ ...base, bodyMul: 0.5 })).toBeCloseTo(0.5);
    expect(meleeMultiplier({ ...base, heavy: true })).toBeCloseTo(HEAVY_ATTACK.damageMul);
    expect(meleeMultiplier({ ...base, crit: true })).toBeCloseTo(2);
  });

  it('a spread multiplier widens the shot cone (panic, pain)', () => {
    const spread = (mul: number) => {
      const rng = mulberry32(3);
      let max = 0;
      for (let i = 0; i < 200; i++) max = Math.max(max, Math.abs(shotAngles(WEAPONS.pistol, 0, rng, mul)[0]));
      return max;
    };
    expect(spread(2)).toBeGreaterThan(spread(1) * 1.7);
  });
});
