import { describe, expect, it } from 'vitest';
import { createTileGrid, setEntrance, setWall } from '../grid';
import { ZombieSim } from '../zombieSim';
import { DOOR_HP } from '../entrances';
import { FixedStep, difficultyAt, rollZombieKind } from './difficulty';
import { VITALS, consume, freshVitals, tickVitals } from './vitals';
import { ITEM_DEFS, addToBag, freshLoadout, makeWeaponItem, pickupAmmo, pickupWeapon, refreshContainer, reload, rollLoot, takeFromContainer, useConsumable } from './inventory';
import { FactionContext, acceptInvite, createSquad, damageMultiplier, inviteToSquad, leaveSquad, relationOf } from './factions';
import { endMatch, lobbyState, sessionRoleFromMember, startMatch, syncClock, validateMove } from './session';
import { BLOATER, CHARGER, SpecialsDirector, aiPhaseOf, effectiveDamage } from './specials';
import type { LootContainer, ZombieEntity } from './types';

const TS = 16;
const at = (col: number, row: number) => ({ x: col * TS + 8, y: row * TS + 8 });
const seq = () => {
  let n = 0;
  return () => `u${n++}`;
};
const fixedRng = (v: number) => () => v;

function world(cols = 40, rows = 30) {
  const grid = createTileGrid(cols, rows, TS);
  const sim = new ZombieSim(grid, { x: 0, y: 0, w: cols * TS, h: rows * TS }, 3);
  return { grid, sim, dir: new SpecialsDirector(sim) };
}

function step(w: ReturnType<typeof world>, seconds: number, targets: { id: string; x: number; y: number }[]) {
  const events = [];
  for (let t = 0; t < seconds; t += 0.05) {
    w.sim.tick(0.05, targets);
    events.push(...w.dir.tick(0.05, targets));
  }
  return events;
}

describe('difficulty', () => {
  it('ramps up with time and unlocks specials in order', () => {
    const d0 = difficultyAt(0);
    const d30 = difficultyAt(1800);
    expect(d30.spawnIntervalSeconds).toBeLessThan(d0.spawnIntervalSeconds);
    expect(d30.aggroMul).toBeGreaterThan(d0.aggroMul);
    expect(d30.lootMul).toBeLessThan(d0.lootMul);
    expect(d0.specialChance).toEqual({ charger: 0, bloater: 0, dreadnought: 0 });
    expect(difficultyAt(150).specialChance.bloater).toBeGreaterThan(0);
    expect(difficultyAt(150).specialChance.charger).toBe(0);
    expect(difficultyAt(1000).specialChance.dreadnought).toBeGreaterThan(0);
  });

  it('is deterministic and rolls kinds from a uniform roll', () => {
    expect(difficultyAt(777)).toEqual(difficultyAt(777));
    const d = difficultyAt(3000);
    expect(rollZombieKind(d, 0)).toBe('dreadnought');
    expect(rollZombieKind(d, 0.99)).toBe('walker');
  });

  it('FixedStep turns frame times into whole steps and caps catch-up', () => {
    const f = new FixedStep(0.05, 10);
    expect(f.advance(0.12)).toBe(2);
    expect(f.advance(0.04)).toBe(1);
    expect(f.advance(60)).toBe(10);
    expect(f.alpha).toBe(0);
  });
});

