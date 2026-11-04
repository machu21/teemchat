import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, ChunkedMapRenderer, MAX_NEW_CHUNKS_PER_FRAME, chunksInView } from './chunkedMap';
import { Rect, WallIndex, checkAABB } from '../collision';
import { Camera, DEFAULT_ZOOM, MAX_ZOOM, MIN_ZOOM, SURVIVAL_ZOOM_LIMITS } from '../camera';

// Minimal canvas stand-ins (no DOM in Vitest's node environment)
function fakeCanvasFactory(log: string[]) {
  return (w: number, h: number) =>
    ({
      width: w,
      height: h,
      getContext: () => ({
        imageSmoothingEnabled: true,
        save() {},
        restore() {},
        translate(x: number, y: number) {
          log.push(`translate ${x},${y}`);
        },
      }),
    }) as unknown as HTMLCanvasElement;
}

function fakeTarget(drawn: string[]) {
  return {
    drawImage: (_c: unknown, x: number, y: number) => drawn.push(`${x},${y}`),
  } as unknown as CanvasRenderingContext2D;
}

describe('chunksInView', () => {
  it('returns only chunks overlapping the view, clamped to the map', () => {
    const chunks = chunksInView({ x: 600, y: 100, w: 500, h: 300 }, 6720, 4320);
    expect(chunks).toEqual([
      { cx: 1, cy: 0 },
      { cx: 2, cy: 0 },
    ]);
    expect(chunksInView({ x: -900, y: -900, w: 100, h: 100 }, 6720, 4320)).toEqual([]);
  });
});

describe('ChunkedMapRenderer', () => {
  it('paints visible chunks once, caches them, and respects the per-frame budget', () => {
    const painted: Rect[] = [];
    const log: string[] = [];
    const r = new ChunkedMapRenderer((_ctx, rect) => painted.push(rect), 6720, 4320, fakeCanvasFactory(log), 36);
    const view = { x: 0, y: 0, w: CHUNK_SIZE * 2 - 1, h: CHUNK_SIZE * 2 - 1 }; // 2×2 chunks

    const drawn: string[] = [];
    r.draw(fakeTarget(drawn), view);
    expect(painted.length).toBe(MAX_NEW_CHUNKS_PER_FRAME);
    expect(drawn.length).toBe(MAX_NEW_CHUNKS_PER_FRAME);

    // Next frames finish the view, then reuse the cache
    for (let i = 0; i < 6; i++) r.draw(fakeTarget([]), view);
    const before = painted.length;
    const again: string[] = [];
    r.draw(fakeTarget(again), view);
    expect(again.length).toBe(4);
    expect(painted.length).toBe(before);
    // Chunk content is painted in world coordinates
    expect(log).toContain(`translate -${CHUNK_SIZE},-${CHUNK_SIZE}`);
  });

  it('evicts least-recently-used chunks beyond the cap', () => {
    const r = new ChunkedMapRenderer(() => {}, 6720, 4320, fakeCanvasFactory([]), 4);
    for (let cx = 0; cx < 10; cx++) {
      for (let f = 0; f < 3; f++) r.draw(fakeTarget([]), { x: cx * CHUNK_SIZE, y: 0, w: 1, h: 1 });
    }
    expect(r.cachedCount()).toBeLessThanOrEqual(4);
  });

  it('clips edge chunks to the map size', () => {
    const painted: Rect[] = [];
    const r = new ChunkedMapRenderer((_c, rect) => painted.push(rect), 1000, 600, fakeCanvasFactory([]));
    r.draw(fakeTarget([]), { x: 900, y: 520, w: 50, h: 50 });
    expect(painted[0]).toEqual({ x: 512, y: 512, w: 488, h: 88 });
  });
});

describe('WallIndex', () => {
  it('matches a brute-force AABB scan', () => {
    const walls: Rect[] = [];
    for (let i = 0; i < 400; i++) walls.push({ x: (i * 97) % 6000, y: (i * 53) % 4000, w: 16 + (i % 5) * 20, h: 16 });
    const index = new WallIndex(walls);
    for (let i = 0; i < 300; i++) {
      const box = { x: (i * 131) % 6000, y: (i * 71) % 4000, w: 16, h: 16 };
      expect(index.hits(box)).toBe(walls.some((w) => checkAABB(box, w)));
    }
  });
});

describe('Camera zoom limits', () => {
  it('clamps to survival 100–200 % and restores social limits', () => {
    const cam = new Camera();
    cam.setZoomLimits(SURVIVAL_ZOOM_LIMITS.min, SURVIVAL_ZOOM_LIMITS.max);
    expect(cam.setZoom(0.6)).toBe(DEFAULT_ZOOM);
    expect(cam.setZoom(9)).toBe(DEFAULT_ZOOM * 2);
    expect(Math.round((cam.zoom / DEFAULT_ZOOM) * 100)).toBe(200);

    cam.setZoomLimits();
    expect(cam.setZoom(0.1)).toBe(MIN_ZOOM);
    expect(cam.setZoom(9)).toBe(MAX_ZOOM);
  });
});
