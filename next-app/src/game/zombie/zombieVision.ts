import { Rect } from '../collision';
import { BuildingDefinition } from '../map/buildings';
import { TileGrid, inBounds, tileIndex, worldToTile } from './grid';
import { DEFAULT_FOV, FovResult, VIS_HIDDEN, VIS_VISIBLE, computeFov, visibilityAt } from './fov';
import { wallsBetween } from './zombieSim';
import { FLASHLIGHT, type DaylightVision } from './survival/daycycle';
import { FovMaskRenderer } from './fovMask';
import { buildZombieGrid } from './zombieGrid';
import { Entrance } from './entrances';

// ============================================================
// ZOMBIE MODE — VISION CONTROLLER
// The one object WorldGame talks to: smooths facing, recomputes
// FOV only when the view actually changes, and owns the fog mask.
// ============================================================

/** Facing turn speed (rad/s) so the cone sweeps instead of snapping. */
const TURN_RATE = 14;
/** Recompute when facing drifts more than this (rad). */
const FACING_EPSILON = 0.03;
/** Cone width is quantised to 5° so dusk doesn't recompute every frame. */
const CONE_STEP = (5 * Math.PI) / 180;
/** Light pools are only seen within this distance (tiles). */
const LIGHT_SIGHT_TILES = 24;