describe('vitals', () => {
  const ctx = { dt: 1, intent: 'walk' as const, inSafeZone: false, resting: false, decayMul: 1 };

  it('decays hunger and hydration, faster hydration while sprinting', () => {
    const walk = tickVitals(freshVitals(), ctx).vitals;
    const sprint = tickVitals(freshVitals(), { ...ctx, intent: 'sprint' }).vitals;
    expect(walk.hunger).toBeCloseTo(100 - VITALS.hungerDecay);
    expect(sprint.hydration).toBeLessThan(walk.hydration);
    expect(sprint.stamina).toBeLessThan(100);
  });

  it('starvation and dehydration drain HP and slow the player', () => {
    const v = { ...freshVitals(), hunger: 0, hydration: 0 };
    const r = tickVitals(v, ctx);
    expect(r.vitals.health).toBeCloseTo(100 - VITALS.starvationDamage - VITALS.dehydrationDamage);
    expect(r.speedMul).toBeCloseTo(VITALS.lowSpeedMul);
  });

  it('resting in a safe zone stabilises vitals and regens stamina', () => {
    const v = { ...freshVitals(), hunger: 0, stamina: 10 };
    const r = tickVitals(v, { ...ctx, intent: 'idle', inSafeZone: true, resting: true });
    expect(r.vitals.health).toBe(100);
    expect(r.vitals.stamina).toBeCloseTo(10 + VITALS.restRegen);
  });

  it('exhaustion locks sprinting until stamina recovers; stimulants override it', () => {
    let v = { ...freshVitals(), stamina: 1 };
    v = tickVitals(v, { ...ctx, intent: 'sprint' }).vitals;
    expect(v.exhausted).toBe(true);
    expect(tickVitals(v, { ...ctx, dt: 0.1 }).canSprint).toBe(false);
    const stim = consume(v, ITEM_DEFS.energy_drink.consume!);
    const r = tickVitals(stim, { ...ctx, intent: 'sprint' });
    expect(r.canSprint).toBe(true);
    expect(r.speedMul).toBeGreaterThan(1);
  });

  it('food regen heals over time and expires', () => {
    let v = consume({ ...freshVitals(), health: 50, hunger: 20 }, ITEM_DEFS.canned_beans.consume!);
    expect(v.hunger).toBe(55);
    for (let i = 0; i < 30; i++) v = tickVitals(v, ctx).vitals;
    expect(v.health).toBeCloseTo(60, 0);
    expect(v.effects).toHaveLength(0);
  });
});

describe('inventory & loot', () => {
  it('stacks, respects slot and weight limits', () => {
    const l = freshLoadout();
    const r = addToBag(l.bag, 'water_bottle', 10, seq());
    expect(r.bag.items.map((i) => i.qty)).toEqual([4, 4, 2]);
    const heavy = addToBag({ ...l.bag, maxWeight: 1 }, 'water_bottle', 5, seq());
    expect(heavy.added).toBe(2);
    expect(heavy.leftover).toBe(3);
  });

  it('auto-stacks ammo into the pouch and quick-reloads from it', () => {
    const l = freshLoadout();
    const { pouch } = pickupAmmo(l.quick.ammo, '9mm', 30);
    const r = reload(makeWeaponItem('p', 'pistol', 2), pouch);
    expect(r.weapon.mag).toBe(12);
    expect(r.pouch['9mm']).toBe(20);
    expect(pickupAmmo(pouch, '9mm', 1000).leftover).toBeGreaterThan(0);
  });

  it('duplicate guns become ammo; new guns fill the secondary slot', () => {
    let l = freshLoadout();
    l = pickupWeapon(l, 'pistol', 'g1').loadout;
    expect(l.quick.secondary?.weapon).toBe('pistol');
    const dup = pickupWeapon(l, 'pistol', 'g2');
    expect(dup.placed).toBe('ammo');
    expect(dup.loadout.quick.ammo['9mm']).toBeGreaterThan(0);
  });

  it('using a consumable removes it and applies its effect', () => {
    const l = freshLoadout();
    const bag = addToBag(l.bag, 'water_bottle', 1, () => 'w').bag;
    const r = useConsumable({ ...l, bag, quick: { ...l.quick, consumableUid: 'w' } }, { ...freshVitals(), hydration: 10 }, 'w');
    expect(r.used).toBe(true);
    expect(r.vitals.hydration).toBe(50);
    expect(r.loadout.bag.items).toHaveLength(0);
    expect(r.loadout.quick.consumableUid).toBeNull();
  });

  it('containers empty, then respawn after their timer with scaled rolls', () => {
    const contents = rollLoot('fridge', 3, 1, fixedRng(0.1), 'c1');
    let c: LootContainer = { id: 1, kind: 'fridge', poiId: 'g1', x: 0, y: 0, table: 'fridge', rolls: 3, respawnSeconds: 60, lootedAt: null, contents };
    for (const it of [...c.contents]) c = takeFromContainer(c, it.uid, 100).container;
    expect(c.lootedAt).toBe(100);
    expect(refreshContainer(c, 150, 1, Math.random)).toBe(c);
    const refilled = refreshContainer(c, 160, 0.4, fixedRng(0.5));
    expect(refilled.contents.length).toBeGreaterThan(0);
    expect(refilled.lootedAt).toBeNull();
    const oneTime = { ...c, respawnSeconds: null };
    expect(refreshContainer(oneTime, 9999, 1, Math.random)).toBe(oneTime);
  });
});

