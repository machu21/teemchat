/**
 * Shared focus timer (Pomodoro) for a private room. Ephemeral: lives only in the
 * clients of people in the room and travels over the world broadcast channel.
 * Times are absolute (epoch ms) so every client counts down locally.
 */

export type TimerPhase = 'focus' | 'break';

export interface FocusTimerState {
  roomId: string;
  phase: TimerPhase;
  running: boolean;
  /** When the current phase ends (running), epoch ms. */
  endsAt: number;
  /** Time left when paused, ms. */
  pausedRemaining: number;
  focusMin: number;
  breakMin: number;
  /** Completed focus blocks. */
  round: number;
}

export const TIMER_PRESETS: readonly { label: string; focusMin: number; breakMin: number }[] = [
  { label: '25 / 5', focusMin: 25, breakMin: 5 },
  { label: '50 / 10', focusMin: 50, breakMin: 10 },
  { label: '15 / 3', focusMin: 15, breakMin: 3 },
];

/** Largest clock difference we trust from another client's timestamps. */
export const MAX_SKEW_MS = 5000;

const MIN = 60_000;

export function phaseLength(state: Pick<FocusTimerState, 'phase' | 'focusMin' | 'breakMin'>): number {
  return (state.phase === 'focus' ? state.focusMin : state.breakMin) * MIN;
}

export function startTimer(roomId: string, focusMin: number, breakMin: number, now: number): FocusTimerState {
  return {
    roomId,
    phase: 'focus',
    running: true,
    endsAt: now + focusMin * MIN,
    pausedRemaining: 0,
    focusMin,
    breakMin,
    round: 0,
  };
}

export function remaining(state: FocusTimerState, now: number): number {
  return state.running ? Math.max(0, state.endsAt - now) : Math.max(0, state.pausedRemaining);
}

export function pauseTimer(state: FocusTimerState, now: number): FocusTimerState {
  if (!state.running) return state;
  return { ...state, running: false, pausedRemaining: remaining(state, now) };
}

export function resumeTimer(state: FocusTimerState, now: number): FocusTimerState {
  if (state.running) return state;
  return { ...state, running: true, endsAt: now + state.pausedRemaining, pausedRemaining: 0 };
}

/** Jump to the next phase now (focus → break counts a round). */
export function skipPhase(state: FocusTimerState, now: number): FocusTimerState {
  const phase: TimerPhase = state.phase === 'focus' ? 'break' : 'focus';
  const next = { ...state, phase, round: state.phase === 'focus' ? state.round + 1 : state.round };
  return { ...next, running: true, endsAt: now + phaseLength(next), pausedRemaining: 0 };
}

/**
 * Rolls over finished phases (handles a tab that slept through several).
 * Returns the same object when nothing changed.
 */
export function advance(state: FocusTimerState, now: number): FocusTimerState {
  if (!state.running || now < state.endsAt) return state;
  let cur = state;
  for (let i = 0; i < 20 && cur.running && now >= cur.endsAt; i++) {
    const phase: TimerPhase = cur.phase === 'focus' ? 'break' : 'focus';
    const next = { ...cur, phase, round: cur.phase === 'focus' ? cur.round + 1 : cur.round };
    cur = { ...next, endsAt: cur.endsAt + phaseLength(next) };
  }
  return cur;
}

export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Shifts a peer's absolute times onto our clock using the time they sent it.
 * The correction is capped so a wildly wrong peer clock can't break the timer.
 */
export function adjustForSkew(state: FocusTimerState, sentAt: number, receivedAt: number): FocusTimerState {
  const raw = receivedAt - sentAt;
  const skew = Math.max(-MAX_SKEW_MS, Math.min(MAX_SKEW_MS, raw));
  return state.running ? { ...state, endsAt: state.endsAt + skew } : state;
}

const ROOM_ID = /^[a-z0-9-]{1,48}$/;

/** Validates a broadcast timer (client-supplied). Null removes the timer; undefined = malformed. */
export function parseTimerPayload(raw: unknown): FocusTimerState | null | undefined {
  if (raw === null) return null;
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.roomId !== 'string' || !ROOM_ID.test(r.roomId)) return undefined;
  const focusMin = Number(r.focusMin);
  const breakMin = Number(r.breakMin);
  if (!Number.isInteger(focusMin) || focusMin < 1 || focusMin > 180) return undefined;
  if (!Number.isInteger(breakMin) || breakMin < 1 || breakMin > 60) return undefined;
  const phase = r.phase === 'break' ? 'break' : r.phase === 'focus' ? 'focus' : null;
  if (!phase || typeof r.running !== 'boolean') return undefined;
  const endsAt = Number(r.endsAt);
  const pausedRemaining = Number(r.pausedRemaining);
  const round = Number(r.round);
  if (!Number.isFinite(endsAt) || !Number.isFinite(pausedRemaining) || !Number.isInteger(round) || round < 0) {
    return undefined;
  }
  const maxLen = Math.max(focusMin, breakMin) * MIN;
  return {
    roomId: r.roomId,
    phase,
    running: r.running,
    endsAt,
    pausedRemaining: Math.min(Math.max(0, pausedRemaining), maxLen),
    focusMin,
    breakMin,
    round: Math.min(round, 999),
  };
}
