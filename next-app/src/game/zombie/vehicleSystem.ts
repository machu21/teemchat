import { TILE_SOLID, inBounds, type TileGrid } from './grid';
import {
  VEHICLE_SPECS,
  corners,
  decodeVehicle,
  distanceTo,
  encodeVehicle,
  quadsOverlap,
  rectQuad,
  sameVehicle,
  spawnVehicle,
  toLocal,
  trunkPoint,
  type VehicleRow,
  type VehicleSpawn,
  type VehicleState,
} from './survival/vehicles';
import type { Rect } from '../collision';

// ============================================================
// ZOMBIE MODE — VEHICLE SYSTEM (stateful side of survival/vehicles.ts)
// Every client starts from the same seeded cars (spawnVehicle), so only
// vehicles that changed travel on the wire (`zsnap.vh`, plus the driver's
// `zveh` updates). Parked vehicles are stamped into the zombie tile grid
// as solid tiles, so zombies path around them like the old baked cars;
// a vehicle someone is driving is unstamped while it moves.
// ============================================================

/** Trunk containers get ids from here (between map containers and runtime piles). */
export const TRUNK_ID_BASE = 800_000;

const CAR_COLORS = ['#C0392B', '#2E86C1', '#F1C40F', '#7F8C8D', '#27AE60', '#ECF0F1', '#1F2D44', '#F4F6F8'];

export class VehicleSystem {
  readonly vehicles = new Map<number, VehicleState>();
  private readonly seeded = new Map<number, string>();
  /** Changed since the last snapshot (host). */
  readonly changed = new Set<number>();
  /** Differ from their seeded state (resent to late joiners). */
  readonly dirty = new Set<number>();
  /** Tiles each parked vehicle made solid, and how many vehicles hold each tile. */
  private readonly stamped = new Map<number, number[]>();
  private readonly tileRef = new Map<number, number>();
  /** Called when stamping changed the grid (flow fields need a rebuild). */
  onGridChanged?: () => void;

  constructor(
    private readonly grid: TileGrid,
    spawns: VehicleSpawn[] = [],
    seed = 0
  ) {
    for (const s of spawns) {
      const v = spawnVehicle(s, seed);
      this.vehicles.set(v.id, v);
      this.seeded.set(v.id, JSON.stringify(encodeVehicle(v)));
      this.stamp(v);
    }
  }

  get size(): number {
    return this.vehicles.size;
  }

  static trunkId(v: Pick<VehicleState, 'id'>): number {
    return TRUNK_ID_BASE + v.id;
  }

  // ------------------------------------------------------------ grid

  /** Marks the tiles under a parked vehicle solid (only tiles that weren't already). */
  private stamp(v: VehicleState) {
    if (this.stamped.has(v.id)) return;
    const g = this.grid;
    const ts = g.tileSize;
    const spec = VEHICLE_SPECS[v.kind];
    const r = Math.hypot(spec.length, spec.width) / 2;
    const tiles: number[] = [];
    for (let row = Math.floor((v.y - r) / ts); row <= Math.floor((v.y + r) / ts); row++) {
      for (let col = Math.floor((v.x - r) / ts); col <= Math.floor((v.x + r) / ts); col++) {
        if (!inBounds(g, col, row)) continue;
        const p = toLocal(v, (col + 0.5) * ts, (row + 0.5) * ts);
        if (Math.abs(p.x) > spec.length / 2 || Math.abs(p.y) > spec.width / 2) continue;
        const i = row * g.cols + col;
        const ref = this.tileRef.get(i) ?? 0;
        if (ref === 0 && g.flags[i] & TILE_SOLID) continue; // a wall or fence already
        if (ref === 0) g.flags[i] |= TILE_SOLID;
        this.tileRef.set(i, ref + 1);
        tiles.push(i);
      }
    }
    this.stamped.set(v.id, tiles);
    if (tiles.length) this.onGridChanged?.();
  }

  private unstamp(id: number) {
    const tiles = this.stamped.get(id);
    if (!tiles) return;
    this.stamped.delete(id);
    for (const i of tiles) {
      const ref = (this.tileRef.get(i) ?? 1) - 1;
      if (ref <= 0) {
        this.tileRef.delete(i);
        this.grid.flags[i] &= ~TILE_SOLID;
      } else {
        this.tileRef.set(i, ref);
      }
    }
    if (tiles.length) this.onGridChanged?.();
  }

  // ------------------------------------------------------------ state

