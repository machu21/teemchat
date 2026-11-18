/**
 * Supabase Realtime closes a presence channel when one client sends too many track()
 * calls on it ("Client presence rate limit exceeded"), and supabase-js does not rejoin a
 * channel the server closed. Measured on this project (2026-11-17): the 6th track closed
 * the channel at 1s, 2s and 3s spacing, while one track every 6s never did, so the window
 * is 15-30s with 5 tracks allowed. The counter is per channel join: a fresh join resets it.
 *
 * Every presence channel therefore spends at most TRACK_BUDGET tracks per TRACK_WINDOW_MS
 * per join, counting the track sent on SUBSCRIBED.
 */
export const TRACK_BUDGET = 4;
export const TRACK_WINDOW_MS = 30_000;

/** Sliding-window counter of track() calls for one channel join. */
export class PresenceTrackBudget {
  private sends: number[] = [];

  constructor(
    private readonly budget: number = TRACK_BUDGET,
    private readonly windowMs: number = TRACK_WINDOW_MS
  ) {}

  /** Call on every (re)join: the server starts counting from zero again. */
  reset(): void {
    this.sends = [];
  }

  /** Tracks sent inside the current window. */
  used(now: number = Date.now()): number {
    this.sends = this.sends.filter((t) => now - t < this.windowMs);
    return this.sends.length;
  }

  /**
   * Milliseconds until a send is allowed when at most `limit` sends may sit in the
   * window (0 = send now). A `limit` below the budget keeps slots in reserve.
   */
  waitMs(limit: number = this.budget, now: number = Date.now()): number {
    const cap = Math.min(limit, this.budget);
    if (this.used(now) < cap) return 0;
    // The oldest send that must expire before we drop below the cap.
    return this.sends[this.sends.length - cap] + this.windowMs - now + 50;
  }

  record(now: number = Date.now()): void {
    this.sends.push(now);
  }
}
