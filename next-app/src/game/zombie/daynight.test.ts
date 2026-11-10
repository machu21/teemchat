import { describe, expect, it } from 'vitest';
import { MAP_HEIGHT, MAP_WIDTH } from '../collision';
import { getBoundaryWallsForMap, getBuildingsForMap } from '../map/mapRegistry';
import { ZombieVision } from './zombieVision';
import { ZombieMode } from './zombieMode';
import { GAME_DAY_SECONDS, daylightVision } from './survival/daycycle';
import { VIS_VISIBLE } from './fov';
import { DEFAULT_BINDINGS, sanitizeSettings } from '../../lib/settings/controls';

const TS = 16;
const open = () => new ZombieVision([], [], 60 * TS, 40 * TS);
const visibleCount = (v: ZombieVision) => {
  let n = 0;
  for (let r = 0; r < 40; r++) for (let c = 0; c < 60; c++) if (v.visibilityAt(c * TS + 8, r * TS + 8) === VIS_VISIBLE) n++;
  return n;
};
const look = (v: ZombieVision) => v.update(1, 30 * TS + 8, 20 * TS + 8, 1, 0, null); // facing east

describe('daylight vision', () => {
  it('sees much further by day than at night', () => {
    const day = open();
    day.setDaylight(daylightVision(1));
    look(day);
    const night = open();
    night.setDaylight(daylightVision(0));
    look(night);
    expect(day.visibilityAt(30 * TS + 17 * TS, 20 * TS + 8)).toBe(VIS_VISIBLE); // 17 tiles east
    expect(night.visibilityAt(30 * TS + 9 * TS, 20 * TS + 8)).not.toBe(VIS_VISIBLE); // 9 tiles east
    expect(visibleCount(day)).toBeGreaterThan(visibleCount(night) * 3);
  });

  it('gas still shrinks daylight vision (they compose)', () => {
    const v = open();
    v.setDaylight(daylightVision(1));
    v.setViewScale(0.5);
    look(v);
    expect(v.visibilityAt(30 * TS + 8 * TS, 20 * TS + 8)).toBe(VIS_VISIBLE); // 18 × 0.5 = 9 tiles
    expect(v.visibilityAt(30 * TS + 11 * TS, 20 * TS + 8)).not.toBe(VIS_VISIBLE);
  });

  it('a flashlight reaches daylight distance at night, but only in a narrow beam', () => {
    const v = open();
    v.setDaylight(daylightVision(0));
    v.setFlashlight(true);
    look(v);
    expect(v.visibilityAt(30 * TS + 16 * TS, 20 * TS + 8)).toBe(VIS_VISIBLE); // straight ahead, far
    expect(v.visibilityAt(30 * TS + 5 * TS, 20 * TS + 8 + 5 * TS)).not.toBe(VIS_VISIBLE); // 45° off-axis
  });

  it('street lamps light a pool you can see at night, but not through a wall', () => {
    const lit = open();
    lit.setDaylight(daylightVision(0));
    lit.setLights([{ x: 30 * TS + 8, y: 20 * TS + 8 - 14 * TS, r: 4 }]); // 14 tiles north, behind you
    look(lit);
    expect(lit.visibilityAt(30 * TS + 8, 20 * TS + 8 - 14 * TS)).toBe(VIS_VISIBLE);

    // Same lamp with a wall row in between
    const walled = new ZombieVision([{ x: 0, y: 12 * TS, w: 60 * TS, h: TS }], [], 60 * TS, 40 * TS);
    walled.setDaylight(daylightVision(0));
    walled.setLights([{ x: 30 * TS + 8, y: 20 * TS + 8 - 14 * TS, r: 4 }]);
    look(walled);
    expect(walled.visibilityAt(30 * TS + 8, 20 * TS + 8 - 14 * TS)).not.toBe(VIS_VISIBLE);
  });
});

describe('harder nights', () => {
  const walls = getBoundaryWallsForMap('village');
  const buildings = getBuildingsForMap('village');
  const frame = { feetX: 436, feetY: 328, moveX: 0, moveY: 0, insideBuildingId: null, others: [] };

  it('zombies move faster at night and the clock reaches night after ~30 real minutes', () => {
    const mode = new ZombieMode(walls, buildings, MAP_WIDTH, MAP_HEIGHT, 1);
    mode.update(1 / 30, frame);
    expect(mode.getTimeOfDay().phase).toBe('day');
    expect(mode.sim.speedScale).toBe(1);
    // Jump the clock to 23:00 (15 game hours after 08:00 = 37.5 real minutes)
    mode.update(1 / 30, { ...frame, realDt: (15 / 24) * GAME_DAY_SECONDS });
    mode.update(1 / 30, frame);
    expect(mode.getTimeOfDay().phase).toBe('night');
    expect(mode.sim.speedScale).toBeCloseTo(1.15);
  });

  it('the day clock runs on real time even when frames are clamped', () => {
    const mode = new ZombieMode(walls, buildings, MAP_WIDTH, MAP_HEIGHT, 1);
    for (let i = 0; i < 10; i++) mode.update(0.05, { ...frame, realDt: 0.5 }); // 2 fps device
    expect(mode.getTimeOfDay().minute).toBe(2); // 5 real seconds = 2 game minutes
  });
});

describe('flashlight binding', () => {
  it('defaults to G, and old saved settings pick it up', () => {
    expect(DEFAULT_BINDINGS.flashlight).toEqual(['KeyG', null]);
    const { flashlight: _, ...old } = DEFAULT_BINDINGS;
    void _;
    expect(sanitizeSettings({ bindings: old }).bindings.flashlight).toEqual(['KeyG', null]);
  });
});

describe('shared clock', () => {
  it("a client adopts the host's time of day from snapshots", () => {
    const walls = getBoundaryWallsForMap('village');
    const buildings = getBuildingsForMap('village');
    const frame = { feetX: 436, feetY: 328, moveX: 0, moveY: 0, insideBuildingId: null, others: [] };
    const host = new ZombieMode(walls, buildings, MAP_WIDTH, MAP_HEIGHT, 1);
    const client = new ZombieMode(walls, buildings, MAP_WIDTH, MAP_HEIGHT, 2);
    const clientNet = { selfId: 'c', isReady: () => true, isHost: () => false, getHostId: () => 'h', isMember: () => true, memberCount: () => 2, sendLoot() {}, sendShot() {}, sendStrike() {}, sendDoor() {}, sendSnapshot() {} } as Record<string, unknown>;
    const hostNet = {
      ...clientNet,
      selfId: 'h',
      isHost: () => true,
      sendSnapshot: (snap: unknown) => (clientNet.onSnapshot as (s: unknown, f: string) => void)(structuredClone(snap), 'h'),
    };
    host.attachNet(hostNet as never);
    client.attachNet(clientNet as never);
    host.update(1 / 30, { ...frame, realDt: (13 / 24) * GAME_DAY_SECONDS }); // → 21:00
    for (let i = 0; i < 40; i++) {
      host.update(1 / 30, frame);
      client.update(1 / 30, frame);
    }
    expect(client.getTimeOfDay().hour).toBe(host.getTimeOfDay().hour);
    expect(client.getTimeOfDay().phase).toBe('night');
  });
});
