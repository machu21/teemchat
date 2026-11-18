import { hash32, mulberry32 } from '../../art/character/appearance';
import type { ItemDefId } from './types';
import type { IconName } from '@/lib/icons';

// ============================================================
// ZOMBIE MODE — VEHICLES (pure)
// Kinds and specs, seeded condition for the cars already parked on the
// city map, arcade top-down driving with collisions, fuel, crash damage,
// starting / hotwiring, part swaps, and the wire row. The stateful side
// (grid stamping, sync, drawing) lives in zombie/vehicleSystem.ts.
//
// Units: px and seconds; fuel in litres; parts 0–100.
// Angle 0 faces east (+x), π/2 faces south (+y).
// ============================================================

export type VehicleKind = 'sedan' | 'pickup' | 'van' | 'police' | 'ambulance' | 'truck';
/** Wire order. Append only. */
export const VEHICLE_KINDS: readonly VehicleKind[] = ['sedan', 'pickup', 'van', 'police', 'ambulance', 'truck'];

export interface VehicleSpec {
  label: string;
  icon: IconName;
  /** Body length (along the heading) and width, px. */
  length: number;
  width: number;
  /** px / s at full engine and tyres. */
  maxSpeed: number;
  accel: number;
  brake: number;
  /** rad / s at speed. */
  turn: number;
  /** Litres. */
  tank: number;
  /** Litres per 100 tiles driven. */
  burn: number;
  seats: number;
  trunkKg: number;
  /** LOOT_TABLES key for what's in the trunk. */
  trunkTable: string;
}

export const VEHICLE_SPECS: Record<VehicleKind, VehicleSpec> = {
  sedan: { label: 'Sedan', icon: 'car', length: 48, width: 28, maxSpeed: 190, accel: 110, brake: 230, turn: 2.6, tank: 50, burn: 2.5, seats: 4, trunkKg: 40, trunkTable: 'trunk' },
  pickup: { label: 'Pickup Truck', icon: 'truck', length: 52, width: 28, maxSpeed: 175, accel: 100, brake: 210, turn: 2.3, tank: 70, burn: 3.2, seats: 2, trunkKg: 80, trunkTable: 'trunk' },
  van: { label: 'Van', icon: 'van', length: 54, width: 30, maxSpeed: 160, accel: 85, brake: 200, turn: 2.1, tank: 70, burn: 3.5, seats: 2, trunkKg: 120, trunkTable: 'trunk' },
  police: { label: 'Police Car', icon: 'police', length: 48, width: 28, maxSpeed: 225, accel: 135, brake: 250, turn: 2.8, tank: 60, burn: 3, seats: 4, trunkKg: 40, trunkTable: 'police_trunk' },
  ambulance: { label: 'Ambulance', icon: 'ambulance', length: 56, width: 30, maxSpeed: 170, accel: 90, brake: 210, turn: 2.1, tank: 80, burn: 3.6, seats: 2, trunkKg: 100, trunkTable: 'ambulance_trunk' },
  truck: { label: 'Box Truck', icon: 'truck', length: 60, width: 30, maxSpeed: 150, accel: 70, brake: 190, turn: 1.9, tank: 90, burn: 4.2, seats: 2, trunkKg: 160, trunkTable: 'trunk' },
};

/** Tunables shared by every vehicle. */
export const VEHICLE = {
  /** Reverse tops out at this share of forward speed. */
  reverseMul: 0.35,
  /** Coasting deceleration, px / s². */
  rolling: 75,
  /** Below this speed steering does nothing; above it full lock. */
  steerSpeed: 60,
  /** Litres per real second while idling. */
  idleBurn: 0.003,
  /** Battery charge per second while the engine runs; spent per start attempt. */
  charge: 0.6,
  startCost: 8,
  /** Speeds (px / s) above which a crash damages the car / hurts the driver. */
  crashDamage: 45,
  crashHurt: 140,
  /** A gas can holds this many litres. */
  canLitres: 10,
  /** px from a vehicle's outline to use it on foot. */
  reach: 26,
  /** Engine noise radius (tiles) idling and at top speed; the horn. */
  engineNoise: [8, 18] as const,
  hornNoise: 30,
  /** Hitting a zombie faster than this knocks it down; damage per px/s. */
  ramSpeed: 35,
  ramDamage: 0.4,
  /** Seconds to hotwire. */
  hotwireSeconds: 6,
} as const;

