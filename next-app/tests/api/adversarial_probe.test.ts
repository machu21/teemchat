import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// 1. Environment variables and hoisted mocks
const {
  mockSignUp,
  mockUpsert,
  mockGetUser,
  mockRpc,
  mockGenerateContent,
  mockEmbedContent,
  mockAddGrant,
  mockToJwt,
} = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://pirpqkbdayorovfzczpq.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key-test-value';
  process.env.GEMINI_API_KEY = 'mock-gemini-key';
  process.env.GEMINI_MODEL = 'gemini-2.5-flash';
  process.env.LIVEKIT_API_KEY = 'mock-livekit-key';
  process.env.LIVEKIT_API_SECRET = 'mock-livekit-secret';

  return {
    mockSignUp: vi.fn(),
    mockUpsert: vi.fn(),
    mockGetUser: vi.fn(),
    mockRpc: vi.fn(),
    mockGenerateContent: vi.fn(),
    mockEmbedContent: vi.fn(),
    mockAddGrant: vi.fn(),
    mockToJwt: vi.fn(),
  };
});

// 2. Mock path aliases
vi.mock('@/lib/rateLimit', () => import('../../src/lib/rateLimit'));
vi.mock('@/lib/security/disposableEmails', () => import('../../src/lib/security/disposableEmails'));
vi.mock('@/lib/security/guestIdentity', () => import('../../src/lib/security/guestIdentity'));
vi.mock('@/lib/companionAuth', () => import('../../src/lib/companionAuth'));
vi.mock('@/lib/utils/screenshot', () => import('../../src/lib/utils/screenshot'));
vi.mock('@/lib/models/space', () => import('../../src/lib/models/space'));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      signUp: mockSignUp,
      getUser: mockGetUser,
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: '00000000-0000-0000-0000-000000000001' }, error: null }),
      upsert: mockUpsert,
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    rpc: mockRpc,
  })),
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      generateContent: mockGenerateContent,
      embedContent: mockEmbedContent,
    };
  },
}));

vi.mock('livekit-server-sdk', () => ({
  AccessToken: class {
    addGrant = mockAddGrant;
    toJwt = mockToJwt;
  },
}));

import { GET as getGuestIdentity } from '../../src/app/api/auth/guest-identity/route';
import { POST as postRegister } from '../../src/app/api/auth/register/route';
import { POST as postCompanionChat } from '../../src/app/api/companion/chat/route';
import { POST as postCompanionScreenHelp } from '../../src/app/api/companion/screen-help/route';
import { POST as postLivekitToken } from '../../src/app/api/livekit/token/route';
import { RateLimiter, defaultRateLimiter, RATE_LIMITS } from '../../src/lib/rateLimit';

