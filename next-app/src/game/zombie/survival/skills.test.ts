import { describe, expect, it } from 'vitest';
import {
  SKILLS,
  SKILL_IDS,
  aimSpreadMul,
  barricadeTimeMul,
  bookMultiplier,
  firstAidHealMul,
  freshSkills,
  reloadTimeMul,
  repairAmount,
  trainSkill,
  wearChance,
} from './skills';
import {
  OCCUPATIONS,
  TRAITS,
  TRAIT_ORDER,
  buildErrors,
  canAddTrait,
  parseBuild,
  pointsLeft,
  startingStats,
  survivorModifiers,
  type SurvivorBuild,
} from './survivor';
import { ITEM_DEFS } from './inventory';
import { xpToNext } from './progression';

const ctx = { learnMul: 1, combatMul: 1, books: {} };

describe('skills', () => {
  it('the fourteen skills from the brief, all starting at level 0', () => {
    expect(SKILL_IDS).toHaveLength(14);
    const s = freshSkills({ aiming: 3, carpentry: 12 });
    expect(s.aiming.level).toBe(3);
    expect(s.carpentry.level).toBe(10);
    expect(s.cooking.level).toBe(0);
  });

  it('XP levels a skill; Fast Learner, Pacifist and books change the rate', () => {
    const need = xpToNext(0);
    expect(trainSkill(freshSkills(), 'aiming', need, ctx).set.aiming.level).toBe(1);
    expect(trainSkill(freshSkills(), 'aiming', need / 2, ctx).leveledUp).toBe(false);
    expect(trainSkill(freshSkills(), 'aiming', need / 1.3 + 0.01, { ...ctx, learnMul: 1.3 }).leveledUp).toBe(true);
    // Pacifist only slows weapon skills
    expect(trainSkill(freshSkills(), 'aiming', need, { ...ctx, combatMul: 0.75 }).leveledUp).toBe(false);
    expect(trainSkill(freshSkills(), 'firstAid', need, { ...ctx, combatMul: 0.75 }).leveledUp).toBe(true);
    // Vol. 1 triples XP at low levels
    expect(trainSkill(freshSkills(), 'carpentry', need / 3 + 0.01, { ...ctx, books: { carpentry: [1] } }).leveledUp).toBe(true);
  });

  it('books cover their level ranges', () => {
    expect(bookMultiplier([1], 0)).toBe(3);
    expect(bookMultiplier([1], 5)).toBe(1);
    expect(bookMultiplier([1, 2], 7)).toBe(2.5);
    expect(bookMultiplier(undefined, 2)).toBe(1);
  });

  it('every skill has two books, and books are real items', () => {
    for (const id of SKILL_IDS) {
      expect(ITEM_DEFS[`book:${id}:1`].consume?.skillBook).toEqual({ skill: id, volume: 1 });
      expect(ITEM_DEFS[`book:${id}:2`].name).toBe(`${SKILLS[id].label} Vol. 2`);
    }
  });

  it('higher levels mean tighter aim, faster reloads and board-ups, less wear, faster healing, better repairs', () => {
    expect(aimSpreadMul(10)).toBeLessThan(aimSpreadMul(0));
    expect(reloadTimeMul(10)).toBeLessThan(reloadTimeMul(0));
    expect(barricadeTimeMul(10)).toBeLessThan(barricadeTimeMul(0));
    expect(wearChance(0)).toBe(1);
    expect(wearChance(10)).toBeCloseTo(0.4);
    expect(firstAidHealMul(10)).toBeCloseTo(1.8);
    expect(repairAmount(10)).toBeCloseTo(0.5);
  });

  it('every skill can be practised now (Phase 7 added the last ones) and says how', () => {
    for (const id of SKILL_IDS) {
      expect(SKILLS[id].practisable, id).toBe(true);
      expect(SKILLS[id].practice, id).not.toMatch(/no way/i);
    }
  });
});

describe('survivor builds', () => {
  const build = (over: Partial<SurvivorBuild> = {}): SurvivorBuild => ({ name: 'Ana', occupation: 'unemployed', traits: [], ...over });

  it('occupations set the budget; good traits spend it, bad traits refund it', () => {
    expect(pointsLeft(build())).toBe(8);
    expect(pointsLeft(build({ traits: ['strong'] }))).toBe(2);
    expect(pointsLeft(build({ occupation: 'veteran', traits: ['weak', 'cowardly'] }))).toBe(1);
    expect(buildErrors(build({ traits: ['strong', 'athletic'] }))).toContain('Not enough trait points.');
    expect(buildErrors(build({ occupation: 'veteran', traits: ['weak', 'cowardly'] }))).toEqual([]);
  });

  it('opposite traits cannot be combined; names are required', () => {
    expect(buildErrors(build({ traits: ['strong', 'weak'] })).join()).toMatch(/can't be combined/);
    expect(buildErrors(build({ name: '  ' }))).toContain('Give your survivor a name.');
    expect(canAddTrait(build({ traits: ['strong'] }), 'weak')).toBe(false);
    expect(canAddTrait(build({ traits: ['strong'] }), 'athletic')).toBe(false); // too expensive
    expect(canAddTrait(build({ traits: ['strong'] }), 'slowLearner')).toBe(true);
    // Every exclusion is mutual
    for (const t of TRAIT_ORDER) for (const x of TRAITS[t].excludes ?? []) expect(TRAITS[x].excludes).toContain(t);
  });

  it('starting stats: occupation and traits shape fitness, strength and skills', () => {
    const fire = startingStats(build({ occupation: 'fireOfficer', traits: ['strong'] }));
    expect(fire.strength).toBe(9);
    expect(fire.fitness).toBe(6);
    const cop = startingStats(build({ occupation: 'policeOfficer', traits: ['outOfShape'] }));
    expect(cop.skills.aiming.level).toBe(3);
    expect(cop.skills.reloading.level).toBe(2);
    expect(cop.fitness).toBe(2);
    expect(OCCUPATIONS.carpenter.items.map((i) => i.def)).toContain('weapon:hammer');
  });

  it('modifiers fold traits together; veterans never panic', () => {
    const m = survivorModifiers(build({ traits: ['lightEater', 'fastLearner', 'thickSkinned', 'organized', 'proneToIllness'] }));
    expect(m).toMatchObject({ hungerMul: 0.75, learnMul: 1.3, carryKg: 3, infectionMul: 1.5 });
    expect(m.protection).toBeCloseTo(0.15);
    expect(survivorModifiers(build({ occupation: 'veteran', traits: ['cowardly'] })).panicMul).toBe(0);
    expect(survivorModifiers(build({ occupation: 'burglar' })).perks).toContain('hotwire');
  });

  it('stored builds are validated before use', () => {
    expect(parseBuild({ name: 'Bo', occupation: 'nurse', traits: ['nightOwl'] })).toEqual({ name: 'Bo', occupation: 'nurse', traits: ['nightOwl'] });
    expect(parseBuild({ name: 'Bo', occupation: 'nurse', traits: ['brave'] })).toBeNull(); // 2 points, costs 4
    expect(parseBuild({ name: 'Bo', occupation: 'astronaut', traits: [] })).toBeNull();
    expect(parseBuild({ name: 'Bo', occupation: 'unemployed', traits: ['strong', 'athletic'] })).toBeNull();
    expect(parseBuild('nope')).toBeNull();
  });
});
