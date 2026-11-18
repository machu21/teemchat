import { describe, expect, it } from 'vitest';
import { MAP_HEIGHT, MAP_WIDTH } from '../collision';
import { getBoundaryWallsForMap, getBuildingsForMap } from '../map/mapRegistry';
import { createTileGrid } from './grid';
import { Zombie, ZombieSim, ZOMBIE } from './zombieSim';
import { ZombieMode, isAlarmed, type ZombieFrameInput, type ZombieHud } from './zombieMode';
import { WINDOW_HP, type Entrance } from './entrances';
import { WEAPONS, type LootSpawn } from './weapons';
import { BODY } from './survival/body';
import { NORMAL_TRAITS, packTraits } from './survival/zombieTraits';
import type { ZombieDeath, ZombieSnapshot, ZombieStrike } from '../../lib/services/zombieSync';

// Phase 2 (zombies & combat): sim behaviours, then the wired ZombieMode.

const TS = 16;
const at = (col: number, row: number) => ({ x: col * TS + 8, y: row * TS + 8 });

function makeSim() {
  const grid = createTileGrid(40, 30, TS);
  return new ZombieSim(grid, { x: 0, y: 0, w: 40 * TS, h: 30 * TS }, 7);
}

function addZombie(sim: ZombieSim, col: number, row: number, over: Partial<Zombie> = {}): Zombie {
  const z = sim.add(at(col, row).x, at(col, row).y);
  z.timer = 100;
  z.senseCooldown = 0;
  z.facing = 0; // east, towards the test players
  Object.assign(z, over);
  return z;
}

function run(sim: ZombieSim, seconds: number, targets: { id: string; x: number; y: number }[], noises = () => [] as { x: number; y: number; radius: number }[]) {
  const bites = [];
  for (let t = 0; t < seconds; t += 0.05) bites.push(...sim.tick(0.05, targets, noises()));
  return bites;
}

describe('zombie traits in the sim', () => {
  it('sprinters close the gap faster than shamblers', () => {
    const sim = makeSim();
    const fast = addZombie(sim, 5, 5, { traits: { ...NORMAL_TRAITS, speed: 2 }, speedMul: 1.55 });
    const slow = addZombie(sim, 5, 20, { traits: { ...NORMAL_TRAITS, speed: 0 }, speedMul: 0.7 });
    // 6 tiles away: inside normal sight (7)
    const a = { id: 'a', ...at(11, 5) };
    const b = { id: 'b', ...at(11, 20) };
    run(sim, 1, [a, b]);
    expect(fast.x - at(5, 5).x).toBeGreaterThan((slow.x - at(5, 20).x) * 1.8);
  });

  it('a half-blind zombie misses a player a normal one sees', () => {
    const sim = makeSim();
    const sharp = addZombie(sim, 5, 5);
    const blind = addZombie(sim, 5, 15, { traits: { ...NORMAL_TRAITS, sight: 0 } });
    run(sim, 0.2, [{ id: 'a', ...at(11, 5) }, { id: 'b', ...at(11, 15) }]);
    expect(sharp.state).toBe('chase');
    expect(blind.state).not.toBe('chase');
  });

  it('strong zombies bite harder', () => {
    const sim = makeSim();
    addZombie(sim, 10, 10, { traits: { ...NORMAL_TRAITS, strength: 2 } });
    const bites = run(sim, 2, [{ id: 'p', ...at(11, 10) }]);
    expect(bites[0].damage).toBeCloseTo(ZOMBIE.attackDamage * 1.4);
  });

  it('the sim rolls traits (and toughness) only when asked', () => {
    const plain = makeSim();
    expect(plain.add(10, 10).traits).toBeUndefined();
    const rolled = makeSim();
    rolled.traitOdds = { speed: [0, 0, 1], strength: [0, 1, 0], sight: [0, 1, 0], hearing: [0, 1, 0], toughness: [0, 0, 1] };
    const z = rolled.add(10, 10);
    expect(z.traits?.speed).toBe(2);
    expect(z.maxHp).toBe(Math.round(ZOMBIE.maxHp * 1.45));
    expect(z.hp).toBe(z.maxHp);
  });
});

