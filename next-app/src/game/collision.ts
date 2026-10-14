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
