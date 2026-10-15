import { describe, it, expect, beforeEach } from 'vitest';
import {
  RateLimiter,
  checkRateLimit,
  getClientIp,
  getRateLimitHeaders,
  RATE_LIMITS,
} from '../src/lib/rateLimit';

describe('RateLimiter engine', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter();
  });

  it('allows requests within the limit', () => {
    const config = { max: 3, windowMs: 1000 };
    const key = 'test-client-1';

    const res1 = limiter.check(key, config, 1000);
    expect(res1.success).toBe(true);
    expect(res1.remaining).toBe(2);
    expect(res1.limit).toBe(3);

    const res2 = limiter.check(key, config, 1100);
    expect(res2.success).toBe(true);
    expect(res2.remaining).toBe(1);

    const res3 = limiter.check(key, config, 1200);
    expect(res3.success).toBe(true);
    expect(res3.remaining).toBe(0);
  });

  it('blocks requests once limit is exceeded and provides retryAfter', () => {
    const config = { max: 2, windowMs: 10000 };
    const key = 'test-client-blocked';

    limiter.check(key, config, 1000);
    limiter.check(key, config, 2000);

    const blocked = limiter.check(key, config, 3000);
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.limit).toBe(2);
    // Oldest is at 1000, window is 10000, so resetMs is 11000. Current is 3000.
    // retryAfter is ceil((11000 - 3000) / 1000) = 8
    expect(blocked.retryAfter).toBe(8);
    expect(blocked.reset).toBe(11); // ceil(11000 / 1000)
  });

  it('re-allows requests as sliding window rolls forward', () => {
    const config = { max: 2, windowMs: 1000 };
    const key = 'test-client-sliding';

    limiter.check(key, config, 1000); // req 1
    limiter.check(key, config, 1500); // req 2

    // At 1800, both req 1 and 2 are in window [800, 1800]
    expect(limiter.check(key, config, 1800).success).toBe(false);

    // At 2050, window is [1050, 2050]. Req 1 (at 1000) expired! Req 2 (at 1500) still valid.
    const resAllowed = limiter.check(key, config, 2050);
    expect(resAllowed.success).toBe(true);
    expect(resAllowed.remaining).toBe(0); // now has [1500, 2050] which is 2 requests
  });

  it('maintains isolated counts for distinct keys', () => {
    const config = { max: 1, windowMs: 5000 };
    const resA1 = limiter.check('client-A', config, 1000);
    const resB1 = limiter.check('client-B', config, 1000);

    expect(resA1.success).toBe(true);
    expect(resB1.success).toBe(true);

    const resA2 = limiter.check('client-A', config, 1000);
    const resB2 = limiter.check('client-B', config, 1000);

    expect(resA2.success).toBe(false);
    expect(resB2.success).toBe(false);
  });

  it('prunes expired entries during manualCleanup', () => {
    const config = { max: 2, windowMs: 1000 };
    limiter.check('client-old', config, 1000);
    limiter.check('client-active', config, 2500);

    expect(limiter.size()).toBe(2);

    // Run cleanup at 3000 with window 1000 (oldest allowed: 2000)
    limiter.manualCleanup(3000, 1000);

    expect(limiter.size()).toBe(1); // 'client-old' pruned, 'client-active' kept
  });

  it('clears all entries on reset', () => {
    const config = { max: 5, windowMs: 1000 };
    limiter.check('client-1', config, 1000);
    limiter.check('client-2', config, 1000);
    expect(limiter.size()).toBe(2);

    limiter.reset();
    expect(limiter.size()).toBe(0);
  });
});

describe('checkRateLimit helper', () => {
  it('uses configured default limits', () => {
    const res = checkRateLimit('unique-key-' + Date.now(), RATE_LIMITS.DEFAULT_API);
    expect(res.limit).toBe(60);
    expect(res.success).toBe(true);
  });
});

describe('getClientIp', () => {
  it('extracts the first IP from x-forwarded-for header', () => {
    const req = new Request('http://localhost/api/test', {
      headers: {
        'x-forwarded-for': '203.0.113.195, 70.41.3.18, 150.172.238.178',
      },
    });
    expect(getClientIp(req)).toBe('203.0.113.195');
  });

  it('falls back to x-real-ip when x-forwarded-for is missing', () => {
    const req = new Request('http://localhost/api/test', {
      headers: {
        'x-real-ip': '198.51.100.42',
      },
    });
    expect(getClientIp(req)).toBe('198.51.100.42');
  });

  it('falls back to cf-connecting-ip when other headers are missing', () => {
    const req = new Request('http://localhost/api/test', {
      headers: {
        'cf-connecting-ip': '192.0.2.1',
      },
    });
    expect(getClientIp(req)).toBe('192.0.2.1');
  });

  it('returns default 127.0.0.1 when no IP headers are present', () => {
    const req = new Request('http://localhost/api/test');
    expect(getClientIp(req)).toBe('127.0.0.1');
  });
});

describe('getRateLimitHeaders', () => {
  it('formats standard rate limit headers when allowed', () => {
    const headers = getRateLimitHeaders({
      success: true,
      limit: 60,
      remaining: 59,
      reset: 1700000060,
    });

    expect(headers['X-RateLimit-Limit']).toBe('60');
    expect(headers['X-RateLimit-Remaining']).toBe('59');
    expect(headers['X-RateLimit-Reset']).toBe('1700000060');
    expect(headers['Retry-After']).toBeUndefined();
  });

  it('includes Retry-After header when rate limit is exceeded', () => {
    const headers = getRateLimitHeaders({
      success: false,
      limit: 10,
      remaining: 0,
      reset: 1700000060,
      retryAfter: 15,
    });

    expect(headers['X-RateLimit-Limit']).toBe('10');
    expect(headers['X-RateLimit-Remaining']).toBe('0');
    expect(headers['X-RateLimit-Reset']).toBe('1700000060');
    expect(headers['Retry-After']).toBe('15');
  });
});
