import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// 1. Hoist environment variables and internal library aliases before route import
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://pirpqkbdayorovfzczpq.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key-test-value';
});

vi.mock('@/lib/rateLimit', () => import('../../src/lib/rateLimit'));
vi.mock('@/lib/security/disposableEmails', () => import('../../src/lib/security/disposableEmails'));

// 3. Mock @supabase/supabase-js
const mockSignUp = vi.fn();
const mockUpsert = vi.fn().mockResolvedValue({ data: null, error: null });
const mockUsernameLookup = vi.fn().mockResolvedValue({ data: null, error: null });
const mockProfileEq = vi.fn(() => ({ maybeSingle: mockUsernameLookup }));

const mockSupabaseClient = {
  auth: {
    signUp: mockSignUp,
  },
  from: vi.fn((table: string) => {
    if (table === 'profiles') {
      return { upsert: mockUpsert, select: vi.fn(() => ({ eq: mockProfileEq })) };
    }
    return {
      select: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
  }),
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseClient),
}));

import { POST } from '../../src/app/api/auth/register/route';
import { defaultRateLimiter } from '../../src/lib/rateLimit';

describe('POST /api/auth/register', () => {
  const validBasePayload = () => ({
    email: 'newplayer@example.com',
    password: 'password123',
    username: 'pixel_adventurer',
    displayName: 'Pixel Adventurer',
    gender: 'female',
    renderedAt: Date.now() - 3000, // 3 seconds ago
  });

  beforeEach(() => {
    vi.clearAllMocks();
    defaultRateLimiter.reset();

    mockSignUp.mockResolvedValue({
      data: {
        user: { id: 'usr-12345', email: 'newplayer@example.com' },
        session: { access_token: 'fake-jwt-token', refresh_token: 'fake-refresh-token' },
      },
      error: null,
    });
    mockUpsert.mockResolvedValue({ data: null, error: null });
    mockUsernameLookup.mockResolvedValue({ data: null, error: null });
  });

  describe('Happy Path & Normalization', () => {
    it('registers user and returns status 200 with user and session payload', async () => {
      const payload = validBasePayload();
      const req = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '198.51.100.11',
        },
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.user).toEqual({ id: 'usr-12345', email: 'newplayer@example.com' });
      expect(data.session).toEqual({ access_token: 'fake-jwt-token', refresh_token: 'fake-refresh-token' });

      // Verify Supabase Auth sign-up called with normalized parameters
      expect(mockSignUp).toHaveBeenCalledWith({
        email: 'newplayer@example.com',
        password: 'password123',
        options: {
          data: {
            username: 'pixel_adventurer',
            display_name: 'Pixel Adventurer',
            gender: 'female',
            country_code: 'XX',
          },
        },
      });

      // Verify profile provisioning
      expect(mockUpsert).toHaveBeenCalledWith({
        id: 'usr-12345',
        username: 'pixel_adventurer',
        display_name: 'Pixel Adventurer',
        gender: 'female',
        country_code: 'XX',
        status: 'available',
        tier: 'free',
        is_paid: false,
        has_ai_companion: false,
      });

      // Verify rate limit headers
      expect(res.headers.get('x-ratelimit-limit')).toBe('5');
      expect(res.headers.get('x-ratelimit-remaining')).toBeDefined();
    });

    it('defaults optional fields: gender to male and displayName to username', async () => {
      const payload = {
        email: 'default_fields@example.com',
        password: 'securePassword!',
        username: 'default_guy',
        renderedAt: Date.now() - 2000,
      };

      const req = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '198.51.100.12',
        },
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      expect(mockSignUp).toHaveBeenCalledWith(
        expect.objectContaining({
          options: {
            data: {
              username: 'default_guy',
              display_name: 'default_guy',
              gender: 'male',
              country_code: 'XX',
            },
          },
        })
      );
    });

    it('truncates displayName to 32 characters maximum', async () => {
      const longName = 'A'.repeat(50);
      const payload = {
        ...validBasePayload(),
        displayName: longName,
      };

      const req = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '198.51.100.13',
        },
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      expect(mockSignUp).toHaveBeenCalledWith(
        expect.objectContaining({
          options: {
            data: expect.objectContaining({
              display_name: 'A'.repeat(32),
            }),
          },
        })
      );
    });

    it('normalizes plus-addressing email before registering', async () => {
      const payload = {
        ...validBasePayload(),
        email: 'alice+testalias@gmail.com',
      };

      const req = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '198.51.100.14',
        },
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      expect(mockSignUp).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'alice@gmail.com',
        })
      );
    });

    it('continues successfully even if initial profile upsert warning occurs', async () => {
      mockUpsert.mockRejectedValueOnce(new Error('Database profile constraint warning'));

      const req = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '198.51.100.15',
        },
        body: JSON.stringify(validBasePayload()),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('extracts and records country code from Cloudflare cf-ipcountry header', async () => {
      const payload = {
        ...validBasePayload(),
        username: 'country_tester',
      };

      const req = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'cf-ipcountry': 'PH',
        },
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'country_tester',
          country_code: 'PH',
        })
      );
    });
  });

  describe('Anti-Bot Security Traps (Honeypot & Velocity)', () => {
    it('rejects bot with status 400 when website_url honeypot is filled', async () => {
      const payload = {
        ...validBasePayload(),
        website_url: 'https://spambot-attack.xyz',
      };

      const req = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data).toEqual({
        error: 'Security validation failed. Please reload and try again.',
      });
      expect(mockSignUp).not.toHaveBeenCalled();
    });

    it('rejects bot with status 400 when company_site_field honeypot is filled', async () => {
      const payload = {
        ...validBasePayload(),
        company_site_field: 'Initech Corp',
      };

      const req = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toBe('Security validation failed. Please reload and try again.');
      expect(mockSignUp).not.toHaveBeenCalled();
    });

    it('rejects bot with status 400 when phone_alt honeypot is filled', async () => {
      const payload = {
        ...validBasePayload(),
        phone_alt: '+15551234567',
      };

      const req = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Security validation failed. Please reload and try again.');
    });

    it('rejects submission with status 400 when renderedAt is missing', async () => {
      const payload = validBasePayload();
      // @ts-expect-error deleting required property
      delete payload.renderedAt;

      const req = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Form security timestamp is missing.');
    });

    it('rejects submission with status 400 when renderedAt is non-numeric', async () => {
      const payload = {
        ...validBasePayload(),
        renderedAt: 'not-a-timestamp',
      };

      const req = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Form security timestamp is missing.');
    });

    it('rejects sub-second automated submission with status 400 (too fast)', async () => {
      const payload = {
        ...validBasePayload(),
        renderedAt: Date.now() - 400, // only 400ms elapsed (< 1200ms)
      };

      const req = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Form submission was too fast. Please take your time.');
    });

    it('rejects submission with timestamp far in the future (>5000ms ahead)', async () => {
      const payload = {
        ...validBasePayload(),
        renderedAt: Date.now() + 15000,
      };

      const req = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      // Because now - renderedAt is negative, it matches (elapsed < minDurationMs) first
      expect(data.error).toBe('Form submission was too fast. Please take your time.');
    });
  });

  describe('Email & Disposable Domain Validation', () => {
    it('rejects missing or empty email with status 400', async () => {
      const payload = { ...validBasePayload(), email: '' };
      const req = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('A valid email address is required.');
    });

    it('rejects non-string email with status 400', async () => {
      const payload = { ...validBasePayload(), email: 12345 };
      const req = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('A valid email address is required.');
    });

    it.each([
      ['mailinator.com', 'user@mailinator.com'],
      ['10minutemail.com', 'test@10minutemail.com'],
      ['guerrillamail.com', 'anon@guerrillamail.com'],
      ['tempmail.com', 'tester@tempmail.com'],
      ['trashmail.com', 'garbage@trashmail.com'],
    ])('rejects disposable email provider %s with status 400', async (_, email) => {
      const payload = { ...validBasePayload(), email };
      const req = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe(
        'Disposable and temporary email addresses are not permitted. Please use a permanent email address.'
      );
      expect(mockSignUp).not.toHaveBeenCalled();
    });
  });

  describe('Username & Password Validation', () => {
    it('rejects missing username with status 400', async () => {
      const payload = { ...validBasePayload(), username: '' };
      const req = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Username is required.');
    });

    it('rejects username shorter than 3 characters with status 400', async () => {
      const payload = { ...validBasePayload(), username: 'ab' };
      const req = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Username must be at least 3 characters long.');
    });

    it('rejects username longer than 24 characters with status 400', async () => {
      const payload = { ...validBasePayload(), username: 'a'.repeat(25) };
      const req = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Username cannot exceed 24 characters.');
    });

    it.each([
      ['spaces', 'user name'],
      ['at-symbol', 'user@domain'],
      ['script tag', '<script>'],
      ['punctuation', 'user!name'],
      ['emoji', 'user🚀'],
    ])('rejects invalid username characters (%s) with status 400', async (_, username) => {
      const payload = { ...validBasePayload(), username };
      const req = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Username may only contain letters, numbers, hyphens, and underscores.');
    });

    it('rejects password shorter than 6 characters with status 400', async () => {
      const payload = { ...validBasePayload(), password: '12345' };
      const req = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Password must be at least 6 characters long.');
    });

    it('rejects non-string password with status 400', async () => {
      const payload = { ...validBasePayload(), password: 123456 };
      const req = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Password must be at least 6 characters long.');
    });
  });

  describe('Duplicate Email & Username', () => {
    const makeReq = () =>
      new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validBasePayload()),
      });
    const EMAIL_TAKEN = 'An account with this email already exists. Try logging in instead.';

    it('returns 409 email_taken when Supabase reports user_already_exists (confirmation off)', async () => {
      mockSignUp.mockResolvedValueOnce({
        data: { user: null, session: null },
        error: { message: 'User already registered', code: 'user_already_exists' },
      });

      const res = await POST(makeReq());
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data).toEqual({ error: EMAIL_TAKEN, code: 'email_taken' });
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it('returns 409 email_taken for legacy "User already registered" message without a code', async () => {
      mockSignUp.mockResolvedValueOnce({
        data: { user: null, session: null },
        error: { message: 'User already registered' },
      });

      const res = await POST(makeReq());
      expect(res.status).toBe(409);
      expect((await res.json()).code).toBe('email_taken');
    });

    it('returns 409 email_taken for the obfuscated user with no identities (confirmation on)', async () => {
      mockSignUp.mockResolvedValueOnce({
        data: { user: { id: 'fake-obfuscated-id', email: 'newplayer@example.com', identities: [] }, session: null },
        error: null,
      });

      const res = await POST(makeReq());
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data).toEqual({ error: EMAIL_TAKEN, code: 'email_taken' });
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it('still succeeds for a new user with identities and no session (confirmation pending)', async () => {
      mockSignUp.mockResolvedValueOnce({
        data: { user: { id: 'usr-new', identities: [{ id: 'ident-1' }] }, session: null },
        error: null,
      });

      const res = await POST(makeReq());
      expect(res.status).toBe(200);
      expect((await res.json()).success).toBe(true);
    });

    it('returns 409 username_taken before calling signUp when the username exists', async () => {
      mockUsernameLookup.mockResolvedValueOnce({ data: { id: 'existing-user' }, error: null });

      const res = await POST(makeReq());
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data).toEqual({
        error: 'That username is already taken. Please choose another.',
        code: 'username_taken',
      });
      expect(mockProfileEq).toHaveBeenCalledWith('username', 'pixel_adventurer');
      expect(mockSignUp).not.toHaveBeenCalled();
    });

    it('does not block sign-up when the username lookup itself errors', async () => {
      mockUsernameLookup.mockResolvedValueOnce({ data: null, error: { message: 'lookup failed' } });

      const res = await POST(makeReq());
      expect(res.status).toBe(200);
      expect(mockSignUp).toHaveBeenCalled();
    });
  });

  describe('Supabase Auth Integration Failures', () => {
    it('returns status 400 with provider error message for other auth errors', async () => {
      mockSignUp.mockResolvedValueOnce({
        data: { user: null, session: null },
        error: { message: 'Password should contain at least one character of each kind' },
      });

      const req = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validBasePayload()),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Password should contain at least one character of each kind');
    });

    it('returns status 400 when Supabase returns no user and no error message', async () => {
      mockSignUp.mockResolvedValueOnce({
        data: { user: null, session: null },
        error: null,
      });

      const req = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validBasePayload()),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Failed to create user account.');
    });
  });

  describe('Rate Limiting & Server Errors', () => {
    it('returns status 429 when client IP exceeds 5 signup attempts within 15 minutes', async () => {
      const ip = '198.51.100.99';

      // First 5 attempts from this IP
      for (let i = 0; i < 5; i++) {
        const req = new NextRequest('http://localhost:3000/api/auth/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-forwarded-for': ip,
          },
          body: JSON.stringify({
            ...validBasePayload(),
            username: `attempt_${i}`,
            email: `attempt_${i}@example.com`,
          }),
        });
        const res = await POST(req);
        expect(res.status).toBe(200);
      }

      // 6th attempt should be blocked by IP rate limiter
      const blockedReq = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': ip,
        },
        body: JSON.stringify({
          ...validBasePayload(),
          username: 'attempt_blocked',
          email: 'attempt_blocked@example.com',
        }),
      });

      const blockedRes = await POST(blockedReq);
      expect(blockedRes.status).toBe(429);

      const blockedData = await blockedRes.json();
      expect(blockedData.error).toBe('Rate limit exceeded');
      expect(blockedData.message).toContain('Too many registration attempts from this network');
      expect(typeof blockedData.retryAfter).toBe('number');
      expect(blockedRes.headers.get('retry-after')).toBeDefined();
    });

    it('returns status 400 for empty or unparseable JSON body', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid-json-string',
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      // Form security timestamp is missing because body fell back to {}
      expect(data.error).toBe('Form security timestamp is missing.');
    });

    it('returns status 500 when Supabase environment variables are missing', async () => {
      const origUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const origKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      try {
        delete process.env.NEXT_PUBLIC_SUPABASE_URL;
        delete process.env.SUPABASE_URL;
        delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        delete process.env.SUPABASE_ANON_KEY;
        vi.resetModules();

        const { POST: unconfiguredPOST } = await import('../../src/app/api/auth/register/route');

        const req = new NextRequest('http://localhost:3000/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validBasePayload()),
        });

        const res = await unconfiguredPOST(req);
        expect(res.status).toBe(500);
        const data = await res.json();
        expect(data.error).toBe('Server authentication configuration missing.');
      } finally {
        process.env.NEXT_PUBLIC_SUPABASE_URL = origUrl;
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = origKey;
        vi.resetModules();
      }
    });

    it('handles unexpected runtime exceptions with status 500', async () => {
      mockSignUp.mockImplementationOnce(() => {
        throw new Error('Fatal socket network timeout');
      });

      const req = new NextRequest('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validBasePayload()),
      });

      const res = await POST(req);
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toBe('Fatal socket network timeout');
    });
  });
});