export type TireIndex = 0 | 1 | 2 | 3;
export const TIRE_LABELS = ['Front left tyre', 'Front right tyre', 'Rear left tyre', 'Rear right tyre'] as const;

export interface VehicleParts {
  engine: number;
  battery: number;
  tires: [number, number, number, number];
  /** Doors and panels. */
  body: number;
  windows: number;
}

export interface VehicleState {
  id: number;
  kind: VehicleKind;
  /** Paint colour index. */
  variant: number;
  /** Centre, px. */
  x: number;
  y: number;
  angle: number;
  /** px / s along the heading (negative = reversing). */
  speed: number;
  /** Litres. */
  fuel: number;
  parts: VehicleParts;
  engineOn: boolean;
  /** Keys in it. */
  keys: boolean;
  hotwired: boolean;
  /** clientInstanceId of whoever is driving, and passengers. */
  driver: string | null;
  passengers: string[];
}

/** A parked car from the map. */
export interface VehicleSpawn {
  id: number;
  kind: VehicleKind;
  variant: number;
  /** Centre, px. */
  x: number;
  y: number;
  angle: number;
}

const clamp = (v: number, lo = 0, hi = 100) => (v < lo ? lo : v > hi ? hi : v);

/** The parked car's condition: rolled from (seed, id), the same on every client. */
export function spawnVehicle(s: VehicleSpawn, seed: number): VehicleState {
  const r = mulberry32((seed ^ hash32(`vehicle:${s.id}`)) >>> 0);
  const spec = VEHICLE_SPECS[s.kind];
  const official = s.kind === 'police' || s.kind === 'ambulance';
  const fuel = r() < 0.25 ? 0 : spec.tank * (0.05 + r() * (official ? 0.6 : 0.45));
  const tire = () => Math.round(r() < 0.12 ? r() * 12 : 55 + r() * 45);
  return {
    id: s.id,
    kind: s.kind,
    variant: s.variant,
    x: s.x,
    y: s.y,
    angle: s.angle,
    speed: 0,
    fuel: Math.round(fuel * 10) / 10,
    parts: {
      engine: Math.round(30 + r() * 70),
      battery: Math.round(r() < 0.3 ? r() * 10 : 40 + r() * 60),
      tires: [tire(), tire(), tire(), tire()],
      body: Math.round(45 + r() * 55),
      windows: Math.round(r() < 0.1 ? 0 : 70 + r() * 30),
    },
    engineOn: false,
    keys: r() < (official ? 0.15 : 0.3),
    hotwired: false,
    driver: null,
    passengers: [],
  };
}

// ---------------------------------------------------------------- geometry

/** The four corners of a vehicle's body (clockwise). */
export function corners(v: Pick<VehicleState, 'x' | 'y' | 'angle'>, spec: Pick<VehicleSpec, 'length' | 'width'>, pad = 0) {
  const c = Math.cos(v.angle);
  const s = Math.sin(v.angle);
  const hl = spec.length / 2 + pad;
  const hw = spec.width / 2 + pad;
  return [
    { x: v.x + c * hl - s * hw, y: v.y + s * hl + c * hw },
    { x: v.x + c * hl + s * hw, y: v.y + s * hl - c * hw },
    { x: v.x - c * hl + s * hw, y: v.y - s * hl - c * hw },
    { x: v.x - c * hl - s * hw, y: v.y - s * hl + c * hw },
  ];
}

/** Point in the vehicle's local frame (x along the heading). */
export function toLocal(v: Pick<VehicleState, 'x' | 'y' | 'angle'>, x: number, y: number) {
  const dx = x - v.x;
  const dy = y - v.y;
  const c = Math.cos(v.angle);
  const s = Math.sin(v.angle);
  return { x: dx * c + dy * s, y: -dx * s + dy * c };
}

