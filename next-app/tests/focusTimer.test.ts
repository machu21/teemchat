import { describe, it, expect } from 'vitest';
import {
  MAX_SKEW_MS,
  adjustForSkew,
  advance,
  formatClock,
  parseTimerPayload,
  pauseTimer,
  remaining,
  resumeTimer,
  skipPhase,
  startTimer,
} from '../src/lib/world/focusTimer';
import { parseRoomEvent } from '../src/lib/world/rooms';

const MIN = 60_000;
const T0 = 1_000_000;

describe('focus timer', () => {
  it('starts a focus block and counts down', () => {
    const t = startTimer('office-boardroom', 25, 5, T0);
    expect(t.phase).toBe('focus');
    expect(remaining(t, T0 + MIN)).toBe(24 * MIN);
    // Partial seconds round up, so the clock never shows 00:00 early
    expect(formatClock(remaining(t, T0 + MIN + 500))).toBe('24:00');
    expect(formatClock(90_000)).toBe('01:30');
  });

  it('pauses and resumes without losing time', () => {
    const t = startTimer('r', 25, 5, T0);
    const paused = pauseTimer(t, T0 + 10 * MIN);
    expect(paused.running).toBe(false);
    expect(remaining(paused, T0 + 60 * MIN)).toBe(15 * MIN);
    const resumed = resumeTimer(paused, T0 + 60 * MIN);
    expect(remaining(resumed, T0 + 61 * MIN)).toBe(14 * MIN);
  });

  it('rolls focus → break → focus and counts rounds', () => {
    const t = startTimer('r', 25, 5, T0);
    expect(advance(t, T0 + 10 * MIN)).toBe(t); // unchanged object
    const brk = advance(t, T0 + 25 * MIN);
    expect(brk.phase).toBe('break');
    expect(brk.round).toBe(1);
    expect(remaining(brk, T0 + 26 * MIN)).toBe(4 * MIN);
    // A tab that slept through several phases catches up:
    // focus 0–25, break 25–30, focus 30–55, break 55–60, focus 60–85
    const later = advance(t, T0 + 65 * MIN);
    expect(later.phase).toBe('focus');
    expect(later.round).toBe(2);
    expect(remaining(later, T0 + 65 * MIN)).toBe(20 * MIN);
  });

  it('skips to the next phase immediately', () => {
    const t = startTimer('r', 50, 10, T0);
    const s = skipPhase(t, T0 + MIN);
    expect(s.phase).toBe('break');
    expect(remaining(s, T0 + MIN)).toBe(10 * MIN);
  });

  it('clamps clock skew from other clients', () => {
    const t = startTimer('r', 25, 5, T0);
    expect(adjustForSkew(t, T0, T0 + 2000).endsAt).toBe(t.endsAt + 2000);
    expect(adjustForSkew(t, T0, T0 + 10 * MIN).endsAt).toBe(t.endsAt + MAX_SKEW_MS);
    expect(adjustForSkew(t, T0 + 10 * MIN, T0).endsAt).toBe(t.endsAt - MAX_SKEW_MS);
  });

  it('validates broadcast payloads', () => {
    const t = startTimer('office-boardroom', 25, 5, T0);
    expect(parseTimerPayload(t)).toEqual(t);
    expect(parseTimerPayload(null)).toBeNull();
    expect(parseTimerPayload({ ...t, focusMin: 0 })).toBeUndefined();
    expect(parseTimerPayload({ ...t, roomId: '../x' })).toBeUndefined();
    expect(parseTimerPayload({ ...t, phase: 'nap' })).toBeUndefined();
    expect(parseTimerPayload({ ...t, pausedRemaining: 999 * MIN })?.pausedRemaining).toBe(25 * MIN);
    expect(parseTimerPayload('nope')).toBeUndefined();
  });
});

describe('room events: focus timer and notes', () => {
  const ME = 'me';
  it('accepts a timer for the same room only', () => {
    const t = startTimer('office-boardroom', 25, 5, T0);
    const ok = parseRoomEvent('focus_timer', { room_id: 'office-boardroom', actor_id: 'a', timer: t, sent_at: T0 }, ME);
    expect(ok).toMatchObject({ type: 'focus_timer', timer: t, sentAt: T0 });
    expect(parseRoomEvent('focus_timer', { room_id: 'office-pod-1', actor_id: 'a', timer: t, sent_at: T0 }, ME)).toBeNull();
    expect(parseRoomEvent('focus_timer', { room_id: 'office-boardroom', actor_id: 'a', timer: t }, ME)).toBeNull();
    expect(
      parseRoomEvent('focus_timer', { room_id: 'office-boardroom', actor_id: 'a', timer: null, sent_at: T0 }, ME)
    ).toMatchObject({ timer: null });
  });

  it('parses notes state and room_state extras', () => {
    expect(parseRoomEvent('notes_state', { room_id: 'office-boardroom', actor_id: 'a', actor_name: 'Kim', on: true }, ME)).toEqual({
      type: 'notes_state',
      roomId: 'office-boardroom',
      actorId: 'a',
      actorName: 'Kim',
      on: true,
    });
    expect(parseRoomEvent('notes_state', { room_id: 'office-boardroom', actor_id: 'a', on: 'yes' }, ME)).toBeNull();
    const state = parseRoomEvent(
      'room_state',
      { room_id: 'office-boardroom', actor_id: 'a', target_id: ME, locked: false, timer: { bad: true }, notes_on: true, sent_at: T0 },
      ME
    );
    expect(state).toMatchObject({ type: 'room_state', notesOn: true, sentAt: T0 });
    expect(state && 'timer' in state ? state.timer : 'absent').toBe('absent');
  });
});
