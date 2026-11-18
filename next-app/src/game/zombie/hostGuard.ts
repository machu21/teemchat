// ============================================================
// ZOMBIE MODE — HOST GUARD (pure)
// The host validates every client request against the world (reach,
// stock, ownership); this adds rate limits on top, so a modified or
// broken client can't flood it. A token bucket per (client, kind): a
// burst is fine, a stream above the rate is dropped and counted.
// ============================================================

export type RequestKind = 'strike' | 'shot' | 'door' | 'loot' | 'inv' | 'build' | 'death' | 'vehicle';

/** Sustained requests per second, and the burst allowed on top. */
export const REQUEST_LIMITS: Record<RequestKind, { rate: number; burst: number }> = {
  strike: { rate: 6, burst: 10 },
  shot: { rate: 8, burst: 12 },
  door: { rate: 4, burst: 8 },
  loot: { rate: 8, burst: 16 },
  inv: { rate: 8, burst: 24 },
  build: { rate: 4, burst: 10 },
  death: { rate: 0.2, burst: 2 },
  vehicle: { rate: 4, burst: 8 },
};

export class HostGuard {
  private readonly buckets = new Map<string, { tokens: number; at: number }>();
  /** Requests dropped per client (for the stats overlay / logs). */
  readonly dropped = new Map<string, number>();

  /** Whether `client` may make one more `kind` request at time `now` (seconds). */
  allow(client: string, kind: RequestKind, now: number): boolean {
    const limit = REQUEST_LIMITS[kind];
    const key = `${client}|${kind}`;
    const b = this.buckets.get(key) ?? { tokens: limit.burst, at: now };
    b.tokens = Math.min(limit.burst, b.tokens + Math.max(0, now - b.at) * limit.rate);
    b.at = now;
    if (b.tokens < 1) {
      this.buckets.set(key, b);
      this.dropped.set(client, (this.dropped.get(client) ?? 0) + 1);
      return false;
    }
    b.tokens -= 1;
    this.buckets.set(key, b);
    return true;
  }

  /** Forget a client (they left). */
  forget(client: string) {
    for (const key of this.buckets.keys()) if (key.startsWith(`${client}|`)) this.buckets.delete(key);
    this.dropped.delete(client);
  }

  get droppedTotal(): number {
    let n = 0;
    for (const v of this.dropped.values()) n += v;
    return n;
  }
}
