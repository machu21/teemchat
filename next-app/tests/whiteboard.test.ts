import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  MAX_STROKES,
  PointBatcher,
  Stroke,
  capStrokes,
  denormalizePoint,
  mergeStrokes,
  normalizePoint,
  parseBoardData,
  sanitizeStroke,
} from '../src/lib/whiteboard/model';

const stroke = (id: string, userId = 'u1'): Stroke => ({
  id,
  userId,
  color: '#18181B',
  size: 3,
  tool: 'pen',
  points: [[0.1, 0.2]],
});

afterEach(() => {
  vi.useRealTimers();
});

describe('whiteboard model', () => {
  it('normalises points to 0–1 and back, clamping off-board input', () => {
    expect(normalizePoint(400, 250, 800, 500)).toEqual([0.5, 0.5]);
    expect(normalizePoint(-20, 900, 800, 500)).toEqual([0, 1]);
    expect(denormalizePoint([0.5, 0.25], 1600, 1000)).toEqual([800, 250]);
  });

  it('rejects malformed strokes and cleans coordinates', () => {
    expect(sanitizeStroke({ ...stroke('a'), color: 'red' })).toBeNull();
    expect(sanitizeStroke({ ...stroke('a'), id: 'bad id!' })).toBeNull();
    expect(sanitizeStroke({ ...stroke('a'), points: [] })).toBeNull();
    expect(sanitizeStroke({ ...stroke('a'), size: 999 })).toBeNull();
    const cleaned = sanitizeStroke({ ...stroke('a'), tool: 'laser', points: [[2, -1], ['x', 1], [0.123456, 0.5]] });
    expect(cleaned?.tool).toBe('pen');
    expect(cleaned?.points).toEqual([
      [1, 0],
      [0.1235, 0.5],
    ]);
  });

  it('parses stored board data and ignores junk', () => {
    expect(parseBoardData(null)).toEqual([]);
    expect(parseBoardData({ elements: [stroke('a'), { nope: true }, stroke('b')] }).map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('caps the board at the newest strokes', () => {
    const many = Array.from({ length: MAX_STROKES + 5 }, (_, i) => stroke(`s${i}`));
    const capped = capStrokes(many);
    expect(capped).toHaveLength(MAX_STROKES);
    expect(capped[0].id).toBe('s5');
  });

  it('merges a save conflict without resurrecting removed strokes', () => {
    const server = [stroke('a'), stroke('b'), stroke('c', 'u2')];
    const local = [stroke('a'), stroke('d')];
    const merged = mergeStrokes(server, local, new Set(['b']));
    expect(merged.map((s) => s.id)).toEqual(['a', 'c', 'd']);
  });

  it('batches live points to at most one send per interval', () => {
    vi.useFakeTimers();
    let now = 0;
    const sent: [number, number][][] = [];
    const batcher = new PointBatcher((pts) => sent.push(pts), 100, () => now);

    batcher.push([0, 0]); // sends immediately (first)
    for (let i = 1; i <= 20; i++) {
      now += 10;
      batcher.push([i / 100, 0]);
    }
    // 200ms of drawing at 100Hz → at most 3 sends so far
    vi.advanceTimersByTime(0);
    expect(sent.length).toBeLessThanOrEqual(3);
    batcher.flush();
    const total = sent.reduce((n, b) => n + b.length, 0);
    expect(total).toBe(21);
    batcher.dispose();
  });
});
