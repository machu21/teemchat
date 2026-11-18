import { describe, expect, it } from 'vitest';
import { MAP_HEIGHT, MAP_WIDTH } from '../collision';
import { getBoundaryWallsForMap, getBuildingsForMap } from '../map/mapRegistry';
import { ZombieMode, type ZombieFrameInput, type ZombieHud } from './zombieMode';
import { GAME_DAY_SECONDS } from './survival/daycycle';
import { SLEEP } from './survival/sleep';
import { CONDITION } from './survival/condition';
import { generateCity } from '../map/city/cityPlan';
import { cityRestSpots } from '../map/city/cityMap';
import type { LootSpawn } from './weapons';

// Phase 1 (character & time) wired through the real ZombieMode controller.

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

function makeMode(loot: LootSpawn[] = []) {
  const mode = new ZombieMode(walls, buildings, MAP_WIDTH, MAP_HEIGHT, 1, [], [], loot);
  let hud: ZombieHud | null = null;
  mode.onHudChanged = (h) => (hud = h);
  return { mode, hud: () => hud! };
}

/** Steps at 30 fps with the horde cleared, so nothing hunts the player. */
function step(mode: ZombieMode, seconds: number, over: Partial<ZombieFrameInput> = {}) {
  for (let t = 0; t < seconds; t += 1 / 30) {
    mode.sim.zombies = [];
    mode.update(1 / 30, frame(over));
  }
}

const gameMinutes = (m: ZombieMode) => {
  const t = m.getTimeOfDay();
  return (t.day - 1) * 1440 + t.hour * 60 + t.minute;
};

describe('character condition in ZombieMode', () => {
  it('fatigue builds over time and shows in the HUD', () => {
    const { mode, hud } = makeMode();
    step(mode, 1);
    const before = hud().character.fatigue;
    step(mode, 120);
    expect(hud().character.fatigue).toBeGreaterThan(before + 3);
    expect(hud().character.carryMaxKg).toBe(20);
  });

  it('strength sets the bag limit', () => {
    const { mode, hud } = makeMode();
    mode.condition = { ...mode.condition, strength: { level: 10, xp: 0 } };
    step(mode, 0.1);
    expect(hud().character.carryMaxKg).toBe(26);
  });

  it('eating chips cheers you up and coffee wakes you', () => {
    const loot: LootSpawn[] = [
      { id: 0, item: { kind: 'supply', supply: 'chips' }, x: SPAWN.x, y: SPAWN.y - 4 },
      { id: 1, item: { kind: 'supply', supply: 'coffee' }, x: SPAWN.x, y: SPAWN.y - 4 },
    ];
    const { mode } = makeMode(loot);
    step(mode, 0.2); // picks both up
    mode.condition = { ...mode.condition, boredom: 50, unhappiness: 50, fatigue: 70 };
    expect(mode.useSupply('chips')).toBe(true);
    expect(mode.condition.boredom).toBeLessThan(43);
    expect(mode.condition.unhappiness).toBeLessThan(41);
    step(mode, 1); // use cooldown
    expect(mode.useSupply('coffee')).toBe(true);
    expect(mode.condition.fatigue).toBeLessThan(51);
  });

  it('sprinting is blocked when exhausted by fatigue', () => {
    const { mode, hud } = makeMode();
    mode.condition = { ...mode.condition, fatigue: 96 };
    mode.setSprint(true);
    step(mode, 0.5, { moveX: 1 });
    expect(hud().sprinting).toBe(false);
    expect(hud().moodles.find((m) => m.id === 'tired')?.level).toBe(4);
    expect(mode.moveMultiplier()).toBeLessThan(0.85);
  });
});

