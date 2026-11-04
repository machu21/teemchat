import { MAP_WIDTH, MAP_HEIGHT, Rect } from './collision';

export const MIN_ZOOM = 0.6;
export const MAX_ZOOM = 2.5;
export const DEFAULT_ZOOM = 1.25;
export const ZOOM_STEP = 0.2;

/** Zombie Survival: 100 %–200 % as the HUD shows it (zoom / DEFAULT_ZOOM), so no zooming out to scout. */
export const SURVIVAL_ZOOM_LIMITS = { min: DEFAULT_ZOOM, max: DEFAULT_ZOOM * 2 } as const;

export class Camera {
  x: number = 0;
  y: number = 0;
  zoom: number = DEFAULT_ZOOM;
  minZoom: number = MIN_ZOOM;
  maxZoom: number = MAX_ZOOM;

  setZoom(newZoom: number): number {
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, Math.round(newZoom * 100) / 100));
    return this.zoom;
  }

  /** Narrows (or restores) the zoom range and re-clamps the current zoom. */
  setZoomLimits(min: number = MIN_ZOOM, max: number = MAX_ZOOM): number {
    this.minZoom = min;
    this.maxZoom = max;
    return this.setZoom(this.zoom);
  }

  zoomIn(step: number = ZOOM_STEP): number {
    return this.setZoom(this.zoom + step);
  }

  zoomOut(step: number = ZOOM_STEP): number {
    return this.setZoom(this.zoom - step);
  }

  resetZoom(): number {
    return this.setZoom(DEFAULT_ZOOM);
  }

  follow(
    targetX: number,
    targetY: number,
    viewportW: number,
    viewportH: number,
    bounds: Rect = { x: 0, y: 0, w: MAP_WIDTH, h: MAP_HEIGHT }
  ) {
    const halfW = viewportW / (2 * this.zoom);
    const halfH = viewportH / (2 * this.zoom);

    // Center on player target
    let cx = targetX - halfW;
    let cy = targetY - halfH;

    // Clamp to bounds (or center them if the viewport exceeds their size when zoomed out)
    if (halfW * 2 >= bounds.w) {
      cx = bounds.x + (bounds.w - halfW * 2) / 2;
    } else {
      cx = Math.max(bounds.x, Math.min(bounds.x + bounds.w - halfW * 2, cx));
    }

    if (halfH * 2 >= bounds.h) {
      cy = bounds.y + (bounds.h - halfH * 2) / 2;
    } else {
      cy = Math.max(bounds.y, Math.min(bounds.y + bounds.h - halfH * 2, cy));
    }

    this.x = cx;
    this.y = cy;
  }
}

