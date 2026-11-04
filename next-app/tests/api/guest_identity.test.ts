import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('@/lib/rateLimit', () => import('../../src/lib/rateLimit'));
vi.mock('@/lib/security/guestIdentity', () => import('../../src/lib/security/guestIdentity'));

import { GET } from '../../src/app/api/auth/guest-identity/route';
import { defaultRateLimiter } from '../../src/lib/rateLimit';
import * as guestIdentityLib from '../../src/lib/security/guestIdentity';

describe('GET /api/auth/guest-identity', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    defaultRateLimiter.reset();
  });

  describe('Happy Path & Deterministic Tag Generation', () => {
    it('returns status 200 with deterministic guest identity when no headers provided', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/guest-identity');
      const res = await GET(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/json');

      const data = await res.json();
      expect(data).toEqual({
        success: true,
        ipTag: 'D9C1',
        username: 'guest_d9c1',
        displayName: 'Explorer #D9C1',
      });
    });

    it('generates consistent 4-character hex tags for custom external IP', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/guest-identity', {
        headers: { 'x-forwarded-for': '198.51.100.24' },
      });
      const res = await GET(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.ipTag).toMatch(/^[0-9A-F]{4}$/);
      expect(data.username).toBe(`guest_${data.ipTag.toLowerCase()}`);
      expect(data.displayName).toBe(`Explorer #${data.ipTag}`);
    });

    it('extracts the client IP from first entry of comma-separated x-forwarded-for header', async () => {
      const req1 = new NextRequest('http://localhost:3000/api/auth/guest-identity', {
        headers: { 'x-forwarded-for': '203.0.113.195, 10.0.0.1, 192.168.1.1' },
      });
      const req2 = new NextRequest('http://localhost:3000/api/auth/guest-identity', {
        headers: { 'x-forwarded-for': '203.0.113.195' },
      });

      const res1 = await GET(req1);
      const res2 = await GET(req2);

      const data1 = await res1.json();
      const data2 = await res2.json();

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(data1.ipTag).toBe(data2.ipTag);
      expect(data1.username).toBe(data2.username);
    });

    it('extracts IP from x-real-ip header when x-forwarded-for is missing', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/guest-identity', {
        headers: { 'x-real-ip': '198.51.100.77' },
      });
      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.ipTag).toMatch(/^[0-9A-F]{4}$/);
      expect(data.username).toBe(`guest_${data.ipTag.toLowerCase()}`);
    });

    it('extracts IP from cf-connecting-ip header when other IP headers are missing', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/guest-identity', {
        headers: { 'cf-connecting-ip': '198.51.100.88' },
      });
      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.ipTag).toMatch(/^[0-9A-F]{4}$/);
    });

    it('normalizes localhost IPv4, IPv6 loopback, and hostname to identical baseline tag', async () => {
      const reqIPv4 = new NextRequest('http://localhost:3000/api/auth/guest-identity', {
        headers: { 'x-forwarded-for': '127.0.0.1' },
      });
      const reqIPv6 = new NextRequest('http://localhost:3000/api/auth/guest-identity', {
        headers: { 'x-forwarded-for': '::1' },
      });
      const reqHost = new NextRequest('http://localhost:3000/api/auth/guest-identity', {
        headers: { 'x-forwarded-for': 'localhost' },
      });

      const [resIPv4, resIPv6, resHost] = await Promise.all([
        GET(reqIPv4),
        GET(reqIPv6),
        GET(reqHost),
      ]);

      const [dataIPv4, dataIPv6, dataHost] = await Promise.all([
        resIPv4.json(),
        resIPv6.json(),
        resHost.json(),
      ]);

      expect(dataIPv4.ipTag).toBe('D9C1');
      expect(dataIPv6.ipTag).toBe('D9C1');
      expect(dataHost.ipTag).toBe('D9C1');
    });

    it('distinguishes different client IPs with distinct IP tags', async () => {
      const reqA = new NextRequest('http://localhost:3000/api/auth/guest-identity', {
        headers: { 'x-forwarded-for': '198.51.100.1' },
      });
      const reqB = new NextRequest('http://localhost:3000/api/auth/guest-identity', {
        headers: { 'x-forwarded-for': '198.51.100.2' },
      });

      const resA = await GET(reqA);
      const resB = await GET(reqB);

      const dataA = await resA.json();
      const dataB = await resB.json();

      expect(dataA.ipTag).not.toBe(dataB.ipTag);
      expect(dataA.username).not.toBe(dataB.username);
    });
  });

  describe('Instance Seed Query Parameter & Session Disambiguation', () => {
    it('disambiguates multiple browser tabs on the same IP via instance seed', async () => {
      const ip = '198.51.100.50';
      const reqTab1 = new NextRequest(`http://localhost:3000/api/auth/guest-identity?instance=TAB_A`, {
        headers: { 'x-forwarded-for': ip },
      });
      const reqTab2 = new NextRequest(`http://localhost:3000/api/auth/guest-identity?instance=TAB_B`, {
        headers: { 'x-forwarded-for': ip },
      });

      const resTab1 = await GET(reqTab1);
      const resTab2 = await GET(reqTab2);

      const dataTab1 = await resTab1.json();
      const dataTab2 = await resTab2.json();

      expect(dataTab1.ipTag).not.toBe(dataTab2.ipTag);
      expect(dataTab1.username).not.toBe(dataTab2.username);
    });

    it('treats empty or whitespace-only instance parameter as undefined', async () => {
      const ip = '198.51.100.60';
      const reqDefault = new NextRequest('http://localhost:3000/api/auth/guest-identity', {
        headers: { 'x-forwarded-for': ip },
      });
      const reqEmpty = new NextRequest('http://localhost:3000/api/auth/guest-identity?instance=', {
        headers: { 'x-forwarded-for': ip },
      });

      const resDefault = await GET(reqDefault);
      const resEmpty = await GET(reqEmpty);

      const dataDefault = await resDefault.json();
      const dataEmpty = await resEmpty.json();

      expect(dataDefault.ipTag).toBe(dataEmpty.ipTag);
    });

    it('is completely deterministic across multiple repeated invocations', async () => {
      const url = 'http://localhost:3000/api/auth/guest-identity?instance=REPEATED_TEST';
      const headers = { 'x-forwarded-for': '198.51.100.99' };

      const res1 = await GET(new NextRequest(url, { headers }));
      const res2 = await GET(new NextRequest(url, { headers }));
      const res3 = await GET(new NextRequest(url, { headers }));

      const data1 = await res1.json();
      const data2 = await res2.json();
      const data3 = await res3.json();

      expect(data1).toEqual(data2);
      expect(data2).toEqual(data3);
    });
  });

  describe('Resilience & Fallback Handling', () => {
    it('returns status 200 with fallback tag and warning when an unexpected error is thrown', async () => {
      vi.spyOn(guestIdentityLib, 'generateIpTag').mockImplementationOnce(() => {
        throw new Error('Simulated crypto/hashing failure');
      });

      const req = new NextRequest('http://localhost:3000/api/auth/guest-identity');
      const res = await GET(req);

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.warning).toBe('Simulated crypto/hashing failure');
      expect(data.ipTag).toMatch(/^[0-9A-F]{3,4}$/);
      expect(data.username).toBe(`guest_${data.ipTag.toLowerCase()}`);
      expect(data.displayName).toBe(`Explorer #${data.ipTag}`);
    });

    it('handles non-Error throw gracefully in catch block', async () => {
      vi.spyOn(guestIdentityLib, 'generateIpTag').mockImplementationOnce(() => {
        throw 'String error thrown';
      });

      const req = new NextRequest('http://localhost:3000/api/auth/guest-identity');
      const res = await GET(req);

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.warning).toBe('Failed to determine guest identity');
      expect(data.ipTag).toBeDefined();
    });
  });

  describe('Rate Limiting & Headers', () => {
    it('returns rate limit headers on successful guest identity requests', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/guest-identity', {
        headers: { 'x-forwarded-for': '198.51.100.5' },
      });
      const res = await GET(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('x-ratelimit-limit')).toBe('10');
      expect(res.headers.get('x-ratelimit-remaining')).toBe('9');
      expect(res.headers.get('x-ratelimit-reset')).toBeDefined();
    });

    it('returns 429 Too Many Requests when rate limit of 10 requests is exceeded', async () => {
      const ip = '203.0.113.88';

      // Exhaust 10 allowed requests
      for (let i = 0; i < 10; i++) {
        const req = new NextRequest('http://localhost:3000/api/auth/guest-identity', {
          headers: { 'x-forwarded-for': ip },
        });
        const res = await GET(req);
        expect(res.status).toBe(200);
      }

      // 11th request must be rejected with 429
      const blockedReq = new NextRequest('http://localhost:3000/api/auth/guest-identity', {
        headers: { 'x-forwarded-for': ip },
      });
      const blockedRes = await GET(blockedReq);

      expect(blockedRes.status).toBe(429);
      expect(blockedRes.headers.get('retry-after')).toBeDefined();
      expect(blockedRes.headers.get('x-ratelimit-remaining')).toBe('0');

      const data = await blockedRes.json();
      expect(data.error).toBe('Rate limit exceeded');
      expect(data.message).toContain('Too many guest sessions requested');
    });

    it('isolates rate limit buckets across different client IP addresses', async () => {
      const ipA = '198.51.100.10';
      const ipB = '198.51.100.20';

      // Exhaust limit on IP A
      for (let i = 0; i < 10; i++) {
        await GET(
          new NextRequest('http://localhost:3000/api/auth/guest-identity', {
            headers: { 'x-forwarded-for': ipA },
          })
        );
      }

      // IP A should be blocked
      const blockedA = await GET(
        new NextRequest('http://localhost:3000/api/auth/guest-identity', {
          headers: { 'x-forwarded-for': ipA },
        })
      );
      expect(blockedA.status).toBe(429);

      // IP B should still be allowed
      const allowedB = await GET(
        new NextRequest('http://localhost:3000/api/auth/guest-identity', {
          headers: { 'x-forwarded-for': ipB },
        })
      );
      expect(allowedB.status).toBe(200);
      expect(allowedB.headers.get('x-ratelimit-remaining')).toBe('9');
    });
  });
});
