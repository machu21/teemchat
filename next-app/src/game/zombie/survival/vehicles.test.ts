import { describe, expect, it } from 'vitest';
import {
  FLAT_TIRE,
  VEHICLE,
  VEHICLE_KINDS,
  VEHICLE_SPECS,
  applyService,
  canHotwire,
  corners,
  crashDamage,
  decodeVehicle,
  distanceTo,
  encodeVehicle,
  engineNoise,
  exitPoints,
  quadsOverlap,
  rectQuad,
  spawnVehicle,
  startEngine,
  stepVehicle,
  topSpeed,
  type VehicleState,
} from './vehicles';

// Phase 7: vehicle specs, seeded condition, driving physics, damage, parts.

const spawn = { id: 3, kind: 'sedan' as const, variant: 1, x: 500, y: 300, angle: 0 };
const healthy = (over: Partial<VehicleState> = {}): VehicleState => ({
  ...spawnVehicle(spawn, 1),
  fuel: 30,
  keys: true,
  engineOn: true,
  parts: { engine: 100, battery: 100, tires: [100, 100, 100, 100], body: 100, windows: 100 },
  ...over,
});
const open: (x: number, y: number) => boolean = () => false;
const drive = (v: VehicleState, throttle: number, steer: number, seconds: number, blocked: (x: number, y: number) => boolean = open) => {
  let s = v;
  for (let t = 0; t < seconds; t += 1 / 30) s = stepVehicle(s, { throttle, steer }, 1 / 30, blocked).state;
  return s;
};

describe('specs and spawns', () => {
  it('six kinds with distinct trunks, seats and handling', () => {
    expect(VEHICLE_KINDS).toEqual(['sedan', 'pickup', 'van', 'police', 'ambulance', 'truck']);
    expect(VEHICLE_SPECS.truck.trunkKg).toBeGreaterThan(VEHICLE_SPECS.sedan.trunkKg);
    expect(VEHICLE_SPECS.police.maxSpeed).toBeGreaterThan(VEHICLE_SPECS.van.maxSpeed);
    expect(VEHICLE_SPECS.sedan.seats).toBe(4);
  });

  it('a parked car is rolled from (seed, id): the same everywhere, different per car', () => {
    expect(spawnVehicle(spawn, 7)).toEqual(spawnVehicle(spawn, 7));
    const many = Array.from({ length: 60 }, (_, id) => spawnVehicle({ ...spawn, id }, 7));
    expect(new Set(many.map((v) => v.fuel)).size).toBeGreaterThan(20);
    expect(many.some((v) => v.fuel === 0)).toBe(true);
    expect(many.some((v) => v.keys)).toBe(true);
    expect(many.some((v) => !v.keys)).toBe(true);
    for (const v of many) {
      expect(v.fuel).toBeLessThanOrEqual(VEHICLE_SPECS.sedan.tank);
      expect(v.engineOn).toBe(false);
      expect(v.driver).toBeNull();
    }
  });
});

describe('geometry', () => {
  it('outline, distance and overlap follow the heading', () => {
    const v = healthy();
    expect(distanceTo(v, VEHICLE_SPECS.sedan, 500, 300)).toBe(0);
    expect(distanceTo(v, VEHICLE_SPECS.sedan, 500 + 24 + 10, 300)).toBeCloseTo(10);
    // Turned north, the long side runs along y
    const north = { ...v, angle: -Math.PI / 2 };
    expect(distanceTo(north, VEHICLE_SPECS.sedan, 500, 300 - 30)).toBeCloseTo(6);
    expect(quadsOverlap(corners(v, VEHICLE_SPECS.sedan), rectQuad({ x: 520, y: 290, w: 10, h: 10 }))).toBe(true);
    expect(quadsOverlap(corners(v, VEHICLE_SPECS.sedan), rectQuad({ x: 530, y: 290, w: 10, h: 10 }))).toBe(false);
    // The first exit is beside the car, clear of its body
    const out = exitPoints(v, VEHICLE_SPECS.sedan)[0];
    expect(distanceTo(v, VEHICLE_SPECS.sedan, out.x, out.y)).toBeGreaterThan(8);
  });
});

