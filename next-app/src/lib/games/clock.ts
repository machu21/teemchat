// Chess clocks: time controls, formatting and the remaining-time maths shared
// by the online games (server keeps the clocks) and solo games (local clocks).

export interface TimeControl {
  id: string;
  label: string;
  /** Starting time per player; 0 means untimed. */
  baseMs: number;
  /** Added to the mover's clock after each move. */
  incMs: number;
}

export const UNTIMED: TimeControl = { id: 'none', label: 'No clock', baseMs: 0, incMs: 0 };

export const TIME_CONTROLS: TimeControl[] = [
  UNTIMED,
  { id: '3+2', label: '3 min + 2s', baseMs: 3 * 60_000, incMs: 2_000 },
  { id: '5+0', label: '5 min', baseMs: 5 * 60_000, incMs: 0 },
  { id: '10+0', label: '10 min', baseMs: 10 * 60_000, incMs: 0 },
  { id: '15+10', label: '15 min + 10s', baseMs: 15 * 60_000, incMs: 10_000 },
];

export const isTimed = (tc: Pick<TimeControl, 'baseMs'> | null | undefined) => Boolean(tc && tc.baseMs > 0);

/** "4:05", or "0:09.3" in the last 20 seconds; never negative. */
export function formatClock(ms: number): string {
  const t = Math.max(0, ms);
  if (t < 20_000) {
    const s = Math.floor(t / 1000);
    const tenth = Math.floor((t % 1000) / 100);
    return `0:${String(s).padStart(2, '0')}.${tenth}`;
  }
  const total = Math.ceil(t / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Time left for one side. `running` is true when it is that side's turn and
 * the clock has started; `startedAt` and `now` are in the same time base.
 */
export function remainingMs(clockMs: number, running: boolean, startedAt: number | null, now: number): number {
  if (!running || startedAt === null) return clockMs;
  return clockMs - Math.max(0, now - startedAt);
}

export const LOW_TIME_MS = 20_000;