  /**
   * Replaces a vehicle's state. Moving vehicles (driven) are unstamped; when
   * one is left standing it's stamped where it stopped.
   */
  set(v: VehicleState) {
    const prev = this.vehicles.get(v.id);
    this.vehicles.set(v.id, v);
    const driven = v.driver !== null;
    const moved = !prev || Math.abs(prev.x - v.x) > 0.5 || Math.abs(prev.y - v.y) > 0.5 || Math.abs(prev.angle - v.angle) > 0.01;
    if (driven) this.unstamp(v.id);
    else if (moved || prev?.driver) {
      this.unstamp(v.id);
      this.stamp(v);
    }
    this.changed.add(v.id);
    if (this.seeded.get(v.id) === JSON.stringify(encodeVehicle(v))) this.dirty.delete(v.id);
    else this.dirty.add(v.id);
  }

  get(id: number): VehicleState | undefined {
    return this.vehicles.get(id);
  }

  /** The vehicle a player is in (driving or riding). */
  occupiedBy(clientId: string): VehicleState | null {
    for (const v of this.vehicles.values()) if (v.driver === clientId || v.passengers.includes(clientId)) return v;
    return null;
  }

  /** The closest vehicle within `reach` px of a point (outline distance). */
  near(x: number, y: number, reach: number): VehicleState | null {
    let best: VehicleState | null = null;
    let bestD = reach;
    for (const v of this.vehicles.values()) {
      if (Math.abs(v.x - x) > 80 || Math.abs(v.y - y) > 80) continue;
      const d = distanceTo(v, VEHICLE_SPECS[v.kind], x, y);
      if (d <= bestD) {
        best = v;
        bestD = d;
      }
    }
    return best;
  }

  /** Any vehicle body overlapping a box (players on foot can't walk through cars). */
  blocksBox(box: Rect, ignoreId = -1): boolean {
    const q = rectQuad(box);
    for (const v of this.vehicles.values()) {
      if (v.id === ignoreId) continue;
      if (Math.abs(v.x - (box.x + box.w / 2)) > 60 || Math.abs(v.y - (box.y + box.h / 2)) > 60) continue;
      if (quadsOverlap(corners(v, VEHICLE_SPECS[v.kind]), q)) return true;
    }
    return false;
  }

  /** Driving collisions for vehicle `id`: solid tiles (not its own stamp) and other vehicles' bodies. */
  blockedPoint(id: number, x: number, y: number): boolean {
    const g = this.grid;
    const ts = g.tileSize;
    const col = Math.floor(x / ts);
    const row = Math.floor(y / ts);
    if (!inBounds(g, col, row)) return true;
    const i = row * g.cols + col;
    // A parked car's stamp is coarse (whole tiles): for those, the real outline below decides
    if (g.flags[i] & TILE_SOLID && !this.tileRef.has(i)) return true;
    for (const v of this.vehicles.values()) {
      if (v.id === id || Math.abs(v.x - x) > 40 || Math.abs(v.y - y) > 40) continue;
      const p = toLocal(v, x, y);
      const spec = VEHICLE_SPECS[v.kind];
      if (Math.abs(p.x) <= spec.length / 2 && Math.abs(p.y) <= spec.width / 2) return true;
    }
    return false;
  }

  /** Where the trunk container sits for this vehicle right now. */
  trunkAt(v: VehicleState) {
    return trunkPoint(v, VEHICLE_SPECS[v.kind]);
  }

  // ------------------------------------------------------------ wire

  /** Rows for the snapshot: what changed, or everything that differs from the seed. */
  rows(resendAll: boolean): VehicleRow[] {
    const ids = resendAll ? this.dirty : this.changed;
    const out: VehicleRow[] = [];
    for (const id of ids) {
      const v = this.vehicles.get(id);
      if (v) out.push(encodeVehicle(v));
    }
    this.changed.clear();
    return out;
  }

  /**
   * A row from the host or a driver. `selfId`'s own vehicle (while driving it)
   * isn't overwritten: the driver is authoritative for it.
   */
  applyRow(row: unknown, selfId: string | null): VehicleState | null {
    const v = decodeVehicle(row);
    if (!v) return null;
    const have = this.vehicles.get(v.id);
    if (!have) return null;
    if (selfId && have.driver === selfId && v.driver === selfId) return null;
    if (sameVehicle(have, v)) return have;
    this.set(v);
    this.changed.delete(v.id);
    return v;
  }

  // ------------------------------------------------------------ drawing