describe('driving', () => {
  it('accelerates to a top speed set by the engine and tyres, and coasts to a stop', () => {
    const fast = drive(healthy(), 1, 0, 6);
    expect(fast.speed).toBeCloseTo(topSpeed(fast), 0);
    expect(fast.x).toBeGreaterThan(500 + 400);
    const worn = healthy({ parts: { engine: 20, battery: 100, tires: [100, 100, 100, 5], body: 100, windows: 100 } });
    expect(topSpeed(worn)).toBeLessThan(topSpeed(healthy()) * 0.7);
    const coasted = drive(fast, 0, 0, 5);
    expect(coasted.speed).toBe(0);
  });

  it('S brakes, then reverses (slower); steering only works on the move', () => {
    const moving = drive(healthy(), 1, 0, 2);
    const braked = drive(moving, -1, 0, 1.5);
    expect(braked.speed).toBeLessThan(0);
    const back = drive(healthy(), -1, 0, 6);
    expect(back.speed).toBeCloseTo(-topSpeed(back) * VEHICLE.reverseMul, 0);
    expect(drive(healthy(), 0, 1, 2).angle).toBe(0);
    expect(drive(healthy(), 1, 1, 2).angle).toBeGreaterThan(0.5);
  });

  it('nothing happens with the engine off', () => {
    expect(drive(healthy({ engineOn: false }), 1, 0, 2).x).toBe(500);
  });

  it('a wall stops the car short, bouncing it back', () => {
    const wall = (x: number) => x > 600;
    const r = drive(healthy(), 1, 0, 5, wall);
    expect(r.x).toBeLessThan(600 - 20);
    let crash = 0;
    let s = drive(healthy(), 1, 0, 1.5);
    const wallX = s.x + 60;
    for (let t = 0; t < 3 && !crash; t += 1 / 30) {
      const step = stepVehicle(s, { throttle: 1, steer: 0 }, 1 / 30, (x) => x > wallX);
      crash = step.crash;
      s = step.state;
    }
    expect(crash).toBeGreaterThan(VEHICLE.crashDamage);
  });

  it('burns fuel by distance and stalls when the tank runs dry', () => {
    const v = healthy({ fuel: 30 });
    const after = drive(v, 1, 0, 5);
    expect(after.fuel).toBeLessThan(30);
    const dry = drive(healthy({ fuel: 0.02 }), 1, 0, 5);
    expect(dry.fuel).toBe(0);
    expect(dry.engineOn).toBe(false);
  });
});

describe('damage', () => {
  it('hard crashes wreck the engine, panels and glass and hurt the driver', () => {
    const v = healthy();
    expect(crashDamage(v, 30).state).toEqual(v);
    const soft = crashDamage(v, 80);
    expect(soft.state.parts.body).toBeLessThan(100);
    expect(soft.driverHurt).toBe(0);
    const hard = crashDamage(v, 200);
    expect(hard.state.parts.windows).toBeLessThan(100);
    expect(hard.driverHurt).toBeGreaterThan(0);
    // Battered doors protect you less
    const old = crashDamage(healthy({ parts: { ...v.parts, body: 10 } }), 200);
    expect(old.driverHurt).toBeGreaterThan(hard.driverHurt);
  });
});

describe('starting', () => {
  it('needs a key (or hotwiring), a battery, fuel and an engine', () => {
    const off = healthy({ engineOn: false });
    expect(startEngine({ ...off, keys: false }, 0).result).toBe('noKey');
    expect(startEngine({ ...off, keys: false, hotwired: true }, 0).result).toBe('started');
    expect(startEngine({ ...off, parts: { ...off.parts, battery: 3 } }, 0).result).toBe('deadBattery');
    expect(startEngine({ ...off, fuel: 0 }, 0).result).toBe('noFuel');
    expect(startEngine({ ...off, parts: { ...off.parts, engine: 0 } }, 0).result).toBe('brokenEngine');
    // A worn engine can take a few tries; each try costs battery
    const worn = { ...off, parts: { ...off.parts, engine: 10 } };
    const fail = startEngine(worn, 0.9);
    expect(fail.result).toBe('failed');
    expect(fail.state.parts.battery).toBe(100 - VEHICLE.startCost);
    expect(startEngine(off, 0.5).state.engineOn).toBe(true);
  });

  it('hotwiring: Burglars, or Electrical 1 with Mechanics 2', () => {
    expect(canHotwire(['hotwire'], 0, 0)).toBe(true);
    expect(canHotwire([], 1, 2)).toBe(true);
    expect(canHotwire([], 1, 1)).toBe(false);
  });

  it('engines are noisy, louder at speed', () => {
    expect(engineNoise(healthy({ engineOn: false }))).toBe(0);
    expect(engineNoise(healthy())).toBe(VEHICLE.engineNoise[0]);
    expect(engineNoise(drive(healthy(), 1, 0, 6))).toBeGreaterThan(VEHICLE.engineNoise[0]);
  });
});

