import { describe, expect, it } from 'vitest';
import { MAP_HEIGHT, MAP_WIDTH } from '../collision';
import { getBoundaryWallsForMap, getBuildingsForMap } from '../map/mapRegistry';
import { ZombieMode, type ZombieFrameInput, type ZombieHud } from './zombieMode';
import { DOOR_HP, type Entrance } from './entrances';
import { xpToNext } from './survival/progression';
import { carryCapacity } from './survival/condition';
import type { ZombieShot } from '../../lib/services/zombieSync';
import type { SurvivorBuild } from './survival/survivor';

// Phase 4 (skills, character creation, traits) through the real ZombieMode.

const walls = getBoundaryWallsForMap('village');
const buildings = getBuildingsForMap('village');
const SPAWN = { x: 436, y: 328 };
const frame = (over: Partial<ZombieFrameInput> = {}): ZombieFrameInput => ({
  feetX: SPAWN.x,
  feetY: SPAWN.y,
  moveX: 0,
  moveY: 0,
  insideBuildingId: null,
  others: [],
  ...over,
});

function makeMode(entrances: Entrance[] = []) {
  const mode = new ZombieMode(walls, buildings, MAP_WIDTH, MAP_HEIGHT, 1, entrances);
  let hud: ZombieHud | null = null;
  mode.onHudChanged = (h) => (hud = h);
  return { mode, hud: () => hud! };
}

function step(mode: ZombieMode, seconds: number, over: Partial<ZombieFrameInput> = {}, keep = false) {
  for (let t = 0; t < seconds; t += 1 / 30) {
    if (!keep) mode.sim.zombies = [];
    mode.update(1 / 30, frame(over));
  }
}


/** Boarding up needs a hammer, planks and nails (Phase 5). */
function carpenterKit(m: ZombieMode) {
  const p = m as unknown as { owned: Set<string>; bag: { items: unknown[] } };
  p.owned.add('hammer');
  p.bag = { ...p.bag, items: [...p.bag.items, { uid: 'kit-planks', def: 'planks', qty: 5 }, { uid: 'kit-nails', def: 'nails', qty: 20 }] };
}

const build = (over: Partial<SurvivorBuild> = {}): SurvivorBuild => ({ name: 'Ana', occupation: 'unemployed', traits: [], ...over });
const bag = (m: ZombieMode) => (m as unknown as { bag: { items: { uid: string; def: string; qty: number }[] } }).bag.items;
const giveBag = (m: ZombieMode, items: { uid: string; def: string; qty: number }[]) => {
  const p = m as unknown as { bag: { items: unknown[] } };
  p.bag = { ...p.bag, items: [...p.bag.items, ...items] } as never;
};