function wrap(a: number): number {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

export class ZombieVision {
  readonly grid: TileGrid;
  private mask: FovMaskRenderer | null = null;
  private fov: FovResult | null = null;
  private facing = Math.PI / 2;
  private targetFacing = Math.PI / 2;
  private computedFacing = NaN;
  private computedTile = -1;
  private computedInside: string | null | undefined = undefined;
  private aim: number | null = null;

  constructor(
    structuralWalls: Rect[],
    private buildings: BuildingDefinition[],
    worldWidth: number,
    worldHeight: number,
    entrances: Entrance[] = [],
    lowWalls: Rect[] = []
  ) {
    this.grid = buildZombieGrid(structuralWalls, buildings, worldWidth, worldHeight, entrances, lowWalls);
  }

  /** Mouse aim (radians) overrides movement facing while set; null hands control back to movement. */
  setAim(angle: number | null) {
    this.aim = angle;
  }

  /** View-radius multiplier (toxic gas shrinks it). Quantised so it doesn't recompute every frame. */
  setViewScale(mul: number) {
    const q = Math.round(Math.max(0.2, Math.min(1, mul)) * 10) / 10;
    if (q === this.viewScale) return;
    this.viewScale = q;
    this.invalidate();
  }
  private viewScale = 1;

  /** Time-of-day vision (identity until a day cycle is applied). */
  setDaylight(v: DaylightVision) {
    const next = {
      radiusMul: Math.round(DEFAULT_FOV.viewRadius * v.radiusMul) / DEFAULT_FOV.viewRadius, // whole tiles
      coneAngle: Math.round(v.coneAngle / CONE_STEP) * CONE_STEP,
      peripheral: Math.round(v.peripheral * 2) / 2,
    };
    const d = this.daylight;
    if (d.radiusMul === next.radiusMul && d.coneAngle === next.coneAngle && d.peripheral === next.peripheral) return;
    this.daylight = next;
    this.invalidate();
  }
  private daylight: DaylightVision = { radiusMul: 1, coneAngle: DEFAULT_FOV.coneAngle, peripheral: DEFAULT_FOV.peripheralRadius };

  /** Flashlight: a narrow beam with daylight reach. */
  setFlashlight(on: boolean) {
    if (on === this.flashlight) return;
    this.flashlight = on;
    this.invalidate();
  }
  private flashlight = false;

  /**
   * Light pools (street lamps, muzzle flashes) as world-px centres + radius in
   * tiles: lit tiles in line of sight count as seen even beyond the view radius.
   */
  setLights(lights: { x: number; y: number; r: number }[]) {
    const key = lights.map((l) => `${Math.round(l.x)},${Math.round(l.y)},${l.r}`).join(';');
    if (key === this.lightsKey) return;
    this.lightsKey = key;
    this.lights = lights;
    this.invalidate();
  }
  private lights: { x: number; y: number; r: number }[] = [];
  private lightsKey = '';

  /** 0 by day → 1 at night: the fog outside your sight gets blacker. */
  setDarkness(d: number) {
    const q = Math.round(Math.max(0, Math.min(1, d)) * 10) / 10;
    if (q === this.darkness) return;
    this.darkness = q;
    this.invalidate();
  }
  private darkness = 0;

  /** Forces a recompute next update (a door opened/closed, a window was boarded…). */
  invalidate() {
    this.computedTile = -1;
  }

  /** Call once per frame with the player's feet point and raw movement input. */
  update(dt: number, feetX: number, feetY: number, moveX: number, moveY: number, insideBuildingId: string | null) {
    if (this.aim !== null) this.targetFacing = this.aim;
    else if (moveX !== 0 || moveY !== 0) this.targetFacing = Math.atan2(moveY, moveX);
    const diff = wrap(this.targetFacing - this.facing);
    const step = TURN_RATE * dt;
    this.facing = Math.abs(diff) <= step ? this.targetFacing : wrap(this.facing + Math.sign(diff) * step);

    const { col, row } = worldToTile(this.grid, feetX, feetY);
    const tile = inBounds(this.grid, col, row) ? tileIndex(this.grid, col, row) : -1;
    const turned = !(Math.abs(wrap(this.facing - this.computedFacing)) < FACING_EPSILON);
    if (!turned && tile === this.computedTile && insideBuildingId === this.computedInside) return;

    this.computedFacing = this.facing;
    this.computedTile = tile;
    this.computedInside = insideBuildingId;
    // Daylight sets reach and cone; the flashlight trades width for reach; gas shrinks everything
    const day = this.daylight;
    const radiusMul = this.flashlight ? Math.max(day.radiusMul, FLASHLIGHT.radiusMul) : day.radiusMul;
    this.fov = computeFov(
      this.grid,
      {
        originX: feetX,
        originY: feetY,
        facing: this.facing,
        coneAngle: this.flashlight ? FLASHLIGHT.coneAngle : day.coneAngle,
        viewRadius: DEFAULT_FOV.viewRadius * radiusMul * this.viewScale,
        peripheralRadius: day.peripheral,
      },
      this.fov ?? undefined
    );
    this.applyLights(feetX, feetY);
    this.revealRoofs(insideBuildingId);
    // No DOM in tests / SSR: FOV still computes, only the fog canvas is skipped
    if (!this.mask && typeof document !== 'undefined') this.mask = new FovMaskRenderer(this.grid);
    this.mask?.update(this.fov, this.darkness);
  }

  /** Lit tiles you have line of sight to are visible, however dark it is. */
  private applyLights(feetX: number, feetY: number) {
    const fov = this.fov;
    if (!fov || !this.lights.length) return;
    const g = this.grid;
    const ts = g.tileSize;
    const maxReach = LIGHT_SIGHT_TILES * ts;
    for (const l of this.lights) {
      if (Math.hypot(l.x - feetX, l.y - feetY) > maxReach + l.r * ts) continue;
      const { col: lc, row: lr } = worldToTile(g, l.x, l.y);
      const r = Math.ceil(l.r);
      for (let row = lr - r; row <= lr + r; row++) {
        for (let col = lc - r; col <= lc + r; col++) {
          if (!inBounds(g, col, row) || (col - lc) ** 2 + (row - lr) ** 2 > l.r * l.r) continue;
          const i = tileIndex(g, col, row);
          if (fov.vis[i] === VIS_VISIBLE) continue;
          const cx = (col + 0.5) * ts;
          const cy = (row + 0.5) * ts;
          if (Math.hypot(cx - feetX, cy - feetY) > maxReach) continue;
          if (wallsBetween(g, feetX, feetY, cx, cy, 1) === 0) fov.vis[i] = VIS_VISIBLE;
        }
      }
    }
  }

  /**
   * Roofs are exterior surfaces: if any tile of a building you're NOT in is
   * seen (usually its walls), the whole roof reads at that level instead of
   * being swallowed by fog.
   */
  private revealRoofs(insideBuildingId: string | null) {
    const fov = this.fov;
    if (!fov) return;
    const vis = fov.vis;
    const buildingIndex = this.grid.buildingIndex;
    const best = new Uint8Array(this.buildings.length + 1);
    const outdoorOnly = (bi: number) => bi > 0 && this.buildings[bi - 1].id !== insideBuildingId;
    for (let i = 0; i < vis.length; i++) {
      const bi = buildingIndex[i];
      if (outdoorOnly(bi) && vis[i] > best[bi]) best[bi] = vis[i];
    }
    for (let i = 0; i < vis.length; i++) {
      const bi = buildingIndex[i];
      if (outdoorOnly(bi) && best[bi] > vis[i]) vis[i] = best[bi];
    }
  }

  /** VIS_* level at a world point (VIS_HIDDEN before the first update). */
  visibilityAt(x: number, y: number): number {
    return this.fov ? visibilityAt(this.grid, this.fov, x, y) : VIS_HIDDEN;
  }

  getFacing(): number {
    return this.facing;
  }

  /** Draw in world space (camera transform applied), after entities. */
  render(ctx: CanvasRenderingContext2D) {
    this.mask?.render(ctx);
  }

  dispose() {
    this.mask?.dispose();
    this.mask = null;
    this.fov = null;
  }
}