describe('search, return and feeding', () => {
  it('a zombie that loses its target searches where it was seen, then walks home', () => {
    const sim = makeSim();
    const z = addZombie(sim, 5, 5);
    const home = at(5, 5);
    // Lead it east across the map, then vanish (e.g. left the match)
    const p = { id: 'p', ...at(10, 5) };
    for (let t = 0; t < 4; t += 0.05) {
      p.x = Math.min(at(30, 5).x, p.x + 60 * 0.05);
      sim.tick(0.05, [p]);
    }
    expect(z.state).toBe('chase');
    expect(z.x - home.x).toBeGreaterThan(8 * TS);
    const seen: string[] = [];
    let homeAt = -1;
    for (let t = 0; t < 60 && homeAt < 0; t += 0.05) {
      sim.tick(0.05, []);
      if (seen[seen.length - 1] !== z.state) seen.push(z.state);
      if (seen.includes('return') && z.state !== 'return') homeAt = t;
    }
    expect(seen.slice(0, 3)).toEqual(['investigate', 'search', 'return']);
    expect(homeAt).toBeGreaterThan(0);
    expect(Math.hypot(z.x - home.x, z.y - home.y)).toBeLessThan(TS);
  });

  it('idle zombies find a body and feed, distracted; they stop when sated', () => {
    const sim = makeSim();
    const z = addZombie(sim, 5, 5, { timer: 100 });
    sim.addCorpse(at(9, 5).x, at(9, 5).y);
    run(sim, 0.3, []);
    expect(z.state).toBe('feed');
    run(sim, 4, []);
    expect(Math.hypot(z.x - at(9, 5).x, z.y - at(9, 5).y)).toBeLessThan(14);
    // A player 6 tiles away in plain view goes unnoticed while it eats (normal sight is 7)
    run(sim, 0.5, [{ id: 'p', ...at(9, 11) }]);
    expect(z.state).toBe('feed');
    run(sim, ZOMBIE.feedSeconds * 1.3, []);
    expect(z.state).not.toBe('feed');
    expect(z.sated).toBeGreaterThan(0);
  });

  it('an infected body gets back up', () => {
    const sim = makeSim();
    sim.addCorpse(100, 100, 2);
    run(sim, 2.2, []);
    expect(sim.corpses).toHaveLength(0);
    expect(sim.zombies).toHaveLength(1);
    expect(sim.risen).toHaveLength(1);
  });
});

describe('shove, knockdown and stomp', () => {
  it('a shove knocks zombies down; downed zombies cannot bite and get up after a while', () => {
    const sim = makeSim();
    const z = addZombie(sim, 10, 10);
    const p = { id: 'p', ...at(11, 10) };
    run(sim, 0.2, [p]);
    const r = sim.shove(p.x, p.y, Math.PI, 26, Math.PI, 16, 1);
    expect(r).toEqual({ hits: 1, downed: 1 });
    expect(z.state).toBe('down');
    expect(Math.hypot(z.x - p.x, z.y - p.y)).toBeGreaterThan(16);
    expect(run(sim, 1, [p])).toHaveLength(0);
    run(sim, ZOMBIE.downSeconds * 1.3, [p]);
    expect(z.state).not.toBe('down');
  });

  it('a stomp only hits a downed zombie, and hits it hard', () => {
    const sim = makeSim();
    const z = addZombie(sim, 10, 10);
    const p = at(11, 10);
    expect(sim.stomp(p.x, p.y, Math.PI, 20, 60).hit).toBe(false);
    z.state = 'down';
    z.timer = 5;
    expect(sim.stomp(p.x, p.y, Math.PI, 20, 60)).toEqual({ hit: true, kill: false });
    expect(sim.stomp(p.x, p.y, Math.PI, 20, 60)).toEqual({ hit: true, kill: true });
    expect(sim.zombies).toHaveLength(0);
  });

  it('heavy hits can knock down; plain strikes with no chance never do', () => {
    const sim = makeSim();
    const z = addZombie(sim, 10, 10);
    sim.strike(at(11, 10).x, at(11, 10).y, Math.PI, 36, Math.PI, 10);
    expect(z.state).not.toBe('down');
    sim.strike(at(11, 10).x, at(11, 10).y, Math.PI, 36, Math.PI, 10, undefined, { downChance: 1 });
    expect(z.state).toBe('down');
  });
});

// ---------------------------------------------------------------- wired

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

