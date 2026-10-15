import { MAP_WIDTH, MAP_HEIGHT } from '../collision';
import { getMapConfig } from './mapRegistry';

// ============================================================
// DYNAMIC PRE-RENDERED WORLD MAP GENERATOR
// Renders pixel art maps for:
// - village: Verdant Village & GBA Meadow
// - school: Horizon Academy & School Campus
// - office: Modern Tech HQ & Coworking
// - nightclub: Neon Velvet Night Club & Lounge
// - arcade: Retro Cyber Arcade & Esports Arena
// - cafe: Roast & Read Book Cafe & Garden Patio
// ============================================================

export function createPreRenderedWorldMap(theme?: string | null): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = MAP_WIDTH;
  canvas.height = MAP_HEIGHT;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  const iw = 840;
  const ih = 540;

  ctx.save();
  ctx.scale(2.0, 2.0);

  const config = getMapConfig(theme);
  config.render(ctx, iw, ih);

  ctx.restore();
  return canvas;
}
