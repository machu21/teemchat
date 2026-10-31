import { describe, it, expect } from 'vitest';
import { Camera, DEFAULT_ZOOM, MIN_ZOOM, MAX_ZOOM, ZOOM_STEP } from './camera';
import { MAP_WIDTH, MAP_HEIGHT } from './collision';

describe('Camera Zoom & Follow Logic', () => {
  it('initializes with default zoom', () => {
    const cam = new Camera();
    expect(cam.zoom).toBe(DEFAULT_ZOOM);
  });

  it('zooms in and out within bounds', () => {
    const cam = new Camera();
    const afterZoomIn = cam.zoomIn();
    expect(afterZoomIn).toBeCloseTo(DEFAULT_ZOOM + ZOOM_STEP, 2);

    const afterZoomOut = cam.zoomOut();
    expect(afterZoomOut).toBeCloseTo(DEFAULT_ZOOM, 2);
  });

  it('clamps zoom to MIN_ZOOM and MAX_ZOOM', () => {
    const cam = new Camera();
    expect(cam.setZoom(10)).toBe(MAX_ZOOM);
    expect(cam.zoom).toBe(MAX_ZOOM);

    expect(cam.setZoom(0.1)).toBe(MIN_ZOOM);
    expect(cam.zoom).toBe(MIN_ZOOM);
  });

  it('resets zoom to DEFAULT_ZOOM', () => {
    const cam = new Camera();
    cam.setZoom(2.0);
    expect(cam.resetZoom()).toBe(DEFAULT_ZOOM);
    expect(cam.zoom).toBe(DEFAULT_ZOOM);
  });

  it('centers map smoothly when zoomed out beyond map dimensions', () => {
    const cam = new Camera();
    cam.setZoom(MIN_ZOOM);
    // Large viewport so viewport / zoom > MAP_WIDTH & MAP_HEIGHT
    cam.follow(500, 500, 2000, 1500);
    const viewW = 2000 / MIN_ZOOM;
    const viewH = 1500 / MIN_ZOOM;
    expect(cam.x).toBeCloseTo((MAP_WIDTH - viewW) / 2, 2);
    expect(cam.y).toBeCloseTo((MAP_HEIGHT - viewH) / 2, 2);
  });
});