/** Distance from a point to the vehicle's outline (0 inside). */
export function distanceTo(v: Pick<VehicleState, 'x' | 'y' | 'angle'>, spec: Pick<VehicleSpec, 'length' | 'width'>, x: number, y: number): number {
  const p = toLocal(v, x, y);
  const dx = Math.max(0, Math.abs(p.x) - spec.length / 2);
  const dy = Math.max(0, Math.abs(p.y) - spec.width / 2);
  return Math.hypot(dx, dy);
}

type Pt = { x: number; y: number };

/** Separating-axis test for two convex quads. */
export function quadsOverlap(a: Pt[], b: Pt[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const nx = q.y - p.y;
      const ny = p.x - q.x;
      let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
      for (const v of a) {
        const d = v.x * nx + v.y * ny;
        if (d < aMin) aMin = d;
        if (d > aMax) aMax = d;
      }
      for (const v of b) {
        const d = v.x * nx + v.y * ny;
        if (d < bMin) bMin = d;
        if (d > bMax) bMax = d;
      }
      if (aMax <= bMin || bMax <= aMin) return false;
    }
  }
  return true;
}

export function rectQuad(r: { x: number; y: number; w: number; h: number }): Pt[] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ];
}

/** Sample points around the outline (corners plus every ~8 px), for tile collision. */
export function outlinePoints(v: Pick<VehicleState, 'x' | 'y' | 'angle'>, spec: Pick<VehicleSpec, 'length' | 'width'>): Pt[] {
  const cs = corners(v, spec);
  const out: Pt[] = [];
  for (let i = 0; i < 4; i++) {
    const p = cs[i];
    const q = cs[(i + 1) % 4];
    const n = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / 8));
    for (let k = 0; k < n; k++) out.push({ x: p.x + ((q.x - p.x) * k) / n, y: p.y + ((q.y - p.y) * k) / n });
  }
  return out;
}

/** Where the driver gets out: beside the driver's door, else the other side, else behind. */
export function exitPoints(v: Pick<VehicleState, 'x' | 'y' | 'angle'>, spec: Pick<VehicleSpec, 'length' | 'width'>): Pt[] {
  const c = Math.cos(v.angle);
  const s = Math.sin(v.angle);
  const side = spec.width / 2 + 12;
  const back = spec.length / 2 + 12;
  // Left of the heading is (s, -c)
  return [
    { x: v.x + s * side + c * 4, y: v.y - c * side + s * 4 },
    { x: v.x - s * side + c * 4, y: v.y + c * side + s * 4 },
    { x: v.x - c * back, y: v.y - s * back },
    { x: v.x + c * back, y: v.y + s * back },
  ];
}

/** The trunk handle: just behind the vehicle. */
export function trunkPoint(v: Pick<VehicleState, 'x' | 'y' | 'angle'>, spec: Pick<VehicleSpec, 'length'>): Pt {
  const back = spec.length / 2 + 4;
  return { x: v.x - Math.cos(v.angle) * back, y: v.y - Math.sin(v.angle) * back };
}

// ---------------------------------------------------------------- driving

export interface DriveControls {
  /** -1 (brake / reverse) … 1 (accelerate). */
  throttle: number;
  /** -1 (left) … 1 (right). */
  steer: number;
}

export interface DriveResult {
  state: VehicleState;
  /** Impact speed of a crash this step (0 = none). */
  crash: number;
  /** Ran out of fuel this step. */
  stalled: boolean;
  /** px travelled. */
  moved: number;
}

/** Tyres below this are flat. */
export const FLAT_TIRE = 10;

/** Top speed with the current engine and tyres. */
export function topSpeed(v: VehicleState): number {
  const spec = VEHICLE_SPECS[v.kind];
  const flats = v.parts.tires.filter((t) => t < FLAT_TIRE).length;
  const engine = v.parts.engine <= 0 ? 0 : 0.5 + 0.5 * (v.parts.engine / 100);
  return spec.maxSpeed * engine * Math.max(0.25, 1 - 0.25 * flats);
}