function makeMode(loot: LootSpawn[] = [], entrances: Entrance[] = []) {
  const mode = new ZombieMode(walls, buildings, MAP_WIDTH, MAP_HEIGHT, 1, entrances, [], loot);
  let hud: ZombieHud | null = null;
  mode.onHudChanged = (h) => (hud = h);
  return { mode, hud: () => hud! };
}

/** Steps with the horde cleared (or kept, with keep = true). */
function step(mode: ZombieMode, seconds: number, over: Partial<ZombieFrameInput> = {}, keep = false) {
  for (let t = 0; t < seconds; t += 1 / 30) {
    if (!keep) mode.sim.zombies = [];
    mode.update(1 / 30, frame(over));
  }
}

const private_ = (m: ZombieMode) => m as unknown as { takeDamage(n: number, e?: unknown[], s?: 'bite' | 'impact' | 'other'): void; injuryRng: () => number };
const supplyAt = (id: number, supply: 'bandage' | 'disinfectant' | 'splint' | 'painkillers'): LootSpawn => ({ id, item: { kind: 'supply', supply }, x: SPAWN.x, y: SPAWN.y - 4 });

describe('melee weapons in ZombieMode', () => {
  it('you start with an axe and fists; hotkey 1 cycles melee weapons; picking up a bat adds it', () => {
    const { mode, hud } = makeMode([{ id: 0, item: { kind: 'weapon', weapon: 'bat' }, x: SPAWN.x, y: SPAWN.y - 4 }]);
    step(mode, 0.1);
    expect(hud().owned).toEqual(['axe', 'bat', 'fists']);
    expect(mode.getWeapon()).toBe('axe');
    mode.selectSlot(1);
    expect(mode.getWeapon()).toBe('bat');
    mode.selectSlot(1);
    expect(mode.getWeapon()).toBe('fists');
    step(mode, 1 / 30);
    expect(hud().weapon.durability).toBeNull();
  });

  it('swings cost stamina, wear the weapon out and it breaks', () => {
    const { mode, hud } = makeMode();
    step(mode, 0.1);
    const stamina = mode.vitals.stamina;
    const swings = WEAPONS.axe.melee!.durability;
    // Every connecting swing wears it while Maintenance is untrained; the skill
    // levels up along the way (Phase 4), after which some swings don't wear
    let n = 0;
    while (mode.getWeapon() === 'axe' && n < swings * 3) {
      // A zombie in front so every swing connects
      mode.sim.zombies = [];
      const z = mode.sim.add(SPAWN.x + 20, SPAWN.y - 6);
      z.hp = 1e9;
      mode.setAim(0);
      mode.attack();
      mode.update(1 / 30, frame());
      // Keep the test player fresh and unbitten between swings
      mode.vitals = { ...mode.vitals, stamina: 100, health: 100 };
      step(mode, 0.6);
      if (n === 0) {
        expect(hud().weapon.durability).toBeCloseTo((swings - 1) / swings, 2);
      }
      n++;
    }
    expect(n).toBeGreaterThanOrEqual(swings);
    expect(mode.skills.maintenance.level).toBeGreaterThanOrEqual(1);
    expect(stamina).toBe(100);
    expect(mode.getWeapon()).toBe('fists');
    expect(hud().owned).toEqual(['fists']);
    expect(hud().toast).toMatch(/broke/);
  });

  it('a client sends weapon, multiplier and power-attack flag; the host clamps the multiplier', () => {
    const sent: ZombieStrike[] = [];
    const { mode } = makeMode();
    mode.attachNet({ selfId: 'c', isReady: () => true, isHost: () => false, getHostId: () => 'h', isMember: () => true, memberCount: () => 2, sendStrike: (s: ZombieStrike) => sent.push(s), sendLoot() {}, sendShot() {}, sendDoor() {}, sendSnapshot() {} } as never);
    mode.update(1 / 30, frame());
    mode.condition = { ...mode.condition, strength: { level: 10, xp: 0 } };
    mode.setSprint(true);
    mode.setAim(0);
    step(mode, 0.1, { moveX: 1 }); // sprinting registers
    mode.attack();
    step(mode, 0.05, { moveX: 1 });
    expect(sent[0]).toMatchObject({ w: 'axe', h: 1 });
    expect(sent[0].m).toBeGreaterThanOrEqual(1.2 * 1.6 * 0.99);
  });

  it('a host power attack with a bat can knock a zombie down, then a shove stomps it', () => {
    const { mode } = makeMode([{ id: 0, item: { kind: 'weapon', weapon: 'bat' }, x: SPAWN.x, y: SPAWN.y - 4 }]);
    step(mode, 0.1);
    mode.selectSlot(1);
    expect(mode.getWeapon()).toBe('bat');
    mode.sim.zombies = [];
    const z = mode.sim.add(SPAWN.x + 22, SPAWN.y - 6);
    z.hp = 1e9;
    const host = mode as unknown as { remoteStrikes: { strike: ZombieStrike; from: string }[] };
    // Several heavy swings: each has a 65 % knockdown chance
    for (let i = 0; i < 8 && z.state !== 'down'; i++) {
      host.remoteStrikes.push({ strike: { x: SPAWN.x, y: SPAWN.y - 6, f: 0, w: 'bat', m: 1, h: 1 }, from: 'self' });
      mode.update(1 / 30, frame());
    }
    expect(z.state).toBe('down');
    z.hp = 40;
    z.x = SPAWN.x + 12;
    z.y = SPAWN.y - 4;
    mode.setAim(0);
    expect(mode.shove()).toBe(true);
    mode.update(1 / 30, frame());
    expect(mode.sim.zombies.includes(z)).toBe(false);
    expect(mode.kills).toBe(1);
  });
});