describe('factions', () => {
  const users: Record<string, string> = { a1: 'alice', a2: 'alice', b: 'bob', c: 'carol' };
  const squads: Record<string, string | null> = { a1: null, a2: null, b: null, c: null };
  const ctx: FactionContext = {
    userOf: (id) => users[id],
    friendsOf: (u) => new Set(u === 'alice' ? ['bob'] : []),
    squadOf: (id) => squads[id] ?? null,
  };

  it('friends and same account are allies, strangers neutral, zombies infected', () => {
    expect(relationOf('a1', 'b', ctx)).toBe('TEAM_ALLY');
    expect(relationOf('b', 'a1', ctx)).toBe('TEAM_ALLY');
    expect(relationOf('a1', 'a2', ctx)).toBe('TEAM_ALLY');
    expect(relationOf('a1', 'c', ctx)).toBe('NEUTRAL_SURVIVOR');
    expect(relationOf('a1', 'zombie:4', ctx)).toBe('INFECTED');
  });

  it('squads ally strangers; no friendly fire except area damage', () => {
    let s = createSquad('s1', 'a1');
    s = inviteToSquad(s, 'a1', 'c', 0);
    expect(acceptInvite(s, 'c', 100).members).toEqual(['a1']); // expired
    s = acceptInvite(s, 'c', 5);
    squads.a1 = 's1';
    squads.c = 's1';
    expect(relationOf('a1', 'c', ctx)).toBe('TEAM_ALLY');
    expect(damageMultiplier('TEAM_ALLY', 'ballistic')).toBe(0);
    expect(damageMultiplier('TEAM_ALLY', 'explosive')).toBeGreaterThan(0);
    expect(damageMultiplier('NEUTRAL_SURVIVOR', 'ballistic')).toBeGreaterThan(0);
    expect(leaveSquad(s, 'a1')?.leader).toBe('c');
    expect(leaveSquad(createSquad('x', 'a1'), 'a1')).toBeNull();
  });
});

describe('session', () => {
  it('only admins and mods start or end the match', () => {
    expect(sessionRoleFromMember('owner')).toBe('ROOM_ADMIN');
    expect(sessionRoleFromMember('moderator')).toBe('MOD_OPERATOR');
    expect(sessionRoleFromMember('guest')).toBe('SURVIVOR');
    const lobby = lobbyState();
    expect(startMatch(lobby, 'u', 'SURVIVOR', 0)).toBe(lobby);
    const running = startMatch(lobby, 'u', 'MOD_OPERATOR', 1_000);
    expect(running.phase).toBe('running');
    expect(syncClock(running, 601_000).elapsed).toBe(600);
    expect(endMatch(running, 'SURVIVOR')).toBe(running);
    expect(endMatch(running, 'ROOM_ADMIN').phase).toBe('ended');
  });

  it('rejects teleports and clamps to the furthest legal point', () => {
    const rules = { maxSpeed: 100, slack: 4 };
    expect(validateMove({ x: 0, y: 0, t: 0 }, { x: 50, y: 0, t: 500 }, rules).ok).toBe(true);
    const warp = validateMove({ x: 0, y: 0, t: 0 }, { x: 1000, y: 0, t: 100 }, rules);
    expect(warp.ok).toBe(false);
    expect(warp.x).toBeCloseTo(14);
    expect(validateMove({ x: 0, y: 0, t: 0 }, { x: 1000, y: 0, t: 100 }, { ...rules, isPortal: () => true }).ok).toBe(true);
  });
});