describe('sleeping', () => {
  it('refuses when you are not tired', () => {
    const { mode, hud } = makeMode();
    step(mode, 0.1);
    expect(mode.sleepAction()).toBe(false);
    step(mode, 0.1);
    expect(hud().toast).toMatch(/not tired/i);
  });

  it('alone: freezes you, fast-forwards the clock and restores you, then wakes you rested', () => {
    const { mode, hud } = makeMode();
    mode.setRestSpots([{ kind: 'bed', x: SPAWN.x + 8, y: SPAWN.y - 20, w: 32, h: 48 }]);
    step(mode, 0.1);
    expect(hud().restSpot).toBe('bed');
    mode.condition = { ...mode.condition, fatigue: 90 };
    const t0 = gameMinutes(mode);
    expect(mode.sleepAction()).toBe(true);
    expect(mode.isAsleep()).toBe(true);
    expect(mode.moveMultiplier()).toBe(0);
    step(mode, 5);
    expect(hud().asleep).toEqual({ spot: 'bed', quality: SLEEP.quality.bed });
    // 5 real s at 40× ≈ 200 elapsed s ≈ 80 game minutes (vs 2 awake)
    expect(gameMinutes(mode) - t0).toBeGreaterThan(70);
    expect(mode.condition.fatigue).toBeLessThan(90 - CONDITION.fatigueSleep * SLEEP.timeScale * 4);
    // Fully rested after ~24 real s in a bed; then it starts climbing again awake
    let wokeAt = -1;
    for (let t = 0; t < 40 && wokeAt < 0; t += 1 / 30) {
      step(mode, 1 / 30);
      if (!mode.isAsleep()) wokeAt = t;
    }
    expect(wokeAt).toBeGreaterThan(15);
    expect(wokeAt).toBeLessThan(25);
    expect(mode.condition.fatigue).toBeLessThan(0.5);
    expect(hud().toast).toMatch(/rested/i);
    expect(mode.vitals.hunger).toBeLessThan(100);
  });

  it('sleep heals, and a bed heals more than the floor', () => {
    const healed = (bed: boolean) => {
      const { mode } = makeMode();
      if (bed) mode.setRestSpots([{ kind: 'bed', x: SPAWN.x + 8, y: SPAWN.y - 20, w: 32, h: 48 }]);
      mode.vitals = { ...mode.vitals, health: 50 };
      mode.condition = { ...mode.condition, fatigue: 90 };
      step(mode, 0.1);
      const before = mode.vitals.health;
      mode.sleepAction();
      step(mode, 10);
      expect(mode.isAsleep()).toBe(true);
      return mode.vitals.health - before;
    };
    const bed = healed(true);
    const floor = healed(false);
    // 10 real s = ~2.7 game hours asleep at 6 hp / game hour × quality
    expect(bed).toBeGreaterThan(14);
    expect(floor).toBeGreaterThan(7);
    expect(bed).toBeGreaterThan(floor * 1.5);
  });

  it('a move key, damage or a zombie close by wakes you', () => {
    const { mode } = makeMode();
    mode.condition = { ...mode.condition, fatigue: 90 };
    step(mode, 0.1);
    mode.sleepAction();
    mode.wakeUp('manual');
    expect(mode.isAsleep()).toBe(false);

    mode.sleepAction();
    (mode as unknown as { takeDamage(n: number): void }).takeDamage(10);
    step(mode, 0.1);
    expect(mode.isAsleep()).toBe(false);
    expect(mode.condition.panic).toBeGreaterThan(30);

    mode.condition = { ...mode.condition, panic: 0 };
    mode.sleepAction();
    expect(mode.isAsleep()).toBe(true);
    // A zombie 3 tiles away notices the sleeper, gives chase, and that wakes them
    mode.sim.zombies = [];
    mode.sim.add(SPAWN.x + 48, SPAWN.y);
    for (let i = 0; i < 90 && mode.isAsleep(); i++) mode.update(1 / 30, frame());
    expect(mode.isAsleep()).toBe(false);
    expect(mode.condition.panic).toBeGreaterThan(30);
  });

  it('cannot act while asleep', () => {
    const { mode } = makeMode();
    mode.condition = { ...mode.condition, fatigue: 90 };
    step(mode, 0.1);
    mode.sleepAction();
    expect(mode.useSupply()).toBe(false);
    expect(mode.reload()).toBe(false);
    expect(mode.doorAction('toggle')).toBe(false);
  });

  it('with other players around, only your own needs fast-forward — the shared clock keeps real time', () => {
    const { mode } = makeMode();
    const net = { selfId: 'h', isReady: () => true, isHost: () => true, getHostId: () => 'h', isMember: () => true, memberCount: () => 2, sendLoot() {}, sendShot() {}, sendStrike() {}, sendDoor() {}, sendSnapshot() {} };
    mode.attachNet(net as never);
    mode.condition = { ...mode.condition, fatigue: 90 };
    step(mode, 0.1);
    const t0 = gameMinutes(mode);
    mode.sleepAction();
    step(mode, 5);
    expect(gameMinutes(mode) - t0).toBeLessThanOrEqual(3);
    // Floor sleep: 5 s × 40 × 0.095 × 0.55 ≈ 10 fatigue (vs 0.2 in real time)
    expect(mode.condition.fatigue).toBeLessThan(82);
  });

  it('a client shows the clock the sleeping host skipped to', () => {
    const host = makeMode().mode;
    const client = makeMode().mode;
    let members = 1;
    const clientNet = { selfId: 'c', isReady: () => true, isHost: () => false, getHostId: () => 'h', isMember: () => true, memberCount: () => members, sendLoot() {}, sendShot() {}, sendStrike() {}, sendDoor() {}, sendSnapshot() {} } as Record<string, unknown>;
    const hostNet = {
      ...clientNet,
      selfId: 'h',
      isHost: () => true,
      sendSnapshot: (snap: unknown) => (clientNet.onSnapshot as (s: unknown, f: string) => void)(structuredClone(snap), 'h'),
    };
    host.attachNet(hostNet as never);
    client.attachNet(clientNet as never);
    host.condition = { ...host.condition, fatigue: 90 };
    step(host, 0.1);
    host.sleepAction();
    step(host, 3); // alone: skips ~50 game minutes
    members = 2; // the client joins
    for (let i = 0; i < 60; i++) {
      host.sim.zombies = [];
      host.update(1 / 30, frame());
      client.update(1 / 30, frame());
    }
    expect(gameMinutes(host)).toBeGreaterThan(8 * 60 + 40);
    expect(Math.abs(gameMinutes(client) - gameMinutes(host))).toBeLessThanOrEqual(1);
  });

  it('respawning resets the character', () => {
    const { mode } = makeMode();
    mode.condition = { ...mode.condition, fatigue: 80, stress: 70 };
    mode.vitals = { ...mode.vitals, health: 1 };
    (mode as unknown as { takeDamage(n: number): void }).takeDamage(5);
    let out: string | null = null;
    for (let i = 0; i < 120 && out !== 'respawn'; i++) {
      mode.sim.zombies = [];
      out = mode.update(1 / 30, frame());
    }
    expect(out).toBe('respawn');
    expect(mode.condition.fatigue).toBe(10);
    expect(mode.condition.stress).toBe(0);
  });
});

describe('city rest spots', () => {
  it('beds and sofas come straight from the existing city plan, on every floor', () => {
    const plan = generateCity();
    const spots = cityRestSpots(plan);
    expect(spots.filter((s) => s.kind === 'bed').length).toBeGreaterThan(10);
    expect(spots.some((s) => s.kind === 'sofa')).toBe(true);
    // Upper-floor furniture is included too
    const upstairsBed = plan.buildings.flatMap((b) => b.floors.slice(1)).flatMap((f) => f.furniture).find((f) => f.kind === 'bed');
    expect(upstairsBed).toBeTruthy();
    expect(spots.some((s) => s.x === upstairsBed!.x && s.y === upstairsBed!.y)).toBe(true);
    for (const s of spots.slice(0, 50)) expect(s.w * s.h).toBeGreaterThan(0);
  });

  it('a day still lasts one real hour while awake', () => {
    const { mode } = makeMode();
    mode.update(1 / 30, frame({ realDt: GAME_DAY_SECONDS / 24 }));
    expect(mode.getTimeOfDay().hour).toBe(9);
  });
});