describe('service', () => {
  it('refuel and siphon move a can of fuel', () => {
    const v = healthy({ fuel: 5 });
    const r = applyService(v, 'refuel');
    expect('state' in r && r.state.fuel).toBe(5 + VEHICLE.canLitres);
    expect('gives' in r && r.gives).toEqual([{ def: 'gas_can' }]);
    expect(applyService(v, 'siphon')).toEqual({ error: 'Not enough fuel in it to fill a can' });
    const s = applyService(healthy({ fuel: 25 }), 'siphon');
    expect('state' in s && s.state.fuel).toBe(15);
    expect(applyService(healthy({ fuel: VEHICLE_SPECS.sedan.tank }), 'refuel')).toEqual({ error: 'The tank is full' });
  });

  it('fitting a spare replaces the worst tyre and hands back the old one', () => {
    const v = healthy({ parts: { engine: 100, battery: 100, tires: [90, 3, 60, 80], body: 100, windows: 100 } });
    const r = applyService(v, 'tire', { cond: 0.8 });
    if ('error' in r) throw new Error(r.error);
    expect(r.state.parts.tires).toEqual([90, 80, 60, 80]);
    expect(r.gives).toEqual([]); // a shredded tyre isn't worth keeping
    const r2 = applyService(r.state, 'tire', { cond: 1 });
    if ('error' in r2) throw new Error(r2.error);
    expect(r2.state.parts.tires[2]).toBe(100);
    expect(r2.gives).toEqual([{ def: 'spare_tire', cond: 0.6 }]);
    expect(FLAT_TIRE).toBeGreaterThan(3);
  });

  it('batteries come out with their charge; engine repairs scale with Mechanics', () => {
    const v = healthy({ parts: { engine: 40, battery: 70, tires: [100, 100, 100, 100], body: 100, windows: 100 } });
    const out = applyService(v, 'takeBattery');
    if ('error' in out) throw new Error(out.error);
    expect(out.gives).toEqual([{ def: 'car_battery', cond: 0.7 }]);
    expect(out.state.parts.battery).toBe(0);
    const fix0 = applyService(v, 'engine', { level: 0 });
    const fix4 = applyService(v, 'engine', { level: 4 });
    if ('error' in fix0 || 'error' in fix4) throw new Error('repair failed');
    expect(fix4.state.parts.engine).toBeGreaterThan(fix0.state.parts.engine);
    expect(applyService({ ...v, driver: 'x' }, 'engine')).toEqual({ error: 'Someone is driving it' });
  });
});

describe('wire', () => {
  it('round-trips a vehicle and rejects junk', () => {
    const v = { ...healthy({ driver: 'abc', passengers: ['p1', 'p2'], hotwired: true }), x: 123.4, y: 567.8, angle: 1.234, speed: 42 };
    const back = decodeVehicle(JSON.parse(JSON.stringify(encodeVehicle(v))))!;
    expect(back).toMatchObject({ id: v.id, kind: 'sedan', x: 123, y: 568, driver: 'abc', passengers: ['p1', 'p2'], hotwired: true, keys: true, engineOn: true });
    expect(back.angle).toBeCloseTo(1.234, 3);
    expect(decodeVehicle(['x'])).toBeNull();
    expect(decodeVehicle([1, 99, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '', ''])).toBeNull();
    const clamped = decodeVehicle([1, 0, 0, 10, 10, 0, 0, 99999, 500, -5, 1, 2, 3, 4, 5, 6, 0, '', ''])!;
    expect(clamped.fuel).toBe(VEHICLE_SPECS.sedan.tank);
    expect(clamped.parts.engine).toBe(100);
    expect(clamped.parts.battery).toBe(0);
  });
});
