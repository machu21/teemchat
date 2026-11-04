import { Rect } from '../../collision';
import {
  Ctx,
  PAL,
  px,
  plankFloor,
  tileFloor,
  rug,
  wallShell,
  partitionV,
  partitionH,
  windowPane,
  wallArt,
  plant,
  sofa,
  armchair,
  table,
  chair,
  counter,
  sink,
  stove,
  fridge,
  fireplace,
  floorLamp,
  bookshelf,
  bed,
  nightstand,
  wardrobe,
  toilet,
  bathtub,
  stairs,
} from './kit';

// ============================================================
// COZY COTTAGE: 1F living room + kitchen, 2F bedroom + bath + balcony
// All coordinates are internal px relative to the building's top-left
// (1 internal px = 2 world px). Footprint: 96 x 74.
// ============================================================

export const COTTAGE_W = 96;
export const COTTAGE_H = 74;

const SHELL = { side: 8, south: 8, north: 16 };

/** Stairs trigger area, same spot on both floors so they line up. */
export const COTTAGE_STAIRS: Rect = { x: 74, y: 44, w: 12, h: 20 };
/** Where the player's feet land after using the stairs (outside the trigger). */
export const COTTAGE_ARRIVAL_FEET = { x: 66, y: 52 };

export const COTTAGE_GROUND_COLLIDERS: Rect[] = [
  { x: 12, y: 16, w: 18, h: 10 }, // fireplace
  { x: 57, y: 16, w: 3, h: 14 }, // kitchen divider
  { x: 60, y: 16, w: 28, h: 8 }, // counter + fridge
  { x: 18, y: 46, w: 22, h: 8 }, // sofa
  { x: 22, y: 31, w: 14, h: 6 }, // coffee table
  { x: 46, y: 18, w: 8, h: 10 }, // plant
  { x: 62, y: 29, w: 9, h: 6 }, // kitchen table
  { x: 44, y: 32, w: 9, h: 9 }, // armchair
];

export const COTTAGE_UPPER_COLLIDERS: Rect[] = [
  { x: 12, y: 16, w: 20, h: 24 }, // bed
  { x: 34, y: 16, w: 6, h: 6 }, // nightstand
  { x: 44, y: 16, w: 12, h: 8 }, // wardrobe
  { x: 56, y: 16, w: 3, h: 25 }, // bath divider (vertical)
  { x: 59, y: 38, w: 3, h: 3 }, // bath divider stub
  { x: 72, y: 38, w: 16, h: 3 }, // bath divider (horizontal)
  { x: 62, y: 16, w: 6, h: 8 }, // toilet
  { x: 74, y: 16, w: 14, h: 14 }, // bathtub
  { x: 20, y: 56, w: 8, h: 5 }, // balcony table
  { x: 60, y: 58, w: 10, h: 7 }, // landing bookshelf
  { x: 46, y: 42, w: 8, h: 8 }, // bedroom plant
];

