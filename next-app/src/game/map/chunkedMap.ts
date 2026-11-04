import { Rect } from '../collision';

// ============================================================
// CHUNKED MAP RENDERER (large maps)
// One pre-rendered canvas per map is fine at 1680×1080, but a city at
// 6720×4320 would be ~116 MB of canvas memory and exceeds iOS limits.
// Instead the ground layer is drawn in 512 px chunks on demand and kept
// in a small LRU cache, so memory stays bounded wherever the player goes.
// ============================================================

export const CHUNK_SIZE = 512;
/** ~36 chunks × 1 MB ≈ 36 MB worst case; a 200 % zoom viewport needs ≤ 12. */
export const MAX_CACHED_CHUNKS = 36;
/** New chunks rendered per frame; the rest wait so a fast pan never hitches. */
export const MAX_NEW_CHUNKS_PER_FRAME = 3;

export type ChunkPainter = (ctx: CanvasRenderingContext2D, rect: Rect) => void;
export type CanvasFactory = (w: number, h: number) => HTMLCanvasElement;

const defaultCanvas: CanvasFactory = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

/** Chunk coordinates (cx, cy) overlapping a world rect, clamped to the map. */
export function chunksInView(view: Rect, mapW: number, mapH: number, chunk: number = CHUNK_SIZE): { cx: number; cy: number }[] {
  const out: { cx: number; cy: number }[] = [];
  const maxCx = Math.ceil(mapW / chunk) - 1;
  const maxCy = Math.ceil(mapH / chunk) - 1;
  const c0 = Math.max(0, Math.floor(view.x / chunk));
  const c1 = Math.min(maxCx, Math.floor((view.x + view.w) / chunk));
  const r0 = Math.max(0, Math.floor(view.y / chunk));
  const r1 = Math.min(maxCy, Math.floor((view.y + view.h) / chunk));
  for (let cy = r0; cy <= r1; cy++) {
    for (let cx = c0; cx <= c1; cx++) out.push({ cx, cy });
  }
  return out;
}

export class ChunkedMapRenderer {
  /** Map insertion order doubles as LRU order (oldest first). */
  private cache: Map<string, HTMLCanvasElement> = new Map();
  /** Chunks rendered so far this frame (reset by draw). */
  private renderedThisFrame = 0;

  constructor(
    private paint: ChunkPainter,
    private mapW: number,
    private mapH: number,
    private createCanvas: CanvasFactory = defaultCanvas,
    private maxCached: number = MAX_CACHED_CHUNKS
  ) {}

  /** Draws every chunk overlapping `view` (world px) with the camera transform already applied. */
  draw(ctx: CanvasRenderingContext2D, view: Rect) {
    this.renderedThisFrame = 0;
    for (const { cx, cy } of chunksInView(view, this.mapW, this.mapH)) {
      const chunk = this.get(cx, cy);
      if (chunk) ctx.drawImage(chunk, cx * CHUNK_SIZE, cy * CHUNK_SIZE);
    }
    // Spare budget: warm the ring around the view so walking never shows a gap
    const margin = CHUNK_SIZE;
    const ring = { x: view.x - margin, y: view.y - margin, w: view.w + margin * 2, h: view.h + margin * 2 };
    for (const { cx, cy } of chunksInView(ring, this.mapW, this.mapH)) {
      if (this.renderedThisFrame >= MAX_NEW_CHUNKS_PER_FRAME || this.cache.size >= this.maxCached) break;
      this.get(cx, cy);
    }
  }

  /** Cached chunk, rendering it if the per-frame budget allows (else null this frame). */
  private get(cx: number, cy: number): HTMLCanvasElement | null {
    const key = `${cx},${cy}`;
    const hit = this.cache.get(key);
    if (hit) {
      // LRU touch
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit;
    }
    if (this.renderedThisFrame >= MAX_NEW_CHUNKS_PER_FRAME) return null;
    this.renderedThisFrame++;

    const x = cx * CHUNK_SIZE;
    const y = cy * CHUNK_SIZE;
    const w = Math.min(CHUNK_SIZE, this.mapW - x);
    const h = Math.min(CHUNK_SIZE, this.mapH - y);
    const canvas = this.createCanvas(w, h);
    const cctx = canvas.getContext('2d');
    if (cctx) {
      cctx.imageSmoothingEnabled = false;
      cctx.save();
      cctx.translate(-x, -y);
      this.paint(cctx, { x, y, w, h });
      cctx.restore();
    }
    this.cache.set(key, canvas);
    while (this.cache.size > this.maxCached) {
      const oldestKey = this.cache.keys().next().value as string;
      const oldest = this.cache.get(oldestKey);
      if (oldest) {
        oldest.width = 0;
        oldest.height = 0;
      }
      this.cache.delete(oldestKey);
    }
    return canvas;
  }

  cachedCount(): number {
    return this.cache.size;
  }

  dispose() {
    for (const c of this.cache.values()) {
      c.width = 0;
      c.height = 0;
    }
    this.cache.clear();
  }
}