/**
 * One physics step. `blocked(x, y)` says whether a point is solid (walls,
 * fences, buildings, parked cars). On a collision the car stops short and
 * bounces back a little.
 */
export function stepVehicle(v: VehicleState, ctl: DriveControls, dt: number, blocked: (x: number, y: number) => boolean): DriveResult {
  const spec = VEHICLE_SPECS[v.kind];
  const top = topSpeed(v);
  const flats = v.parts.tires.filter((t) => t < FLAT_TIRE).length;
  const grip = Math.max(0.4, 1 - 0.15 * flats);
  const enginePower = v.parts.engine <= 0 ? 0 : 0.5 + 0.5 * (v.parts.engine / 100);
  const t = v.engineOn ? Math.max(-1, Math.min(1, ctl.throttle)) : 0;
  let speed = v.speed;

  if (t > 0) {
    if (speed < -5) speed = Math.min(0, speed + spec.brake * grip * t * dt);
    else speed = Math.min(top, speed + spec.accel * enginePower * t * dt);
  } else if (t < 0) {
    if (speed > 5) speed = Math.max(0, speed + spec.brake * grip * t * dt);
    else speed = Math.max(-top * VEHICLE.reverseMul, speed + spec.accel * 0.6 * enginePower * t * dt);
  } else {
    const roll = VEHICLE.rolling * dt * (v.engineOn ? 1 : 1.5);
    speed = Math.abs(speed) <= roll ? 0 : speed - Math.sign(speed) * roll;
  }
  // Over the top speed (damage, a flat): drag it down
  if (speed > top) speed = Math.max(top, speed - spec.brake * dt);

  const steer = Math.max(-1, Math.min(1, ctl.steer));
  const steerAmount = Math.min(1, Math.abs(speed) / VEHICLE.steerSpeed) * Math.sign(speed);
  const angle = v.angle + steer * spec.turn * grip * steerAmount * dt;
  const nx = v.x + Math.cos(angle) * speed * dt;
  const ny = v.y + Math.sin(angle) * speed * dt;

  let crash = 0;
  let next: VehicleState = { ...v, speed, angle, x: nx, y: ny };
  if (speed !== 0 || angle !== v.angle) {
    const hit = outlinePoints(next, spec).some((p) => blocked(p.x, p.y));
    if (hit) {
      crash = Math.abs(v.speed);
      next = { ...v, speed: -v.speed * 0.25 };
      // Bounced back into something too? Just stop.
      const back = { ...next, x: v.x + Math.cos(v.angle) * next.speed * dt, y: v.y + Math.sin(v.angle) * next.speed * dt };
      if (!outlinePoints(back, spec).some((p) => blocked(p.x, p.y))) next = back;
      else next = { ...next, speed: 0 };
    }
  }
  const moved = Math.hypot(next.x - v.x, next.y - v.y);

  // Fuel and battery
  let fuel = next.fuel;
  let battery = next.parts.battery;
  let stalled = false;
  if (next.engineOn) {
    fuel = Math.max(0, fuel - (moved / 16 / 100) * spec.burn - VEHICLE.idleBurn * dt);
    battery = Math.min(100, battery + VEHICLE.charge * dt);
    if (fuel <= 0) stalled = true;
  }
  next = { ...next, fuel, engineOn: next.engineOn && !stalled, parts: battery !== next.parts.battery ? { ...next.parts, battery } : next.parts };
  return { state: next, crash, stalled, moved };
}

