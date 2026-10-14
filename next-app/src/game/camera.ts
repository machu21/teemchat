import { MAP_WIDTH, MAP_HEIGHT } from './collision';

export class Camera {
  x: number = 0;
  y: number = 0;
  zoom: number = 1.25;

  follow(targetX: number, targetY: number, viewportW: number, viewportH: number) {
    const halfW = viewportW / (2 * this.zoom);
    const halfH = viewportH / (2 * this.zoom);

    // Center on player target
    let cx = targetX - halfW;
    let cy = targetY - halfH;

    // Clamp to map boundaries
    cx = Math.max(0, Math.min(MAP_WIDTH - halfW * 2, cx));
    cy = Math.max(0, Math.min(MAP_HEIGHT - halfH * 2, cy));

    this.x = cx;
    this.y = cy;
  }
}
