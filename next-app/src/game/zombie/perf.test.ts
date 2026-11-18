import { describe, expect, it } from 'vitest';
import { MAP_HEIGHT, MAP_WIDTH } from '../collision';
import { getBoundaryWallsForMap, getBuildingsForMap } from '../map/mapRegistry';
import { ZombieMode, type ZombieFrameInput } from './zombieMode';
import type { ZombieSnapshot } from '../../lib/services/zombieSync';
import type { VehicleSystem } from './vehicleSystem';
import type { VehicleSpawn } from './survival/vehicles';

// Phase 9 performance budgets (generous, so slow CI machines pass; real numbers are logged).
//   host frame with a big horde and four survivors
//   snapshot size (the realtime channel rejects very large broadcasts)
//   world save size (the database row is capped at 4 MB)

const walls = getBoundaryWallsForMap('village');
const buildings = getBuildingsForMap('village');
const PLAYERS = [
  { id: 'a', x: 436, y: 328 },
  { id: 'b', x: 520, y: 420 },
  { id: 'c', x: 700, y: 300 },
];
const frame = (): ZombieFrameInput => ({ feetX: 436, feetY: 328, moveX: 0, moveY: 0, insideBuildingId: null, others: PLAYERS });

function hostWithHorde(n: number) {
  const mode = new ZombieMode(walls, buildings, MAP_WIDTH, MAP_HEIGHT, 1, []);
  mode.setWorld(5, []);
  const cars: VehicleSpawn[] = Array.from({ length: 300 }, (_, i) => ({ id: i, kind: 'sedan', variant: i % 6, x: 100 + (i % 30) * 60, y: 1200 + Math.floor(i / 30) * 40, angle: 0 }));
  mode.setVehicles(cars, 2);
  const sent: ZombieSnapshot[] = [];
  mode.attachNet({
    selfId: 'h', isReady: () => true, isHost: () => true, getHostId: () => 'h', isMember: () => true, memberCount: () => 4,
    sendLoot() {}, sendShot() {}, sendStrike() {}, sendDoor() {}, sendBuild() {}, sendVehicle() {},
    sendSnapshot: (s: ZombieSnapshot) => sent.push(JSON.parse(JSON.stringify(s))),
  } as never);
  mode.update(1 / 30, frame());
  mode.sim.zombies = [];
  for (let i = 0; i < n; i++) mode.sim.add(200 + (i * 37) % 900, 200 + ((i * 53) % 700));
  return { mode, sent };
}

describe('performance', () => {
  it('a host frame with 300 zombies and four survivors stays well inside a frame', () => {
    const { mode } = hostWithHorde(300);
    for (let i = 0; i < 30; i++) mode.update(1 / 30, frame()); // warm up (flow fields, JIT)
    const times: number[] = [];
    for (let i = 0; i < 120; i++) {
      const t = performance.now();
      mode.update(1 / 30, frame());
      times.push(performance.now() - t);
    }
    times.sort((a, b) => a - b);
    const median = times[Math.floor(times.length / 2)];
    const p95 = times[Math.floor(times.length * 0.95)];
    console.info(`host frame: median ${median.toFixed(2)} ms, p95 ${p95.toFixed(2)} ms (${mode.sim.zombies.length} zombies)`);
    expect(median).toBeLessThan(16);
  });

  it('snapshots stay small (interest management, rounding)', () => {
    const { mode, sent } = hostWithHorde(300);
    for (let i = 0; i < 90; i++) mode.update(1 / 30, frame());
    expect(sent.length).toBeGreaterThan(5);
    const sizes = sent.map((s) => JSON.stringify(s).length);
    const max = Math.max(...sizes);
    console.info(`snapshots: ${sent.length}, largest ${(max / 1024).toFixed(1)} KB`);
    expect(max).toBeLessThan(60_000);
  });

  it('a world save with a big horde and every car changed fits a database row easily', () => {
    const { mode } = hostWithHorde(400);
    const vs = (mode as unknown as { vehicles: VehicleSystem }).vehicles;
    for (const v of [...vs.vehicles.values()]) vs.set({ ...v, fuel: 1, x: v.x + 1 });
    const t = performance.now();
    const json = JSON.stringify(mode.exportWorld());
    const ms = performance.now() - t;
    console.info(`world save: ${(json.length / 1024).toFixed(1)} KB in ${ms.toFixed(1)} ms`);
    expect(json.length).toBeLessThan(1_000_000);
    expect(ms).toBeLessThan(200);
  });
});