/** What a crash at `impact` px/s does to the car (and the driver, in HP). */
export function crashDamage(v: VehicleState, impact: number): { state: VehicleState; driverHurt: number } {
  if (impact <= VEHICLE.crashDamage) return { state: v, driverHurt: 0 };
  const dmg = (impact - VEHICLE.crashDamage) / 6;
  const p = v.parts;
  const parts: VehicleParts = {
    ...p,
    engine: clamp(p.engine - dmg * 0.5),
    body: clamp(p.body - dmg),
    windows: impact > 120 ? clamp(p.windows - dmg * 0.8) : p.windows,
    tires: impact > 150 ? (p.tires.map((t) => clamp(t - dmg * 0.3)) as VehicleParts['tires']) : p.tires,
  };
  // Doors and panels soak up the blow while they last
  const driverHurt = impact > VEHICLE.crashHurt ? ((impact - VEHICLE.crashHurt) / 8) * (p.body < 30 ? 1.6 : 1) : 0;
  return { state: { ...v, parts, engineOn: parts.engine > 0 && v.engineOn }, driverHurt };
}

/** Hitting a zombie at `speed`: the car takes a little damage. */
export function ramDamage(v: VehicleState, speed: number): VehicleState {
  const d = 1 + Math.abs(speed) / 70;
  return { ...v, parts: { ...v.parts, body: clamp(v.parts.body - d), windows: clamp(v.parts.windows - d * 0.4), engine: clamp(v.parts.engine - d * 0.3) } };
}

export type StartResult = 'started' | 'noKey' | 'noFuel' | 'deadBattery' | 'brokenEngine' | 'failed';

export const START_TEXT: Record<Exclude<StartResult, 'started'>, string> = {
  noKey: 'No key. Hotwire it (Burglar, or Electrical 1 + Mechanics 2)',
  noFuel: 'The tank is empty',
  deadBattery: 'The battery is dead',
  brokenEngine: 'The engine is wrecked',
  failed: 'The engine coughs and dies — try again',
};

/** Turning the key: battery, fuel and engine permitting (a worn engine may need a few tries). */
export function startEngine(v: VehicleState, roll: number): { state: VehicleState; result: StartResult } {
  if (!v.keys && !v.hotwired) return { state: v, result: 'noKey' };
  if (v.parts.engine <= 0) return { state: v, result: 'brokenEngine' };
  if (v.parts.battery < VEHICLE.startCost) return { state: v, result: 'deadBattery' };
  const parts = { ...v.parts, battery: v.parts.battery - VEHICLE.startCost };
  if (v.fuel <= 0) return { state: { ...v, parts }, result: 'noFuel' };
  const chance = 0.35 + 0.65 * (v.parts.engine / 100);
  if (roll >= chance) return { state: { ...v, parts }, result: 'failed' };
  return { state: { ...v, parts, engineOn: true }, result: 'started' };
}

export function canHotwire(perks: readonly string[], electrical: number, mechanics: number): boolean {
  return perks.includes('hotwire') || (electrical >= 1 && mechanics >= 2);
}

/** Engine noise radius (tiles) at this speed; 0 with the engine off. */
export function engineNoise(v: VehicleState): number {
  if (!v.engineOn) return 0;
  const [lo, hi] = VEHICLE.engineNoise;
  return lo + (hi - lo) * Math.min(1, Math.abs(v.speed) / VEHICLE_SPECS[v.kind].maxSpeed);
}

// ---------------------------------------------------------------- parts & service

/** Actions on a vehicle (wire index = position; append only). */
export const VEHICLE_ACTIONS = ['enter', 'ride', 'exit', 'refuel', 'siphon', 'hotwire', 'tire', 'battery', 'engine', 'windows', 'body', 'takeTire', 'takeBattery'] as const;
export type VehicleAction = (typeof VEHICLE_ACTIONS)[number];

/** What a service action uses up and needs as tools (checked by the player before asking). */
export const SERVICE_ITEMS: Partial<Record<VehicleAction, { spend: { def: ItemDefId; qty: number }[]; tools: ItemDefId[]; skill?: { id: 'mechanics' | 'metalworking'; level: number } }>> = {
  refuel: { spend: [{ def: 'gas_can_full', qty: 1 }], tools: [] },
  siphon: { spend: [{ def: 'gas_can', qty: 1 }], tools: [] },
  tire: { spend: [{ def: 'spare_tire', qty: 1 }], tools: ['wrench'] },
  battery: { spend: [{ def: 'car_battery', qty: 1 }], tools: ['wrench'] },
  engine: { spend: [{ def: 'scrap_metal', qty: 1 }], tools: ['wrench'], skill: { id: 'mechanics', level: 1 } },
  windows: { spend: [{ def: 'duct_tape', qty: 1 }], tools: [] },
  body: { spend: [{ def: 'metal_sheet', qty: 1 }], tools: ['blowtorch'], skill: { id: 'metalworking', level: 1 } },
  takeTire: { spend: [], tools: ['wrench'] },
  takeBattery: { spend: [], tools: ['wrench'] },
};