describe('special infected', () => {
  it('charger winds up, charges in a straight line and knocks down the survivor', () => {
    const w = world();
    const p = at(5, 10);
    const c = w.dir.spawn('charger', p.x, p.y);
    c.facing = 0;
    if (c.ability.kind === 'charge') c.ability.cooldown = 0;
    const target = { id: 'p1', ...at(12, 10) };
    const events = step(w, 2.5, [target]);
    const impact = events.find((e) => e.type === 'impact');
    expect(impact).toMatchObject({ targetId: 'p1', damage: CHARGER.impactDamage });
    expect(impact?.type === 'impact' && impact.effects[0].kind).toBe('knockdown');
  });

  it('charger breaches a barricaded door in one hit', () => {
    const w = world();
    for (let r = 0; r < 30; r++) if (r !== 10) setWall(w.grid, 10, r);
    setEntrance(w.grid, { id: 'd', kind: 'door', col: 10, row: 10, state: 'barricaded', planks: 4, hp: DOOR_HP });
    const c = w.dir.spawn('charger', at(4, 10).x, at(4, 10).y);
    c.facing = 0;
    // Target visible through... nothing: aim the charge manually
    c.targetId = 'p1';
    c.state = 'chase';
    if (c.ability.kind === 'charge') Object.assign(c.ability, { phase: 'charging', timer: 2, dirX: 1, dirY: 0, cooldown: 0, hit: [] });
    c.locked = true;
    const events = step(w, 1.5, [{ id: 'p1', ...at(20, 10) }]);
    expect(events.some((e) => e.type === 'breach')).toBe(true);
    expect(w.grid.entrances.get(10 * 40 + 10)?.state).toBe('broken');
  });

  it('bloater bursts on proximity and on death, leaving gas that poisons', () => {
    const w = world();
    const b = w.dir.spawn('bloater', at(5, 5).x, at(5, 5).y);
    const events = step(w, 1.2, [{ id: 'p1', ...at(6, 5) }]);
    expect(events.filter((e) => e.type === 'burst')).toHaveLength(1);
    expect(w.sim.zombies.find((z) => z.id === b.id)).toBeUndefined();
    const fx = w.dir.hazardEffectsAt(at(6, 5).x, at(6, 5).y);
    expect(fx.map((e) => e.kind).sort()).toEqual(['blinded', 'poison', 'slow']);

    const w2 = world();
    const b2 = w2.dir.spawn('bloater', at(5, 5).x, at(5, 5).y);
    expect(w2.dir.damage(b2.id, BLOATER.hp, 'ballistic', 0)).toBe(true);
    expect(w2.dir.tick(0.05, []).some((e) => e.type === 'burst')).toBe(true);
    step(w2, 11, []);
    expect(w2.dir.hazards).toHaveLength(0);
  });

  it('dreadnought shrugs off bullets and its roar rallies the horde', () => {
    const w = world(80, 40);
    const d = w.dir.spawn('dreadnought', at(10, 10).x, at(10, 10).y);
    expect(effectiveDamage(d, 100, 'ballistic')).toBeCloseTo(35);
    const walkers = [w.sim.add(at(30, 10).x, at(30, 10).y), w.sim.add(at(35, 20).x, at(35, 20).y)];
    const far = w.sim.add(at(78, 38).x, at(78, 38).y);
    d.state = 'chase';
    d.targetId = 'p1';
    const events = step(w, 4.2, [{ id: 'p1', ...at(12, 10) }]);
    const roar = events.find((e) => e.type === 'roar');
    expect(roar).toBeDefined();
    for (const z of walkers) expect(z.targetId).toBe('p1');
    expect(far.targetId).toBeNull();
    expect(aiPhaseOf(d as ZombieEntity)).toBeDefined();
  });

  it('scales bites by special type', () => {
    const w = world();
    const d = w.dir.spawn('dreadnought', 50, 50);
    const [bite] = w.dir.scaleBites([{ targetId: 'p', damage: 8, zombieId: d.id }]);
    expect(bite.damage).toBe(24);
  });
});
