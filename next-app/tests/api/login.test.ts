import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// 1. Hoist environment variables
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://pirpqkbdayorovfzczpq.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key-test-value';
});

vi.mock('@/lib/rateLimit', () => import('../../src/lib/rateLimit'));
vi.mock('@/lib/security/disposableEmails', () => import('../../src/lib/security/disposableEmails'));

// 2. Mock @supabase/supabase-js
const mockSignInWithPassword = vi.fn();

const mockSupabaseClient = {
  auth: {
    signInWithPassword: mockSignInWithPassword,
  },
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseClient),
}));

import { POST } from '../../src/app/api/auth/login/route';
import { defaultRateLimiter } from '../../src/lib/rateLimit';

describe('POST /api/auth/login', () => {
  const validPayload = () => ({
    email: 'adventurer@example.com',
    password: 'ValidPassword123!',
  });

  const createRequest = (body: unknown, headers: Record<string, string> = {}) => {
    return new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '198.51.100.55',
        ...headers,
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    defaultRateLimiter.reset();

    mockSignInWithPassword.mockResolvedValue({
      data: {
        user: {
          id: '00000000-0000-0000-0000-000000000001',
          email: 'adventurer@example.com',
          user_metadata: {
            username: 'adventurer',
            display_name: 'Adventurer',
          },
        },
        session: {
          access_token: 'mock-access-jwt-token',
          refresh_token: 'mock-refresh-token',
          expires_at: 1800000000,
        },
      },
      error: null,
    });
  });

  describe('Happy Path & Credential Verification', () => {
    it('returns status 200 with user and session for valid credentials', async () => {
      const req = createRequest(validPayload());
      const res = await POST(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/json');

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.user.id).toBe('00000000-0000-0000-0000-000000000001');
      expect(data.session.access_token).toBe('mock-access-jwt-token');

      // Rate limit headers present
      expect(res.headers.get('x-ratelimit-limit')).toBe('5');
      expect(res.headers.get('x-ratelimit-remaining')).toBeDefined();
    });

    it('normalizes email before passing to authentication provider', async () => {
      const payload = {
        email: '  Explorer.Hero+Test@Example.COM  ',
        password: 'ValidPassword123!',
      };
      const req = createRequest(payload);
      const res = await POST(req);

      expect(res.status).toBe(200);
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: 'explorer.hero@example.com',
        password: 'ValidPassword123!',
      });
    });

    it('resets account failure counter on successful authentication', async () => {
      const email = 'retry_user@example.com';

      // 1. First attempt fails
      mockSignInWithPassword.mockResolvedValueOnce({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials' },
      });
      const req1 = createRequest({ email, password: 'wrong' });
      const res1 = await POST(req1);
      expect(res1.status).toBe(401);

      // Remaining attempts should be 4
      const res1Data = await res1.json();
      expect(res1Data.remainingAttempts).toBe(4);

      // 2. Second attempt succeeds
      const req2 = createRequest({ email, password: 'correct' });
      const res2 = await POST(req2);
      expect(res2.status).toBe(200);

      // 3. Failure on 3rd attempt starts with fresh bucket (remaining 4 instead of 3)
      mockSignInWithPassword.mockResolvedValueOnce({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials' },
      });
      const req3 = createRequest({ email, password: 'wrong_again' });
      const res3 = await POST(req3);
      const res3Data = await res3.json();
      expect(res3Data.remainingAttempts).toBe(4);
    });
  });

  describe('Invalid Inputs & Payload Validation', () => {
    it('returns status 400 when body is missing or invalid JSON', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'invalid-json{',
      });
      const res = await POST(req);

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Email and password are required.');
    });

    it('returns status 400 when email is missing or empty', async () => {
      const req = createRequest({ email: '', password: 'some_password' });
      const res = await POST(req);

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Email and password are required.');
    });

    it('returns status 400 when password is missing', async () => {
      const req = createRequest({ email: 'test@example.com' });
      const res = await POST(req);

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Email and password are required.');
    });
  });

  describe('Authentication Failures (Status 401)', () => {
    it('returns status 401 when invalid password is provided', async () => {
      mockSignInWithPassword.mockResolvedValueOnce({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials' },
      });

      const req = createRequest(validPayload());
      const res = await POST(req);

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe('Invalid login credentials');
      expect(data.remainingAttempts).toBe(4);
      expect(res.headers.get('x-ratelimit-remaining')).toBe('4');
    });
  });

  describe('Account-Level Rate Limiting (Brute Force Defense)', () => {
    it('returns status 429 when 5 failed login attempts occur for the same email', async () => {
      const email = 'victim@example.com';
      mockSignInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials' },
      });

      // 5 failed attempts
      for (let i = 0; i < 5; i++) {
        const req = createRequest({ email, password: `guess_${i}` });
        const res = await POST(req);
        expect(res.status).toBe(401);
      }

      // 6th attempt must be rejected with 429
      const blockedReq = createRequest({ email, password: 'guess_6' });
      const blockedRes = await POST(blockedReq);

      expect(blockedRes.status).toBe(429);
      expect(blockedRes.headers.get('retry-after')).toBeDefined();
      expect(blockedRes.headers.get('x-ratelimit-remaining')).toBe('0');

      const data = await blockedRes.json();
      expect(data.error).toBe('Rate limit exceeded');
      expect(data.message).toContain('Too many failed login attempts for this account');
    });

    it('does not block a different email when one email is locked out', async () => {
      mockSignInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials' },
      });

      // Lock out victimA
      for (let i = 0; i < 5; i++) {
        await POST(createRequest({ email: 'victimA@example.com', password: 'bad' }, { 'x-forwarded-for': '198.51.100.1' }));
      }

      // Check victimA is blocked
      const blockedA = await POST(createRequest({ email: 'victimA@example.com', password: 'bad' }, { 'x-forwarded-for': '198.51.100.1' }));
      expect(blockedA.status).toBe(429);

      // Different email from different IP should be permitted
      mockSignInWithPassword.mockResolvedValueOnce({
        data: {
          user: { id: 'user-b', email: 'userB@example.com' },
          session: { access_token: 'token-b' },
        },
        error: null,
      });

      const allowedB = await POST(createRequest({ email: 'userB@example.com', password: 'good' }, { 'x-forwarded-for': '198.51.100.2' }));
      expect(allowedB.status).toBe(200);
    });
  });

  describe('IP-Level Rate Limiting (Credential Stuffing Defense)', () => {
    it('returns status 429 when 10 login requests are made from the same IP', async () => {
      const ip = '203.0.113.99';

      // 10 requests from same IP with different emails
      for (let i = 0; i < 10; i++) {
        const req = createRequest(
          { email: `user_${i}@example.com`, password: 'password123' },
          { 'x-forwarded-for': ip }
        );
        const res = await POST(req);
        expect(res.status).toBe(200);
      }

      // 11th request from same IP must be rejected with 429
      const blockedReq = createRequest(
        { email: 'user_11@example.com', password: 'password123' },
        { 'x-forwarded-for': ip }
      );
      const blockedRes = await POST(blockedReq);

      expect(blockedRes.status).toBe(429);
      expect(blockedRes.headers.get('retry-after')).toBeDefined();

      const data = await blockedRes.json();
      expect(data.error).toBe('Rate limit exceeded');
      expect(data.message).toContain('Too many login attempts from this network');
    });
  });

  describe('Server Configuration & Edge Cases', () => {
    it('returns status 500 when Supabase environment variables are missing', async () => {
      const origUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.SUPABASE_URL;

      try {
        const req = createRequest(validPayload());
        const res = await POST(req);

        expect(res.status).toBe(500);
        const data = await res.json();
        expect(data.error).toBe('Server authentication configuration missing.');
      } finally {
        process.env.NEXT_PUBLIC_SUPABASE_URL = origUrl;
      }
    });

    it('returns status 500 when an unexpected exception is thrown', async () => {
      mockSignInWithPassword.mockImplementationOnce(() => {
        throw new Error('Database connection reset');
      });

      const req = createRequest(validPayload());
      const res = await POST(req);

      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toBe('Database connection reset');
    });
  });
});