export const VEHICLE_ACTION_LABEL: Record<VehicleAction, string> = {
  enter: 'Drive',
  ride: 'Ride along',
  exit: 'Get out',
  refuel: 'Refuel (gas can)',
  siphon: 'Siphon fuel',
  hotwire: 'Hotwire',
  tire: 'Fit spare tyre',
  battery: 'Fit battery',
  engine: 'Repair engine',
  windows: 'Tape windows',
  body: 'Weld panels',
  takeTire: 'Take off a tyre',
  takeBattery: 'Take out battery',
};

/** An item handed back by a service (the old tyre / battery, a filled can), with its condition 0–1. */
export interface ServiceReturn {
  def: ItemDefId;
  cond?: number;
}

/**
 * Host: applies a service to a parked vehicle. `cond` is the condition (0–1)
 * of the part being fitted; `level` the relevant skill.
 */
export function applyService(v: VehicleState, a: VehicleAction, opts: { cond?: number; level?: number } = {}): { state: VehicleState; gives: ServiceReturn[] } | { error: string } {
  const spec = VEHICLE_SPECS[v.kind];
  const p = v.parts;
  if (v.driver && a !== 'exit') return { error: 'Someone is driving it' };
  switch (a) {
    case 'refuel': {
      if (v.fuel >= spec.tank - 0.5) return { error: 'The tank is full' };
      return { state: { ...v, fuel: Math.min(spec.tank, v.fuel + VEHICLE.canLitres) }, gives: [{ def: 'gas_can' }] };
    }
    case 'siphon': {
      if (v.fuel < VEHICLE.canLitres) return { error: 'Not enough fuel in it to fill a can' };
      return { state: { ...v, fuel: v.fuel - VEHICLE.canLitres }, gives: [{ def: 'gas_can_full' }] };
    }
    case 'hotwire': {
      if (v.keys || v.hotwired) return { error: 'No need: it starts already' };
      return { state: { ...v, hotwired: true }, gives: [] };
    }
    case 'tire': {
      const i = worstTire(p.tires);
      if (p.tires[i] >= 95) return { error: 'The tyres are fine' };
      const tires = p.tires.slice() as VehicleParts['tires'];
      const old = tires[i];
      tires[i] = clamp(Math.round((opts.cond ?? 1) * 100));
      return { state: { ...v, parts: { ...p, tires } }, gives: old > 5 ? [{ def: 'spare_tire', cond: old / 100 }] : [] };
    }
    case 'battery': {
      if (p.battery >= 95) return { error: 'The battery is fine' };
      return { state: { ...v, parts: { ...p, battery: clamp(Math.round((opts.cond ?? 1) * 100)) } }, gives: p.battery > 5 ? [{ def: 'car_battery', cond: p.battery / 100 }] : [] };
    }
    case 'engine': {
      if (p.engine >= 100) return { error: 'The engine is fine' };
      return { state: { ...v, parts: { ...p, engine: clamp(p.engine + 10 + 5 * (opts.level ?? 0)) } }, gives: [] };
    }
    case 'windows': {
      if (p.windows >= 100) return { error: 'The windows are fine' };
      return { state: { ...v, parts: { ...p, windows: clamp(p.windows + 35) } }, gives: [] };
    }
    case 'body': {
      if (p.body >= 100) return { error: 'The panels are fine' };
      return { state: { ...v, parts: { ...p, body: clamp(p.body + 40) } }, gives: [] };
    }
    case 'takeTire': {
      const i = bestTire(p.tires);
      if (p.tires[i] <= 5) return { error: 'No tyre worth taking' };
      const tires = p.tires.slice() as VehicleParts['tires'];
      const old = tires[i];
      tires[i] = 0;
      return { state: { ...v, parts: { ...p, tires } }, gives: [{ def: 'spare_tire', cond: old / 100 }] };
    }
    case 'takeBattery': {
      if (p.battery <= 5) return { error: 'The battery is dead' };
      return { state: { ...v, engineOn: false, parts: { ...p, battery: 0 } }, gives: [{ def: 'car_battery', cond: p.battery / 100 }] };
    }
    default:
      return { error: "You can't do that" };
  }
}