export function drawCottageGround(ctx: Ctx, ox: number, oy: number) {
  const W = COTTAGE_W;
  const H = COTTAGE_H;

  // Floors: plank living room, tiled kitchen nook
  plankFloor(ctx, ox, oy, W, H);
  tileFloor(ctx, ox + 60, oy + 16, 28, 22, PAL.tileWhite, PAL.tileGrout, 6);

  wallShell(ctx, ox, oy, W, H, {
    ...SHELL,
    face: PAL.faceCream,
    faceTrim: PAL.faceCreamTrim,
    door: { x: 42, w: 20 },
  });
  // Kitchen wall section painted white
  px(ctx, ox + 57, oy + 5, 31, 9, PAL.faceWhite);
  px(ctx, ox + 57, oy + 14, 31, 2, PAL.baseboard);
  windowPane(ctx, ox + 36, oy + 6, 12, 7);
  wallArt(ctx, ox + 66, oy + 6, 10, 6, '#FCA5A5');

  // Living room
  fireplace(ctx, ox + 12, oy + 8, 18, 18);
  rug(ctx, ox + 14, oy + 27, 30, 16, '#8FB8D8', '#F2D27A');
  table(ctx, ox + 22, oy + 31, 14, 6);
  px(ctx, ox + 26, oy + 32, 3, 2, '#FFFFFF'); // mug
  px(ctx, ox + 31, oy + 33, 3, 2, '#EF4444'); // book
  sofa(ctx, ox + 18, oy + 46, 22, 8, '#8EC3E6', '#5F95BD');
  armchair(ctx, ox + 44, oy + 32, '#F4A261', '#C7773A');
  floorLamp(ctx, ox + 10, oy + 44);
  plant(ctx, ox + 46, oy + 17);

  // Kitchen
  counter(ctx, ox + 60, oy + 16, 19, 7);
  sink(ctx, ox + 61, oy + 17);
  stove(ctx, ox + 70, oy + 17);
  fridge(ctx, ox + 79, oy + 9, 9, 15);
  table(ctx, ox + 62, oy + 29, 9, 6, PAL.woodLight, '#F3D29B');
  chair(ctx, ox + 64, oy + 36, '#F87171');
  px(ctx, ox + 65, oy + 30, 3, 2, '#86EFAC'); // fruit bowl

  // Stairs up to 2F
  stairs(ctx, ox + COTTAGE_STAIRS.x, oy + COTTAGE_STAIRS.y, COTTAGE_STAIRS.w, COTTAGE_STAIRS.h, 'up');
}

export function drawCottageUpper(ctx: Ctx, ox: number, oy: number) {
  const W = COTTAGE_W;
  const H = COTTAGE_H;

  // Floors: bedroom planks, blue-tiled bath, terracotta balcony
  plankFloor(ctx, ox, oy, W, H);
  tileFloor(ctx, ox + 59, oy + 16, 29, 22, PAL.tileBlue, PAL.tileBlueGrout, 5);
  tileFloor(ctx, ox + 8, oy + 50, 30, 16, PAL.terracotta, PAL.terracottaGrout, 6);

  wallShell(ctx, ox, oy, W, H, {
    ...SHELL,
    face: PAL.faceBlue,
    faceTrim: PAL.faceBlueTrim,
    glass: { x: 8, w: 30 },
  });
  // Bathroom wall section painted white
  px(ctx, ox + 56, oy + 5, 32, 9, PAL.faceWhite);
  px(ctx, ox + 56, oy + 14, 32, 2, PAL.baseboard);
  wallArt(ctx, ox + 14, oy + 6, 12, 6);

  // Bedroom
  bed(ctx, ox + 12, oy + 14, 20, 26, '#86C5E8', '#5E9EC6');
  nightstand(ctx, ox + 34, oy + 16);
  wardrobe(ctx, ox + 44, oy + 9, 12, 15);
  rug(ctx, ox + 14, oy + 42, 26, 7, '#F9D8A6', '#E39B5B');
  plant(ctx, ox + 46, oy + 40);

  // Balcony: sliding door line + bistro set
  px(ctx, ox + 8, oy + 49, 30, 1, PAL.outlineSoft);
  table(ctx, ox + 20, oy + 56, 8, 5, '#F4F4F5', '#FFFFFF');
  chair(ctx, ox + 13, oy + 56, '#FBBF24');
  chair(ctx, ox + 30, oy + 56, '#FBBF24');
  plant(ctx, ox + 9, oy + 51);

  // Bathroom
  partitionV(ctx, ox + 56, oy + 16, 25);
  partitionH(ctx, ox + 59, oy + 38, 3);
  partitionH(ctx, ox + 72, oy + 38, 16);
  toilet(ctx, ox + 62, oy + 16);
  bathtub(ctx, ox + 74, oy + 16, 14, 14);
  px(ctx, ox + 66, oy + 28, 6, 4, '#FFFFFF'); // bath mat
  px(ctx, ox + 66, oy + 31, 6, 1, PAL.tileBlueGrout);

  // Stairs down to 1F
  stairs(ctx, ox + COTTAGE_STAIRS.x, oy + COTTAGE_STAIRS.y, COTTAGE_STAIRS.w, COTTAGE_STAIRS.h, 'down');
  bookshelf(ctx, ox + 60, oy + 58, 10, 7);
}