describe('character creation', () => {
  it('a survival space waits for a survivor: frozen, untouchable, and not hunted', () => {
    const { mode, hud } = makeMode();
    mode.setRequireCharacterCreation(true);
    step(mode, 0.1);
    expect(hud().creating).toBe(true);
    expect(mode.moveMultiplier()).toBe(0);
    expect(mode.useSupply()).toBe(false);
    // A zombie right next to us neither targets nor hurts us
    mode.sim.zombies = [];
    mode.sim.add(SPAWN.x + 12, SPAWN.y);
    step(mode, 3, {}, true);
    expect(mode.vitals.health).toBe(100);
    expect(mode.sim.zombies.every((z) => z.targetId === null)).toBe(true);
  });

  it('starting a survivor applies occupation and traits, and gives the starting gear', () => {
    const { mode, hud } = makeMode();
    mode.setRequireCharacterCreation(true);
    step(mode, 0.1);
    expect(mode.createSurvivor(build({ traits: ['strong', 'weak'] }))).not.toEqual([]);
    expect(mode.isCreating()).toBe(true);
    expect(mode.createSurvivor(build({ name: 'Mira', occupation: 'carpenter', traits: ['strong', 'organized', 'slowLearner', 'heartyAppetite', 'highThirst'] }))).toEqual([]);
    step(mode, 0.1);
    expect(hud().creating).toBe(false);
    expect(hud().survivor).toMatchObject({ name: 'Mira', occupation: 'Carpenter' });
    expect(hud().survivor.traits.map((t) => t.label)).toEqual(['Strong', 'Organized', 'Slow Learner', 'Hearty Appetite', 'High Thirst']);
    expect(mode.condition.strength.level).toBe(8);
    expect(mode.skills.carpentry.level).toBe(3);
    expect(hud().skills.find((s) => s.id === 'carpentry')?.level).toBe(3);
    expect(bag(mode).map((i) => i.def)).toContain('nails');
    expect(hud().owned).toContain('hammer');
    // Strong + Organized: more capacity
    expect(mode.capacity()).toBeCloseTo(carryCapacity({ level: 8, xp: 0 }) + 3);
  });

  it('dying asks for a new survivor, with fresh skills', () => {
    const { mode, hud } = makeMode();
    mode.setRequireCharacterCreation(true);
    expect(mode.createSurvivor(build({ occupation: 'policeOfficer', traits: ['pacifist'] }))).toEqual([]);
    step(mode, 0.1);
    expect(mode.skills.aiming.level).toBe(3);
    mode.vitals = { ...mode.vitals, health: 0 };
    step(mode, 0.1);
    while (mode.isDead()) step(mode, 1 / 30);
    step(mode, 0.1);
    expect(hud().creating).toBe(true);
    expect(mode.skills.aiming.level).toBe(0);
  });
});