export function worstTire(t: VehicleParts['tires']): TireIndex {
  let i = 0;
  for (let k = 1; k < 4; k++) if (t[k] < t[i]) i = k;
  return i as TireIndex;
}

export function bestTire(t: VehicleParts['tires']): TireIndex {
  let i = 0;
  for (let k = 1; k < 4; k++) if (t[k] > t[i]) i = k;
  return i as TireIndex;
}

// ---------------------------------------------------------------- wire

/**
 * [id, kindIdx, variant, x, y, angle × 1000, speed, fuel × 10, engine, battery, t0, t1, t2, t3, body, windows,
 *  flags (1 engine on, 2 keys, 4 hotwired), driver ('' none), passengers (comma list)]
 */
export type VehicleRow = [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, string, string];

export function encodeVehicle(v: VehicleState): VehicleRow {
  const p = v.parts;
  return [
    v.id,
    VEHICLE_KINDS.indexOf(v.kind),
    v.variant,
    Math.round(v.x),
    Math.round(v.y),
    Math.round(v.angle * 1000),
    Math.round(v.speed),
    Math.round(v.fuel * 10),
    Math.round(p.engine),
    Math.round(p.battery),
    Math.round(p.tires[0]),
    Math.round(p.tires[1]),
    Math.round(p.tires[2]),
    Math.round(p.tires[3]),
    Math.round(p.body),
    Math.round(p.windows),
    (v.engineOn ? 1 : 0) | (v.keys ? 2 : 0) | (v.hotwired ? 4 : 0),
    v.driver ?? '',
    v.passengers.join(','),
  ];
}

/** Validates a wire row (junk is rejected, numbers clamped). */
export function decodeVehicle(row: unknown): VehicleState | null {
  if (!Array.isArray(row) || row.length < 17) return null;
  const n = (i: number) => (typeof row[i] === 'number' && Number.isFinite(row[i]) ? (row[i] as number) : NaN);
  const kind = VEHICLE_KINDS[n(1)];
  if (!kind || !Number.isInteger(n(0)) || [3, 4, 5, 6, 7].some((i) => Number.isNaN(n(i)))) return null;
  const spec = VEHICLE_SPECS[kind];
  const flags = n(16) | 0;
  const part = (i: number) => clamp(Number.isNaN(n(i)) ? 0 : n(i));
  return {
    id: n(0),
    kind,
    variant: Number.isNaN(n(2)) ? 0 : n(2) | 0,
    x: n(3),
    y: n(4),
    angle: n(5) / 1000,
    speed: clamp(n(6), -spec.maxSpeed, spec.maxSpeed),
    fuel: clamp(n(7) / 10, 0, spec.tank),
    parts: { engine: part(8), battery: part(9), tires: [part(10), part(11), part(12), part(13)], body: part(14), windows: part(15) },
    engineOn: (flags & 1) !== 0,
    keys: (flags & 2) !== 0,
    hotwired: (flags & 4) !== 0,
    driver: typeof row[17] === 'string' && row[17] ? (row[17] as string).slice(0, 64) : null,
    passengers: typeof row[18] === 'string' && row[18] ? (row[18] as string).split(',').filter(Boolean).slice(0, 8) : [],
  };
}

/** Same in everything that matters on the wire (used to skip resending). */
export function sameVehicle(a: VehicleState, b: VehicleState): boolean {
  return JSON.stringify(encodeVehicle(a)) === JSON.stringify(encodeVehicle(b));
}