describe('injuries in ZombieMode', () => {
  it('a zombie bite lands on a body part, bleeds, and a bandage stops it', () => {
    const { mode, hud } = makeMode([supplyAt(0, 'bandage')]);
    step(mode, 0.1);
    private_(mode).injuryRng = (() => {
      const v = [0.3, 0.75]; // torso, laceration
      let i = 0;
      return () => v[Math.min(i++, v.length - 1)];
    })();
    private_(mode).takeDamage(8, [], 'bite');
    step(mode, 0.1);
    expect(hud().injuries.wounds).toHaveLength(1);
    expect(hud().injuries.wounds[0].bleeding).toBe(true);
    expect(hud().moodles.some((m) => m.id === 'bleeding')).toBe(true);
    expect(hud().injuries.canBandage).toBe(true);
    const hp = mode.vitals.health;
    step(mode, 3);
    expect(mode.vitals.health).toBeLessThan(hp - BODY.bleedRate.laceration * 2.5);
    expect(mode.useSupply()).toBe(true); // C picks the bandage for a bleeding wound
    step(mode, 0.1);
    expect(hud().toast).toMatch(/Bandaged your/);
    expect(hud().injuries.wounds[0].bleeding).toBe(false);
  });

  it('disinfectant and splints are kept when there is nothing to treat', () => {
    const { mode, hud } = makeMode([supplyAt(0, 'disinfectant'), supplyAt(1, 'splint')]);
    step(mode, 0.1);
    expect(mode.useSupply('disinfectant')).toBe(false);
    expect(mode.useSupply('splint')).toBe(false);
    expect(hud().supplies.map((s) => s.id).sort()).toEqual(['disinfectant', 'splint']);
  });

  it('a broken leg blocks jumping and sprinting until splinted, and slows you', () => {
    const { mode, hud } = makeMode([supplyAt(0, 'splint')]);
    step(mode, 0.1);
    const speed = mode.moveMultiplier();
    mode.body = { ...mode.body, fractures: [{ part: 'rightLeg', splinted: false, healLeft: 900 }] };
    mode.setSprint(true);
    step(mode, 0.2, { moveX: 1 });
    expect(mode.tryJump()).toBe(false);
    expect(hud().sprinting).toBe(false);
    expect(mode.moveMultiplier()).toBeLessThan(speed * 0.7);
    expect(mode.useSupply('splint')).toBe(true);
    step(mode, 0.2, { moveX: 1 });
    expect(hud().sprinting).toBe(true);
  });

  it('you cannot sleep while bleeding', () => {
    const { mode, hud } = makeMode();
    step(mode, 0.1);
    mode.condition = { ...mode.condition, fatigue: 90 };
    mode.body = { ...mode.body, wounds: [{ id: 1, part: 'leftArm', kind: 'laceration', bleeding: true, bandaged: false, bandageAge: 0, disinfected: false, sepsis: 0, age: 0, healLeft: 400 }] };
    step(mode, 0.1);
    expect(mode.sleepAction()).toBe(false);
    expect(hud().character.sleepBlocked).toMatch(/bleeding/);
  });

  it('dying of the infection leaves a body that gets back up as a zombie', () => {
    const { mode, hud } = makeMode();
    step(mode, 0.1);
    mode.body = { ...mode.body, infection: { progress: 0.9999 } };
    mode.vitals = { ...mode.vitals, health: 20 };
    for (let t = 0; t < 3 && !mode.isDead(); t += 1 / 30) step(mode, 1 / 30);
    expect(mode.isDead()).toBe(true);
    expect(mode.sim.corpses).toHaveLength(1);
    expect(mode.sim.corpses[0].turnIn).toBeGreaterThan(0);
    expect(hud().toast).toMatch(/infection/);
    const corpse = mode.sim.corpses[0];
    while (mode.isDead()) step(mode, 1 / 30);
    // Respawned clean (WorldGame moves you back to spawn; here: well away from the body)
    expect(mode.body.infection).toBeNull();
    const away = { feetX: SPAWN.x + 400, feetY: SPAWN.y };
    for (let t = 0; t < 16; t += 1 / 30) {
      mode.sim.zombies = mode.sim.zombies.filter((z) => Math.hypot(z.x - corpse.x, z.y - corpse.y) < 2);
      mode.update(1 / 30, frame(away));
    }
    expect(mode.sim.corpses).toHaveLength(0);
    expect(mode.sim.zombies.some((z) => Math.hypot(z.x - corpse.x, z.y - corpse.y) < 40)).toBe(true);
  });
});

