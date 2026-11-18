import type { BuildingDefinition } from './buildings';
import type { GroundType, MapThemeConfig } from './mapRegistry';

// ============================================================
// MAP IMAGE (survival map panel)
// The whole map drawn small, one pixel per 16 px tile: ground colours
// from MapThemeConfig.groundAt (grass, parks, dirt, paving) and building
// footprints on top. Built once per map and cached by WorldGame.
// ============================================================

export const MAP_TILE = 16;

/** Ground colour per type (r, g, b). */
export const MAP_COLORS: Record<GroundType | 'none', [number, number, number]> = {
  grass: [86, 125, 70],
  park: [60, 120, 64],
  dirt: [133, 104, 70],
  paved: [92, 96, 104],
  floor: [176, 160, 136],
  none: [70, 74, 80],
};

/** Pure: the colour bytes (RGBA) for a cols × rows map. */
export function mapPixels(cols: number, rows: number, groundAt: ((x: number, y: number) => GroundType | null) | undefined): Uint8ClampedArray {
  const px = new Uint8ClampedArray(cols * rows * 4);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const g = groundAt?.((c + 0.5) * MAP_TILE, (r + 0.5) * MAP_TILE) ?? 'none';
      const [R, G, B] = MAP_COLORS[g];
      const i = (r * cols + c) * 4;
      px[i] = R;
      px[i + 1] = G;
      px[i + 2] = B;
      px[i + 3] = 255;
    }
  }
  return px;
}

/** The map as a canvas (null outside the browser). */
export function renderMapImage(cfg: MapThemeConfig, buildings: BuildingDefinition[], size: { w: number; h: number }): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const cols = Math.ceil(size.w / MAP_TILE);
  const rows = Math.ceil(size.h / MAP_TILE);
  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(cols, rows);
  img.data.set(mapPixels(cols, rows, cfg.groundAt));
  ctx.putImageData(img, 0, 0);
  // Buildings: a roof-coloured block with a dark edge
  for (const b of buildings) {
    const f = b.footprint;
    const x = f.x / MAP_TILE;
    const y = f.y / MAP_TILE;
    const w = f.w / MAP_TILE;
    const h = f.h / MAP_TILE;
    ctx.fillStyle = '#8C6E58';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#2B2118';
    ctx.lineWidth = 0.6;
    ctx.strokeRect(x + 0.3, y + 0.3, w - 0.6, h - 0.6);
  }
  return canvas;
}