  draw(ctx: CanvasRenderingContext2D, v: VehicleState, time: number) {
    const spec = VEHICLE_SPECS[v.kind];
    const L = spec.length;
    const W = spec.width;
    const body =
      v.kind === 'police' ? '#1F2D44' : v.kind === 'ambulance' ? '#F4F6F8' : v.kind === 'truck' ? '#D9DDE1' : CAR_COLORS[v.variant % 6];
    const dark = shade(body, -0.25);
    const glass = v.parts.windows <= 0 ? '#6B7280' : '#2C3E50';
    ctx.save();
    ctx.translate(Math.round(v.x), Math.round(v.y));
    // Shadow (unrotated offset reads as sun from the top-left)
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.save();
    ctx.translate(2, 3);
    ctx.rotate(v.angle);
    ctx.fillRect(-L / 2, -W / 2, L, W);
    ctx.restore();
    ctx.rotate(v.angle);
    // Outline and body; the nose is at +x
    ctx.fillStyle = '#1E2124';
    ctx.fillRect(-L / 2, -W / 2, L, W);
    ctx.fillStyle = body;
    ctx.fillRect(-L / 2 + 1, -W / 2 + 1, L - 2, W - 2);
    ctx.fillStyle = shade(body, 0.15);
    ctx.fillRect(-L / 2 + 1, -W / 2 + 1, L - 2, 2);
    const hw = W / 2 - 4;
    if (v.kind === 'pickup') {
      // Cab up front, open bed behind
      ctx.fillStyle = glass;
      ctx.fillRect(L / 2 - 20, -hw, 6, hw * 2);
      ctx.fillStyle = dark;
      ctx.fillRect(-L / 2 + 3, -hw, L / 2 - 2, hw * 2);
      ctx.fillStyle = shade(body, -0.4);
      for (let k = 0; k < 3; k++) ctx.fillRect(-L / 2 + 6 + k * 7, -hw + 1, 1, hw * 2 - 2);
    } else if (v.kind === 'truck') {
      // Cab and a tall box
      ctx.fillStyle = '#B03A2E';
      ctx.fillRect(L / 2 - 16, -W / 2 + 1, 15, W - 2);
      ctx.fillStyle = glass;
      ctx.fillRect(L / 2 - 7, -hw, 4, hw * 2);
      ctx.fillStyle = '#BFC5CB';
      ctx.fillRect(-L / 2 + 2, -W / 2 + 2, L - 20, W - 4);
    } else {
      // Sedan / van / police / ambulance: windscreen, roof, rear window
      const roofFront = v.kind === 'van' || v.kind === 'ambulance' ? L / 2 - 12 : 6;
      const roofBack = v.kind === 'van' || v.kind === 'ambulance' ? -L / 2 + 3 : -12;
      ctx.fillStyle = glass;
      ctx.fillRect(roofFront, -hw, 8, hw * 2);
      if (roofBack > -L / 2 + 4) ctx.fillRect(roofBack - 6, -hw, 6, hw * 2);
      ctx.fillStyle = shade(body, -0.1);
      ctx.fillRect(roofBack, -hw, roofFront - roofBack, hw * 2);
      if (v.kind === 'ambulance') {
        ctx.fillStyle = '#DC2626';
        ctx.fillRect(roofBack, -2, roofFront - roofBack, 4);
      }
      if (v.kind === 'police' || v.kind === 'ambulance') {
        // Light bar: flashes while the engine runs
        const on = v.engineOn && Math.floor(time * 4) % 2 === 0;
        const lx = (roofFront + roofBack) / 2;
        ctx.fillStyle = on ? '#EF4444' : '#991B1B';
        ctx.fillRect(lx - 2, -hw, 4, hw);
        ctx.fillStyle = on ? '#1E3A8A' : '#60A5FA';
        ctx.fillRect(lx - 2, 0, 4, hw);
      }
    }
    // Headlights (bright with the engine on) and tail lights
    ctx.fillStyle = v.engineOn ? '#FEF9C3' : '#D1D5DB';
    ctx.fillRect(L / 2 - 2, -W / 2 + 3, 2, 4);
    ctx.fillRect(L / 2 - 2, W / 2 - 7, 2, 4);
    ctx.fillStyle = '#B91C1C';
    ctx.fillRect(-L / 2, -W / 2 + 3, 2, 3);
    ctx.fillRect(-L / 2, W / 2 - 6, 2, 3);
    // Battered: dents and scrapes
    if (v.parts.body < 50) {
      ctx.fillStyle = 'rgba(30,33,36,0.55)';
      ctx.fillRect(L / 2 - 10, W / 2 - 4, 6, 2);
      if (v.parts.body < 25) ctx.fillRect(-L / 4, -W / 2 + 1, 8, 2);
    }
    ctx.restore();
  }
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + (amt < 0 ? c * amt : (255 - c) * amt))));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