describe('world events', () => {
  const alarmedKey = (() => {
    for (let i = 0; i < 500; i++) if (isAlarmed(`b${i}`)) return `b${i}`;
    throw new Error('no alarmed key');
  })();
  const quietKey = (() => {
    for (let i = 0; i < 500; i++) if (!isAlarmed(`q${i}`)) return `q${i}`;
    throw new Error('no quiet key');
  })();
  const windowAt = (id: string, col: number): Entrance => ({ id: `${id}:w0`, kind: 'window', col, row: 11, state: 'closed', planks: 0, hp: WINDOW_HP });

  it('about a fifth of buildings are alarmed, stably', () => {
    let n = 0;
    for (let i = 0; i < 1000; i++) if (isAlarmed(`house-${i}`)) n++;
    expect(n / 1000).toBeGreaterThan(0.15);
    expect(n / 1000).toBeLessThan(0.25);
    expect(isAlarmed(alarmedKey)).toBe(true);
  });

  it('smashing a window of an alarmed building sets the alarm off; it keeps making noise', () => {
    const { mode, hud } = makeMode([], [windowAt(alarmedKey, 10), windowAt(quietKey, 14)]);
    const f = frame({ feetX: 176, feetY: 202 });
    mode.update(1 / 30, f);
    const host = mode as unknown as { remoteStrikes: { strike: ZombieStrike; from: string }[]; alarms: unknown[]; pendingNoises: { radius: number }[] };
    host.remoteStrikes.push({ strike: { x: 176, y: 196, f: -Math.PI / 2, w: 'axe', m: 1 }, from: 'self' });
    mode.update(1 / 30, f);
    expect([...mode.sim.grid.entrances.values()].find((e) => e.id.startsWith(alarmedKey))?.state).toBe('broken');
    expect(host.alarms).toHaveLength(1);
    expect(hud().toast).toMatch(/alarm/i);
    let loud = 0;
    for (let t = 0; t < 6; t += 1 / 30) {
      mode.sim.zombies = [];
      if (host.pendingNoises.some((n) => n.radius >= 25)) loud++;
      mode.update(1 / 30, f);
    }
    expect(loud).toBeGreaterThanOrEqual(2);
  });

  it('breaking a window in a quiet building only makes a crash', () => {
    const { mode } = makeMode([], [windowAt(quietKey, 14)]);
    const f = frame({ feetX: 240, feetY: 202 });
    mode.update(1 / 30, f);
    const host = mode as unknown as { remoteStrikes: { strike: ZombieStrike; from: string }[]; alarms: unknown[]; pendingNoises: { radius: number }[] };
    host.remoteStrikes.push({ strike: { x: 240, y: 196, f: -Math.PI / 2, w: 'axe', m: 1 }, from: 'self' });
    mode.sim.zombies = [];
    mode.update(1 / 30, f);
    expect(host.alarms).toHaveLength(0);
    expect(host.pendingNoises.some((n) => n.radius === 12)).toBe(true);
  });
});

