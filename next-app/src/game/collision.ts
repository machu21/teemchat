export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function checkAABB(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

export const MAP_WIDTH = 1680;
export const MAP_HEIGHT = 1080;
export const WALL_THICK = 32;

// Static boundary walls matching tile_map.dart
export const BOUNDARY_WALLS: Rect[] = [
  { x: 0, y: 0, w: MAP_WIDTH, h: WALL_THICK },
  { x: 0, y: MAP_HEIGHT - WALL_THICK, w: MAP_WIDTH, h: WALL_THICK },
  { x: 0, y: 0, w: WALL_THICK, h: MAP_HEIGHT },
  { x: MAP_WIDTH - WALL_THICK, y: 0, w: WALL_THICK, h: MAP_HEIGHT },
  // Building 1 (Village HQ)
  { x: 16 * 5, y: 16 * 5, w: 16 * 12, h: 16 * 8 },
  // Building 2 (Library / Cafe)
  { x: 16 * 19, y: 16 * 4, w: 16 * 15, h: 16 * 9 },
];

/**
 * Uniform-grid bucket index over static walls so collision checks only
 * touch nearby rects (city maps have thousands; social maps a few dozen).
 */
export class WallIndex {
  private cells: Map<number, Rect[]> = new Map();

  constructor(rects: Rect[], private cellSize: number = 128) {
    for (const r of rects) {
      const c0 = Math.floor(r.x / cellSize);
      const c1 = Math.floor((r.x + r.w) / cellSize);
      const r0 = Math.floor(r.y / cellSize);
      const r1 = Math.floor((r.y + r.h) / cellSize);
      for (let cy = r0; cy <= r1; cy++) {
        for (let cx = c0; cx <= c1; cx++) {
          const key = WallIndex.key(cx, cy);
          const bucket = this.cells.get(key);
          if (bucket) bucket.push(r);
          else this.cells.set(key, [r]);
        }
      }
    }
  }

  private static key(cx: number, cy: number): number {
    // Supports cx/cy in [-32768, 32767]
    return ((cy + 32768) << 16) | (cx + 32768);
  }

  /** True if `box` overlaps any indexed wall. */
  hits(box: Rect): boolean {
    const s = this.cellSize;
    const c0 = Math.floor(box.x / s);
    const c1 = Math.floor((box.x + box.w) / s);
    const r0 = Math.floor(box.y / s);
    const r1 = Math.floor((box.y + box.h) / s);
    for (let cy = r0; cy <= r1; cy++) {
      for (let cx = c0; cx <= c1; cx++) {
        const bucket = this.cells.get(WallIndex.key(cx, cy));
        if (!bucket) continue;
        for (const w of bucket) if (checkAABB(box, w)) return true;
      }
    }
    return false;
  }
}