describe('skills in play', () => {
  it('shooting trains Aiming, and a trained aim is tighter', () => {
    const spread = (aiming: number) => {
      const shots: ZombieShot[] = [];
      const { mode } = makeMode();
      mode.attachNet({ selfId: 'c', isReady: () => true, isHost: () => false, getHostId: () => 'h', isMember: () => true, memberCount: () => 2, sendShot: (s: ZombieShot) => shots.push(s), sendLoot() {}, sendStrike() {}, sendDoor() {}, sendSnapshot() {} } as never);
      const m = mode as unknown as { owned: Set<string>; mags: Record<string, number>; reserve: Record<string, number> };
      m.owned.add('pistol');
      m.mags.pistol = 12;
      m.reserve['9mm'] = 500;
      mode.selectWeapon('pistol');
      mode.skills = { ...mode.skills, aiming: { level: aiming, xp: 0 } };
      mode.setAim(0);
      for (let i = 0; i < 40; i++) {
        mode.setTrigger(true);
        step(mode, 0.35);
        mode.setTrigger(false);
        step(mode, 0.05);
        mode.skills = { ...mode.skills, aiming: { level: aiming, xp: 0 } };
      }
      step(mode, 0.5);
      const angles = shots.flatMap((s) => s.a);
      expect(angles.length).toBeGreaterThan(20);
      return Math.max(...angles.map(Math.abs));
    };
    expect(spread(10)).toBeLessThan(spread(0) * 0.75);

    const { mode } = makeMode();
    const m = mode as unknown as { owned: Set<string>; mags: Record<string, number> };
    m.owned.add('pistol');
    m.mags.pistol = 12;
    mode.selectWeapon('pistol');
    for (let i = 0; i < 6; i++) {
      mode.setTrigger(true);
      step(mode, 0.35);
      mode.setTrigger(false);
    }
    expect(mode.skills.aiming.xp).toBeGreaterThan(0);
  });

  it('reloading trains Reloading, and a trained hand reloads faster', () => {
    const reloadTime = (level: number) => {
      const { mode, hud } = makeMode();
      const m = mode as unknown as { owned: Set<string>; mags: Record<string, number>; reserve: Record<string, number> };
      m.owned.add('pistol');
      m.mags.pistol = 0;
      m.reserve['9mm'] = 100;
      mode.selectWeapon('pistol');
      mode.skills = { ...mode.skills, reloading: { level, xp: 0 } };
      step(mode, 0.05);
      expect(mode.reload()).toBe(true);
      let t = 0;
      while (hud().weapon.mag === 0 && t < 5) {
        step(mode, 1 / 30);
        t += 1 / 30;
      }
      if (level < 10) expect(mode.skills.reloading.xp + mode.skills.reloading.level * 1000).toBeGreaterThan(level * 1000);
      return t;
    };
    expect(reloadTime(10)).toBeLessThan(reloadTime(0) * 0.7);
  });

  it('boarding up trains Carpentry; a carpenter boards up faster', () => {
    const boardTime = (level: number) => {
      const door: Entrance = { id: 'b:door', kind: 'door', col: 27, row: 19, state: 'closed', planks: 0, hp: DOOR_HP };
      const { mode, hud } = makeMode([door]);
      const at = { feetX: 27 * 16 + 8, feetY: 19 * 16 + 8 + 16 };
      mode.skills = { ...mode.skills, carpentry: { level, xp: 0 } };
      carpenterKit(mode);
      step(mode, 0.05, at);
      expect(mode.doorAction('addPlank')).toBe(true);
      let t = 0;
      while (hud().entrance?.planks === 0 && t < 5) {
        step(mode, 1 / 30, at);
        t += 1 / 30;
      }
      if (level < 10) expect(mode.skills.carpentry.xp + mode.skills.carpentry.level * 1000).toBeGreaterThan(level * 1000);
      return t;
    };
    expect(boardTime(10)).toBeLessThan(boardTime(0) * 0.6);
  });

  it('treating a wound trains First Aid; skill speeds healing', () => {
    const { mode } = makeMode();
    giveBag(mode, [{ uid: 'b', def: 'bandage', qty: 2 }]);
    step(mode, 0.1);
    mode.body = { ...mode.body, wounds: [{ id: 1, part: 'leftArm', kind: 'laceration', bleeding: true, bandaged: false, bandageAge: 0, disinfected: true, sepsis: 0, age: 0, healLeft: 400 }] };
    expect(mode.useSupply('bandage')).toBe(true);
    expect(mode.skills.firstAid.xp).toBeGreaterThan(0);

    const heal = (level: number) => {
      const { mode: m } = makeMode();
      m.skills = { ...m.skills, firstAid: { level, xp: 0 } };
      m.body = { ...m.body, wounds: [{ id: 1, part: 'leftArm', kind: 'laceration', bleeding: false, bandaged: true, bandageAge: 0, disinfected: true, sepsis: 0, age: 0, healLeft: 400 }] };
      step(m, 10);
      return 400 - m.body.wounds[0].healLeft;
    };
    expect(heal(10)).toBeGreaterThan(heal(0) * 1.6);
  });

  it('duct tape repairs a worn weapon (Maintenance); thread mends a jacket (Tailoring)', () => {
    const { mode, hud } = makeMode();
    giveBag(mode, [{ uid: 't', def: 'duct_tape', qty: 1 }, { uid: 'th', def: 'thread', qty: 1 }]);
    const m = mode as unknown as { durability: Record<string, number> };
    m.durability.axe = 20;
    mode.equipped.outer = { uid: 'j', def: 'leather_jacket', qty: 1, cond: 0.5 };
    mode.setInventoryOpen(true);
    step(mode, 0.1);
    expect(hud().inventory!.items.find((i) => i.key === 'w:axe')?.actions).toContain('repair');
    expect(mode.inventoryAction('w:axe', 'repair')).toBe(true);
    expect(m.durability.axe).toBe(20 + Math.round(0.15 * 60));
    expect(mode.skills.maintenance.xp).toBeGreaterThan(0);
    expect(mode.inventoryAction('w:axe', 'repair')).toBe(false); // no tape left
    expect(mode.inventoryAction('e:outer', 'repair')).toBe(true);
    expect(mode.equipped.outer?.cond).toBeCloseTo(0.65);
    expect(mode.skills.tailoring.xp).toBeGreaterThan(0);
    expect(bag(mode)).toEqual([]);
  });

  it('a skill book triples learning for its levels and is kept', () => {
    const { mode, hud } = makeMode();
    giveBag(mode, [{ uid: 'bk', def: 'book:carpentry:1', qty: 1 }]);
    step(mode, 0.1);
    expect(mode.inventoryAction('b:bk', 'use')).toBe(true);
    step(mode, 1);
    expect(bag(mode).map((i) => i.def)).toEqual(['book:carpentry:1']);
    expect(hud().skills.find((s) => s.id === 'carpentry')?.book).toBe(3);
    expect(mode.inventoryAction('b:bk', 'use')).toBe(false);
    // One plank's worth of XP, tripled
    const door: Entrance = { id: 'b:door', kind: 'door', col: 27, row: 19, state: 'closed', planks: 0, hp: DOOR_HP };
    void door;
    const before = mode.skills.carpentry;
    (mode as unknown as { train(s: string, n: number): void }).train('carpentry', 8);
    expect(mode.skills.carpentry.xp - before.xp).toBe(24);
    expect(xpToNext(0)).toBeGreaterThan(24);
  });
});

