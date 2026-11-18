import { describe, it, expect } from 'vitest';
import { PresenceTrackBudget } from '../src/lib/services/presenceBudget';

describe('PresenceTrackBudget', () => {
  it('allows the budget, then waits for the oldest send to leave the window', () => {
    const b = new PresenceTrackBudget(4, 30_000);
    for (const t of [0, 1000, 2000, 3000]) {
      expect(b.waitMs(4, t)).toBe(0);
      b.record(t);
    }
    expect(b.waitMs(4, 4000)).toBe(30_000 - 4000 + 50);
    expect(b.waitMs(4, 30_001)).toBe(0);
  });

  it('a lower limit keeps slots in reserve', () => {
    const b = new PresenceTrackBudget(4, 30_000);
    b.record(0);
    b.record(1000);
    expect(b.waitMs(2, 2000)).toBe(30_000 - 2000 + 50);
    expect(b.waitMs(4, 2000)).toBe(0);
  });

  it('reset() starts a fresh window (new channel join)', () => {
    const b = new PresenceTrackBudget(4, 30_000);
    for (const t of [0, 1, 2, 3]) b.record(t);
    b.reset();
    expect(b.waitMs(4, 10)).toBe(0);
  });
});
