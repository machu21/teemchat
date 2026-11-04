import { Rect } from '../../collision';
import {
  Ctx,
  PAL,
  px,
  plankFloor,
  checkerFloor,
  rug,
  wallShell,
  partitionH,
  windowPane,
  wallArt,
  plant,
  sofa,
  table,
  chair,
  bookshelf,
  stairs,
  banner,
  globe,
  cabinet,
  floorLamp,
} from './kit';

// ============================================================
// TOWN HALL: 1F council chamber + reception, 2F mayor's office + archive
// Internal px relative to the building's top-left. Footprint: 120 x 78.
// ============================================================

export const TOWNHALL_W = 120;
export const TOWNHALL_H = 78;

const SHELL = { side: 8, south: 8, north: 16 };

export const TOWNHALL_STAIRS: Rect = { x: 99, y: 42, w: 12, h: 22 };
export const TOWNHALL_ARRIVAL_FEET = { x: 88, y: 56 };

export const TOWNHALL_GROUND_COLLIDERS: Rect[] = [
  { x: 10, y: 16, w: 22, h: 6 }, // west bookshelf
  { x: 88, y: 16, w: 22, h: 6 }, // east bookshelf
  { x: 34, y: 26, w: 48, h: 16 }, // council table
  { x: 10, y: 46, w: 18, h: 8 }, // reception desk
  { x: 10, y: 58, w: 8, h: 10 }, // plant
  { x: 30, y: 46, w: 5, h: 11 }, // floor lamp
];

export const TOWNHALL_UPPER_COLLIDERS: Rect[] = [
  { x: 10, y: 16, w: 30, h: 6 }, // archive shelves
  { x: 44, y: 16, w: 24, h: 6 }, // archive shelves
  { x: 40, y: 28, w: 32, h: 10 }, // mayor's desk
  { x: 12, y: 50, w: 24, h: 8 }, // sofa
  { x: 76, y: 16, w: 10, h: 10 }, // plant
  { x: 100, y: 16, w: 10, h: 10 }, // filing cabinet
  { x: 8, y: 40, w: 32, h: 3 }, // archive divider
  { x: 18, y: 60, w: 12, h: 4 }, // coffee table
  { x: 40, y: 58, w: 8, h: 8 }, // plant
];

export function drawTownHallGround(ctx: Ctx, ox: number, oy: number) {
  const W = TOWNHALL_W;
  const H = TOWNHALL_H;

  checkerFloor(ctx, ox, oy, W, H, '#F1F3F5', '#4B5563', 8);
  wallShell(ctx, ox, oy, W, H, {
    ...SHELL,
    face: PAL.faceWhite,
    faceTrim: PAL.faceWhiteTrim,
    door: { x: 48, w: 24 },
  });
  px(ctx, ox + 8, oy + 5, W - 16, 1, '#93C5FD'); // blue dado stripe
  windowPane(ctx, ox + 36, oy + 6, 10, 7);
  windowPane(ctx, ox + 74, oy + 6, 10, 7);
  banner(ctx, ox + 50, oy + 3);

  // Red carpet runner from the doors to the council table
  rug(ctx, ox + 52, oy + 44, 16, 30, '#B91C1C', '#FBBF24');

  // Shelves against the north wall
  bookshelf(ctx, ox + 10, oy + 8, 22, 14);
  bookshelf(ctx, ox + 88, oy + 8, 22, 14);

  // Council table + six chairs
  table(ctx, ox + 34, oy + 26, 48, 16, '#78350F', '#B45309');
  px(ctx, ox + 38, oy + 30, 40, 8, '#14532D'); // green baize
  px(ctx, ox + 38, oy + 30, 40, 1, '#166534');
  px(ctx, ox + 44, oy + 32, 5, 3, '#F8FAFC'); // papers
  px(ctx, ox + 64, oy + 33, 4, 3, '#F8FAFC');
  for (const cx of [38, 54, 70]) {
    chair(ctx, ox + cx + 2, oy + 20, '#991B1B');
    chair(ctx, ox + cx + 2, oy + 43, '#991B1B');
  }

  // Reception desk with ledger
  table(ctx, ox + 10, oy + 46, 18, 8, '#A16207', '#CA8A04');
  px(ctx, ox + 13, oy + 48, 6, 3, '#F8FAFC');
  px(ctx, ox + 21, oy + 47, 2, 3, '#1E293B'); // quill
  plant(ctx, ox + 10, oy + 58);
  floorLamp(ctx, ox + 30, oy + 46);

  // Stairs up to 2F
  stairs(ctx, ox + TOWNHALL_STAIRS.x, oy + TOWNHALL_STAIRS.y, TOWNHALL_STAIRS.w, TOWNHALL_STAIRS.h, 'up');
}

export function drawTownHallUpper(ctx: Ctx, ox: number, oy: number) {
  const W = TOWNHALL_W;
  const H = TOWNHALL_H;

  plankFloor(ctx, ox, oy, W, H);
  wallShell(ctx, ox, oy, W, H, {
    ...SHELL,
    face: PAL.faceBlue,
    faceTrim: PAL.faceBlueTrim,
    glass: { x: 48, w: 40 },
  });
  windowPane(ctx, ox + 88, oy + 6, 10, 7);
  wallArt(ctx, ox + 74, oy + 6, 10, 6);

  // Archive: shelves along the north wall + divider with a gap into the office
  bookshelf(ctx, ox + 10, oy + 8, 30, 14);
  bookshelf(ctx, ox + 44, oy + 8, 24, 14);
  partitionH(ctx, ox + 8, oy + 40, 32, PAL.faceBlue);

  // Mayor's office
  rug(ctx, ox + 38, oy + 26, 36, 20, '#1E3A8A', '#FBBF24');
  table(ctx, ox + 40, oy + 28, 32, 10, '#78350F', '#B45309');
  px(ctx, ox + 44, oy + 30, 6, 4, '#F8FAFC');
  px(ctx, ox + 60, oy + 30, 6, 3, '#334155'); // laptop
  px(ctx, ox + 61, oy + 31, 4, 1, '#38BDF8');
  chair(ctx, ox + 53, oy + 40, '#1E40AF');
  globe(ctx, ox + 78, oy + 32);
  plant(ctx, ox + 76, oy + 16);
  cabinet(ctx, ox + 100, oy + 10, 10, 16);

  // Lounge corner looking out over the balcony glass
  sofa(ctx, ox + 12, oy + 50, 24, 8, '#8EC3E6', '#5F95BD');
  table(ctx, ox + 18, oy + 60, 12, 4, PAL.woodLight, '#F3D29B');
  plant(ctx, ox + 40, oy + 56);

  // Stairs down to 1F
  stairs(ctx, ox + TOWNHALL_STAIRS.x, oy + TOWNHALL_STAIRS.y, TOWNHALL_STAIRS.w, TOWNHALL_STAIRS.h, 'down');
}
