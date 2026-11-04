import { describe, it, expect } from 'vitest';
import { RateLimiter } from '../../src/lib/rateLimit';

describe('Empirical Verification of RateLimiter O(N^2) DoS under high cardinality', () => {
  it('measures latency degradation once store exceeds 5,000 entries', () => {
    const limiter = new RateLimiter(); // default 60s cleanupIntervalMs
    const config = { max: 10, windowMs: 60 * 1000 };
    const now = Date.now();

    // Measure time for 4,000 keys (below threshold)
    const t0 = performance.now();
    for (let i = 0; i < 4000; i++) {
      limiter.check(`ip:${i}`, config, now);
    }
    const durationBelow5k = performance.now() - t0;

    // Fill to 5,000 threshold
    for (let i = 4000; i < 5000; i++) {
      limiter.check(`ip:${i}`, config, now);
    }

    // Measure time for 500 keys above 5,000 threshold
    const t1 = performance.now();
    for (let i = 5000; i < 5500; i++) {
      limiter.check(`ip:${i}`, config, now);
    }
    const durationAbove5k = performance.now() - t1;

    console.log(`Duration for 4,000 keys below threshold: ${durationBelow5k.toFixed(2)}ms`);
    console.log(`Duration for 500 keys above 5,000 threshold: ${durationAbove5k.toFixed(2)}ms`);
    console.log(`Ratio (per operation): ${((durationAbove5k / 500) / (durationBelow5k / 4000)).toFixed(1)}x slower`);

    expect(limiter.size()).toBe(5500);
    // Above threshold is significantly slower per operation due to O(N) map scans on every call
    expect(durationAbove5k / 500).toBeGreaterThan((durationBelow5k / 4000) * 5);
  }, 15000);
});
