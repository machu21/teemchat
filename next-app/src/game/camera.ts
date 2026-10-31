import { MAP_WIDTH, MAP_HEIGHT } from './collision';

export const MIN_ZOOM = 0.6;
export const MAX_ZOOM = 2.5;
export const DEFAULT_ZOOM = 1.25;
export const ZOOM_STEP = 0.2;

export class Camera {
  x: number = 0;
  y: number = 0;
  zoom: number = DEFAULT_ZOOM;

  setZoom(newZoom: number): number {
    this.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(newZoom * 100) / 100));
    return this.zoom;
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

  follow(targetX: number, targetY: number, viewportW: number, viewportH: number) {
    const halfW = viewportW / (2 * this.zoom);
    const halfH = viewportH / (2 * this.zoom);

    // Center on player target
    let cx = targetX - halfW;
    let cy = targetY - halfH;

    // Clamp to map boundaries (or center map if viewport exceeds map size when zoomed out)
    if (halfW * 2 >= MAP_WIDTH) {
      cx = (MAP_WIDTH - halfW * 2) / 2;
    } else {
      cx = Math.max(0, Math.min(MAP_WIDTH - halfW * 2, cx));
    }

    if (halfH * 2 >= MAP_HEIGHT) {
      cy = (MAP_HEIGHT - halfH * 2) / 2;
    } else {
      cy = Math.max(0, Math.min(MAP_HEIGHT - halfH * 2, cy));
    }

    this.x = cx;
    this.y = cy;
  }
}