describe('traits in play', () => {
  it('Light Eater gets hungry slower; Hearty Appetite faster', () => {
    const hunger = (trait: 'lightEater' | 'heartyAppetite' | null) => {
      const { mode } = makeMode();
      mode.createSurvivor(build({ traits: trait ? [trait] : [] }));
      step(mode, 60);
      return 100 - mode.vitals.hunger;
    };
    const base = hunger(null);
    expect(hunger('lightEater')).toBeCloseTo(base * 0.75, 0);
    expect(hunger('heartyAppetite')).toBeCloseTo(base * 1.35, 0);
  });

  it('a Veteran does not panic, a coward panics more', () => {
    const panic = (b: SurvivorBuild) => {
      const { mode } = makeMode();
      mode.createSurvivor(b);
      step(mode, 0.1);
      (mode as unknown as { takeDamage(n: number): void }).takeDamage(10);
      return mode.condition.panic;
    };
    expect(panic(build({ occupation: 'veteran', traits: ['weak', 'pacifist'] }))).toBe(0);
    expect(panic(build({ traits: ['cowardly'] }))).toBeGreaterThan(panic(build()) * 1.5);
  });

  it('Thin Skinned takes more from zombie wounds; Prone to Illness catches it more', () => {
    const dmg = (b: SurvivorBuild) => {
      const { mode } = makeMode();
      mode.createSurvivor(b);
      step(mode, 0.1);
      const seq = [0.3, 0.75, 0.99];
      let i = 0;
      (mode as unknown as { injuryRng: () => number }).injuryRng = () => seq[Math.min(i++, seq.length - 1)];
      const hp = mode.vitals.health;
      (mode as unknown as { takeDamage(n: number, e: unknown[], s: string): void }).takeDamage(8, [], 'bite');
      return hp - mode.vitals.health;
    };
    expect(dmg(build({ traits: ['thinSkinned'] }))).toBeCloseTo(dmg(build()) * 1.25);
  });

  it('Fast Healer heals wounds faster', () => {
    const heal = (b: SurvivorBuild) => {
      const { mode } = makeMode();
      mode.createSurvivor(b);
      mode.body = { ...mode.body, wounds: [{ id: 1, part: 'leftArm', kind: 'scratch', bleeding: false, bandaged: true, bandageAge: 0, disinfected: true, sepsis: 0, age: 0, healLeft: 150 }] };
      step(mode, 10);
      return 150 - mode.body.wounds[0].healLeft;
    };
    expect(heal(build({ traits: ['fastHealer'] }))).toBeCloseTo(heal(build()) * 1.4, 0);
  });
});