describe('sync: corpses, deaths and traits', () => {
  it("a client's death becomes a corpse on the host, and the host sends it to everyone", () => {
    const host = makeMode().mode;
    const client = makeMode().mode;
    const deaths: ZombieDeath[] = [];
    const clientNet = {
      selfId: 'c', isReady: () => true, isHost: () => false, getHostId: () => 'h', isMember: () => true, memberCount: () => 2,
      sendLoot() {}, sendShot() {}, sendStrike() {}, sendDoor() {}, sendSnapshot() {},
      sendDeath: (d: ZombieDeath) => deaths.push(d),
    } as Record<string, unknown>;
    const hostNet = {
      ...clientNet, selfId: 'h', isHost: () => true,
      sendSnapshot: (snap: ZombieSnapshot) => (clientNet.onSnapshot as (s: unknown, f: string) => void)(structuredClone(snap), 'h'),
    };
    host.attachNet(hostNet as never);
    client.attachNet(clientNet as never);
    const where = { x: SPAWN.x + 40, y: SPAWN.y };
    client.update(1 / 30, frame({ feetX: where.x, feetY: where.y }));
    client.vitals = { ...client.vitals, health: 0 };
    client.update(1 / 30, frame({ feetX: where.x, feetY: where.y }));
    expect(deaths).toHaveLength(1);
    expect(deaths[0]).toMatchObject({ x: where.x, y: where.y });
    // What they carried goes with the body (the axe, worn by nothing yet)
    expect(deaths[0].i?.map((r) => r[0])).toEqual(['weapon:axe']);
    (hostNet as { onDeath?: (d: ZombieDeath, f: string) => void }).onDeath?.(deaths[0], 'c');
    const others = [{ id: 'c', x: where.x, y: where.y }];
    for (let i = 0; i < 20; i++) {
      host.sim.zombies = [];
      host.update(1 / 30, frame({ others }));
    }
    expect(host.sim.corpses).toHaveLength(1);
    expect(client.sim.corpses).toHaveLength(1);
    expect(client.sim.corpses[0]).toMatchObject({ x: where.x, y: where.y });
  });

  it('a corpse claimed far from where the client was is ignored', () => {
    const { mode } = makeMode();
    mode.attachNet({ selfId: 'h', isReady: () => true, isHost: () => true, getHostId: () => 'h', isMember: () => true, memberCount: () => 2, sendLoot() {}, sendShot() {}, sendStrike() {}, sendDoor() {}, sendSnapshot() {} } as never);
    (mode as unknown as { remoteDeaths: { death: ZombieDeath; from: string }[] }).remoteDeaths.push({ death: { x: 900, y: 900 }, from: 'c' });
    mode.update(1 / 30, frame({ others: [{ id: 'c', x: 100, y: 100 }] }));
    expect(mode.sim.corpses).toHaveLength(0);
  });

  it('clients learn each zombie’s traits so sprinters move at their own pace', () => {
    const client = makeMode().mode;
    const net = { selfId: 'c', isReady: () => true, isHost: () => false, getHostId: () => 'h', isMember: () => true, memberCount: () => 2, sendLoot() {}, sendShot() {}, sendStrike() {}, sendDoor() {}, sendSnapshot() {} } as Record<string, unknown>;
    client.attachNet(net as never);
    client.update(1 / 30, frame());
    const sprinter = packTraits({ ...NORMAL_TRAITS, speed: 2 });
    (net.onSnapshot as (s: ZombieSnapshot, f: string) => void)({ s: 1, z: [[7, 100, 100, 300, 100, 3, 100, 0, 0, 0, sprinter], [8, 100, 200, 300, 200, 3, 100, 0]] }, 'h');
    const [fast, plain] = client.sim.zombies;
    expect(fast.speedMul).toBeCloseTo(1.55);
    expect(plain.speedMul).toBeUndefined();
  });
});
