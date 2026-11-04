import { Rect } from '../collision';
import { BuildingDefinition } from '../map/buildings';
import { TileGrid, inBounds, tileIndex, worldToTile } from './grid';
import { DEFAULT_FOV, FovResult, VIS_HIDDEN, computeFov, visibilityAt } from './fov';
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
    this.fov = computeFov(
      this.grid,
      { originX: feetX, originY: feetY, facing: this.facing, ...DEFAULT_FOV },
      this.fov ?? undefined
    );
    this.revealRoofs(insideBuildingId);
    // No DOM in tests / SSR: FOV still computes, only the fog canvas is skipped
    if (!this.mask && typeof document !== 'undefined') this.mask = new FovMaskRenderer(this.grid);
    this.mask?.update(this.fov);
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
