import { TileGrid, inBounds, isOpaque, tileIndex, worldToTile } from './grid';

// ============================================================
// ZOMBIE MODE — DIRECTIONAL FIELD OF VIEW (symmetric shadowcasting)
// 1. Shadowcast all 4 quadrants out to `viewRadius` (walls occlude)
// 2. Keep a tile only if it is inside the facing cone OR inside the
//    small peripheral "awareness" circle behind the player
// Occlusion is computed before the cone filter, so cone edges never
// leak light around corners.
// ============================================================

export const VIS_HIDDEN = 0;
export const VIS_PERIPHERAL = 1; // sensed (behind you / edge of cone): dimmed
export const VIS_VISIBLE = 2;

export interface FovParams {
  /** Viewer position in world px (use the avatar's eye/feet point). */
  originX: number;
  originY: number;
  /** Facing angle in radians (0 = +x / east, PI/2 = +y / south). */
  facing: number;
  /** Full cone width in radians (Zomboid-like default ≈ 110°). */
  coneAngle: number;
  /** Max sight distance in tiles inside the cone. */
  viewRadius: number;
  /** Always-aware radius in tiles regardless of facing (hearing/glance). */
  peripheralRadius: number;
}

export const DEFAULT_FOV: Omit<FovParams, 'originX' | 'originY' | 'facing'> = {
  coneAngle: (110 * Math.PI) / 180,
  viewRadius: 14,
  peripheralRadius: 2.5,
};

export interface FovResult {
  /** One byte per tile: VIS_HIDDEN | VIS_PERIPHERAL | VIS_VISIBLE. */
  vis: Uint8Array;
  originCol: number;
  originRow: number;
}

interface Row {
  depth: number;
  start: number;
  end: number;
}

/** Normalises an angle to (-PI, PI]. */
function wrapAngle(a: number): number {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

/**
 * Computes visibility into `out.vis` (reused between frames to avoid GC).
 * Cost is O(viewRadius²) per call, independent of map size.
 */
export function computeFov(grid: TileGrid, p: FovParams, out?: FovResult): FovResult {
  const size = grid.cols * grid.rows;
  const vis = out && out.vis.length === size ? out.vis : new Uint8Array(size);
  vis.fill(VIS_HIDDEN);

  const { col: oc, row: or } = worldToTile(grid, p.originX, p.originY);
  const result: FovResult = out ?? { vis, originCol: oc, originRow: or };
  result.vis = vis;
  result.originCol = oc;
  result.originRow = or;
  if (!inBounds(grid, oc, or)) return result;

  vis[tileIndex(grid, oc, or)] = VIS_VISIBLE;

  const halfCone = p.coneAngle / 2;
  const viewR2 = p.viewRadius * p.viewRadius;
  const periR2 = p.peripheralRadius * p.peripheralRadius;
  const maxDepth = Math.ceil(Math.max(p.viewRadius, p.peripheralRadius));

  const reveal = (c: number, r: number) => {
    if (!inBounds(grid, c, r)) return;
    const dx = c - oc;
    const dy = r - or;
    const d2 = dx * dx + dy * dy;
    let level = VIS_HIDDEN;
    if (d2 <= viewR2 && Math.abs(wrapAngle(Math.atan2(dy, dx) - p.facing)) <= halfCone) {
      level = VIS_VISIBLE;
    } else if (d2 <= periR2) {
      level = VIS_PERIPHERAL;
    }
    const i = tileIndex(grid, c, r);
    if (level > vis[i]) vis[i] = level;
  };

  // Quadrant transforms: (depth, col) -> world tile. 0=N, 1=E, 2=S, 3=W.
  for (let q = 0; q < 4; q++) {
    const tx = (depth: number, col: number) =>
      q === 0 ? oc + col : q === 1 ? oc + depth : q === 2 ? oc + col : oc - depth;
    const ty = (depth: number, col: number) =>
      q === 0 ? or - depth : q === 1 ? or + col : q === 2 ? or + depth : or + col;
    const wall = (depth: number, col: number) => isOpaque(grid, tx(depth, col), ty(depth, col));

    const scan = (row: Row) => {
      if (row.depth > maxDepth) return;
      const minCol = Math.floor(row.depth * row.start + 0.5);
      const maxCol = Math.ceil(row.depth * row.end - 0.5);
      let prevWall: boolean | null = null;
      for (let col = minCol; col <= maxCol; col++) {
        const isWall = wall(row.depth, col);
        const symmetric = col >= row.depth * row.start && col <= row.depth * row.end;
        if (isWall || symmetric) reveal(tx(row.depth, col), ty(row.depth, col));
        if (prevWall === true && !isWall) {
          row.start = (2 * col - 1) / (2 * row.depth);
        }
        if (prevWall === false && isWall) {
          scan({ depth: row.depth + 1, start: row.start, end: (2 * col - 1) / (2 * row.depth) });
        }
        prevWall = isWall;
      }
      if (prevWall === false) scan({ depth: row.depth + 1, start: row.start, end: row.end });
    };

    scan({ depth: 1, start: -1, end: 1 });
  }

  return result;
}

/** Visibility of a world-px point (e.g. a zombie's feet) for render culling. */
export function visibilityAt(grid: TileGrid, fov: FovResult, x: number, y: number): number {
  const { col, row } = worldToTile(grid, x, y);
  if (!inBounds(grid, col, row)) return VIS_HIDDEN;
  return fov.vis[tileIndex(grid, col, row)];
}

/** Converts a movement vector to a facing angle, keeping the last one when idle. */
export function facingFromVelocity(vx: number, vy: number, previous: number): number {
  return vx === 0 && vy === 0 ? previous : Math.atan2(vy, vx);
}