describe('Adversarial & Stress Probe: API Route Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    defaultRateLimiter.reset();

    mockSignUp.mockResolvedValue({
      data: {
        user: { id: 'usr-12345', email: 'adversary@example.com' },
        session: { access_token: 'fake-jwt', refresh_token: 'fake-refresh' },
      },
      error: null,
    });

    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'usr-adv-999',
          email: 'adversary@example.com',
          is_anonymous: false,
          app_metadata: {},
          user_metadata: {},
        },
      },
      error: null,
    });

    mockRpc.mockImplementation((rpcName: string) => {
      if (rpcName === 'check_and_increment_ai_usage') {
        return Promise.resolve({ data: { allowed: true }, error: null });
      }
      return Promise.resolve({ data: [], error: null });
    });

    mockGenerateContent.mockResolvedValue({ text: 'Adversarial response OK' });
    mockEmbedContent.mockResolvedValue({ embedding: { values: [0.1, 0.2, 0.3] } });
  });

  describe('Probe 1: Null, Undefined, Malformed Bodies and Non-Object JSON', () => {
    it('handles "null" body gracefully across all POST routes without unhandled process crash', async () => {
      const routes = [
        { name: 'register', fn: postRegister, path: 'http://localhost:3000/api/auth/register' },
        { name: 'chat', fn: postCompanionChat, path: 'http://localhost:3000/api/companion/chat', auth: true },
        { name: 'screen-help', fn: postCompanionScreenHelp, path: 'http://localhost:3000/api/companion/screen-help', auth: true },
        { name: 'livekit', fn: postLivekitToken, path: 'http://localhost:3000/api/livekit/token', auth: true },
      ];

      for (const route of routes) {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (route.auth) headers['Authorization'] = 'Bearer valid-jwt-token';

        const req = new NextRequest(route.path, {
          method: 'POST',
          headers,
          body: 'null',
        });

        const res = await route.fn(req);
        // None should throw or crash; must return valid JSON response
        expect([400, 500]).toContain(res.status);
        const data = await res.json();
        expect(data).toHaveProperty('error');
      }
    });

    it('handles malformed broken JSON syntax without unhandled crash', async () => {
      const routes = [
        { name: 'register', fn: postRegister, path: 'http://localhost:3000/api/auth/register' },
        { name: 'chat', fn: postCompanionChat, path: 'http://localhost:3000/api/companion/chat', auth: true },
        { name: 'screen-help', fn: postCompanionScreenHelp, path: 'http://localhost:3000/api/companion/screen-help', auth: true },
        { name: 'livekit', fn: postLivekitToken, path: 'http://localhost:3000/api/livekit/token', auth: true },
      ];

      for (const route of routes) {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (route.auth) headers['Authorization'] = 'Bearer valid-jwt-token';

        const req = new NextRequest(route.path, {
          method: 'POST',
          headers,
          body: '{"unclosed": "json',
        });

        const res = await route.fn(req);
        expect([400, 500]).toContain(res.status);
        const data = await res.json();
        expect(data).toHaveProperty('error');
      }
    });

    it('handles numeric and boolean primitive JSON values without crash', async () => {
      for (const primitive of ['12345', 'true', '"a bare string"', '[]']) {
        const reqReg = new NextRequest('http://localhost:3000/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: primitive,
        });
        const resReg = await postRegister(reqReg);
        expect(resReg.status).toBe(400);

        const reqScreen = new NextRequest('http://localhost:3000/api/companion/screen-help', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-jwt' },
          body: primitive,
        });
        const resScreen = await postCompanionScreenHelp(reqScreen);
        expect(resScreen.status).toBe(400);
      }
    });
  });

  describe('Probe 2: Prototype Pollution Attacks', () => {
    it('prevents prototype pollution from modifying Object.prototype across all routes', async () => {
      const maliciousPayload = JSON.stringify({
        __proto__: { pollutedAdmin: true, role: 'superuser' },
        constructor: { prototype: { hacked: true } },
        renderedAt: Date.now() - 2000,
        email: 'attacker@example.com',
        password: 'password123',
        username: 'attacker',
      });

      const req = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: maliciousPayload,
      });

      await postRegister(req);

      // Verify Object.prototype was NOT polluted
      const cleanObj = {} as Record<string, unknown>;
      expect(cleanObj['pollutedAdmin']).toBeUndefined();
      expect(cleanObj['role']).toBeUndefined();
      expect(cleanObj['hacked']).toBeUndefined();
    });
  });

  describe('Probe 3: Extreme Strings and Boundary Payloads', () => {
    it('rejects extreme 2MB username in registration with 400 validation error', async () => {
      const hugeUsername = 'a'.repeat(2 * 1024 * 1024);
      const req = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'valid@example.com',
          password: 'password123',
          username: hugeUsername,
          renderedAt: Date.now() - 3000,
        }),
      });

      const res = await postRegister(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('cannot exceed 24 characters');
    });

    it('rejects screen-help message exceeding 2000 characters with 400 error', async () => {
      const longMessage = 'x'.repeat(2001);
      const req = new NextRequest('http://localhost:3000/api/companion/screen-help', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-jwt' },
        body: JSON.stringify({
          userMessage: longMessage,
          screenshot: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        }),
      });

      const res = await postCompanionScreenHelp(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Message is too long');
    });

    it('handles extreme guest identity instance seed without crashing', async () => {
      const extremeSeed = 'Z'.repeat(100_000);
      const req = new NextRequest(`http://localhost:3000/api/auth/guest-identity?instance=${extremeSeed}`);
      const res = await getGuestIdentity(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.ipTag).toMatch(/^[0-9A-F]{4}$/);
    });

    it('rejects timing attack with future/skewed timestamp in registration', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'valid@example.com',
          password: 'password123',
          username: 'validuser',
          renderedAt: Date.now() + 60_000, // 60s in the future
        }),
      });

      const res = await postRegister(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      // Because elapsed < minDurationMs triggers before elapsed < -5000, it rejects with timing warning
      expect(data.error).toBe('Form submission was too fast. Please take your time.');
    });

    it('rejects SVG screenshot attempt (preventing SVG XSS vectors)', async () => {
      const req = new NextRequest('http://localhost:3000/api/companion/screen-help', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-jwt' },
        body: JSON.stringify({
          userMessage: 'How do I fix this?',
          screenshot: 'data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+',
        }),
      });

      const res = await postCompanionScreenHelp(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Screenshot must be a base64 image data URL');
    });
  });

  describe('Probe 4: Concurrency & Burst Stress on Rate Limiting', () => {
    it('RateLimiter is deterministic under 100 concurrent asynchronous burst requests', async () => {
      const limiter = new RateLimiter();
      const config = { max: 10, windowMs: 60 * 1000 };
      const key = 'burst:test:key';

      // 100 concurrent requests in parallel
      const tasks = Array.from({ length: 100 }, () =>
        Promise.resolve().then(() => limiter.check(key, config))
      );

      const results = await Promise.all(tasks);
      const successCount = results.filter((r) => r.success).length;
      const rejectedCount = results.filter((r) => !r.success).length;

      expect(successCount).toBe(10);
      expect(rejectedCount).toBe(90);

      // All rejected requests must contain retryAfter > 0
      for (const rejected of results.filter((r) => !r.success)) {
        expect(rejected.remaining).toBe(0);
        expect(rejected.retryAfter).toBeGreaterThan(0);
      }
    });

    it('safely handles 1,000 distinct IP keys and purges expired entries on cleanup', () => {
      const limiter = new RateLimiter();
      const config = { max: 5, windowMs: 1000 };
      const now = Date.now();

      for (let i = 0; i < 1_000; i++) {
        limiter.check(`ip:${i}`, config, now);
      }

      expect(limiter.size()).toBe(1000);

      // Advance time past windowMs and trigger cleanup
      limiter.manualCleanup(now + 2000, 1000);
      expect(limiter.size()).toBe(0);
    });

    it('endpoint register enforces sliding window rate limit under parallel burst', async () => {
      const ip = '198.51.100.222';
      const requests = Array.from({ length: 20 }, () => {
        return postRegister(
          new NextRequest('http://localhost:3000/api/auth/register', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-forwarded-for': ip,
            },
            body: JSON.stringify({
              email: 'burst@example.com',
              password: 'password123',
              username: 'burst_user',
              renderedAt: Date.now() - 3000,
            }),
          })
        );
      });

      const responses = await Promise.all(requests);
      const statuses = responses.map((r) => r.status);

      const count200 = statuses.filter((s) => s === 200).length;
      const count429 = statuses.filter((s) => s === 429).length;

      // RATE_LIMITS.AUTH_SIGNUP allows exactly 5 requests per window
      expect(count200).toBe(5);
      expect(count429).toBe(15);

      // Verify 429 responses have retry-after headers
      for (const res of responses.filter((r) => r.status === 429)) {
        expect(res.headers.get('retry-after')).toBeDefined();
        const body = await res.json();
        expect(body.error).toBe('Rate limit exceeded');
      }
    });
  });

  describe('Probe 5: Error Status Codes & Content-Type Rigor', () => {
    it('always returns Content-Type application/json on all error paths (400, 401, 403, 429, 500)', async () => {
      // 401 Missing Auth
      const res401 = await postCompanionChat(
        new NextRequest('http://localhost:3000/api/companion/chat', { method: 'POST' })
      );
      expect(res401.status).toBe(401);
      expect(res401.headers.get('content-type')).toContain('application/json');

      // 403 Guest Forbidden
      mockGetUser.mockResolvedValueOnce({
        data: {
          user: {
            id: 'usr-guest-1',
            email: 'guest_1234@guest.teemchat.local',
            is_anonymous: true,
          },
        },
        error: null,
      });
      const res403 = await postCompanionChat(
        new NextRequest('http://localhost:3000/api/companion/chat', {
          method: 'POST',
          headers: { Authorization: 'Bearer guest-jwt' },
        })
      );
      expect(res403.status).toBe(403);
      expect(res403.headers.get('content-type')).toContain('application/json');

      // 400 Validation Error
      const res400 = await postRegister(
        new NextRequest('http://localhost:3000/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
      );
      expect(res400.status).toBe(400);
      expect(res400.headers.get('content-type')).toContain('application/json');

      // 429 Rate Limit
      const ip = '198.51.100.230';
      for (let i = 0; i < 5; i++) {
        defaultRateLimiter.check(`ip:signup:${ip}`, RATE_LIMITS.AUTH_SIGNUP);
      }
      const res429 = await postRegister(
        new NextRequest('http://localhost:3000/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
          body: JSON.stringify({ email: 'test@example.com' }),
        })
      );
      expect(res429.status).toBe(429);
      expect(res429.headers.get('content-type')).toContain('application/json');
    });
  });
});
