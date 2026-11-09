/**
 * Shared whiteboard data model (pure, DOM-free).
 * Points are normalised to 0–1 of a 1600×1000 logical board so every screen size
 * draws the same picture; stored in whiteboard_sessions.board_data.elements.
 */

export const BOARD_W = 1600;
export const BOARD_H = 1000;
export const MAX_STROKES = 2000;
export const MAX_POINTS_PER_STROKE = 2000;

export type WhiteboardTool = 'pen' | 'highlighter' | 'eraser';

export const BOARD_COLORS = ['#18181B', '#DC2626', '#2563EB', '#16A34A', '#F59E0B', '#9333EA'] as const;
export const BOARD_SIZES = [3, 7, 16] as const;

export interface Stroke {
  id: string;
  userId: string;
  color: string;
  size: number;
  tool: WhiteboardTool;
  points: [number, number][];
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function normalizePoint(x: number, y: number, width: number, height: number): [number, number] {
  return [round4(clamp01(x / width)), round4(clamp01(y / height))];
}

export function denormalizePoint(p: [number, number], width: number, height: number): [number, number] {
  return [p[0] * width, p[1] * height];
}

const COLOR = /^#[0-9a-fA-F]{6}$/;
const STROKE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Validates one stroke from the network or database; returns null when malformed. */
export function sanitizeStroke(raw: unknown): Stroke | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !STROKE_ID.test(r.id)) return null;
  if (typeof r.userId !== 'string' || !r.userId || r.userId.length > 64) return null;
  if (typeof r.color !== 'string' || !COLOR.test(r.color)) return null;
  const size = Number(r.size);
  if (!Number.isFinite(size) || size < 1 || size > 40) return null;
  const tool = r.tool === 'highlighter' || r.tool === 'eraser' ? r.tool : 'pen';
  if (!Array.isArray(r.points)) return null;
  const points: [number, number][] = [];
  for (const p of r.points.slice(0, MAX_POINTS_PER_STROKE)) {
    if (!Array.isArray(p) || p.length !== 2) continue;
    const x = Number(p[0]);
    const y = Number(p[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    points.push([round4(clamp01(x)), round4(clamp01(y))]);
  }
  if (points.length === 0) return null;
  return { id: r.id, userId: r.userId, color: r.color, size, tool, points };
}

export function parseBoardData(raw: unknown): Stroke[] {
  const elements = raw && typeof raw === 'object' ? (raw as { elements?: unknown }).elements : null;
  if (!Array.isArray(elements)) return [];
  const out: Stroke[] = [];
  for (const el of elements) {
    const s = sanitizeStroke(el);
    if (s) out.push(s);
  }
  return capStrokes(out);
}

/** Keeps the newest strokes when the board grows past the cap. */
export function capStrokes(strokes: Stroke[], max: number = MAX_STROKES): Stroke[] {
  return strokes.length > max ? strokes.slice(strokes.length - max) : strokes;
}

/**
 * Merge after a save conflict: everything in `base` (the server copy) plus local
 * strokes it doesn't have yet, minus strokes removed locally (undo / clear).
 */
export function mergeStrokes(base: Stroke[], local: Stroke[], removedIds: Set<string> = new Set()): Stroke[] {
  const seen = new Set<string>();
  const out: Stroke[] = [];
  for (const s of [...base, ...local]) {
    if (seen.has(s.id) || removedIds.has(s.id)) continue;
    seen.add(s.id);
    out.push(s);
  }
  return capStrokes(out);
}

export function newStrokeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Batches in-progress points so live drawing sends at most one message per
 * interval (Supabase Realtime budget is 10 msgs/sec per client).
 */
export class PointBatcher {
  private pending: [number, number][] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastSent = -Infinity;

  constructor(
    private readonly send: (points: [number, number][]) => void,
    private readonly intervalMs: number = 100,
    private readonly now: () => number = Date.now
  ) {}

  push(point: [number, number]): void {
    this.pending.push(point);
    const wait = this.intervalMs - (this.now() - this.lastSent);
    if (wait <= 0) {
      this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.flush();
      }, wait);
    }
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.pending.length === 0) return;
    const batch = this.pending;
    this.pending = [];
    this.lastSent = this.now();
    this.send(batch);
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending = [];
  }
}
