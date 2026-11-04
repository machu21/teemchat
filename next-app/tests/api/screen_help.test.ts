import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// 1. Hoist environment variables and mock functions
const { mockGenerateContent } = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://pirpqkbdayorovfzczpq.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key-test-value';
  process.env.GEMINI_API_KEY = 'mock-gemini-api-key';
  process.env.GEMINI_MODEL = 'gemini-3.8-flash';

  return {
    mockGenerateContent: vi.fn(),
  };
});

// 2. Mock internal library aliases
vi.mock('@/lib/rateLimit', () => import('../../src/lib/rateLimit'));
vi.mock('@/lib/companionAuth', () => import('../../src/lib/companionAuth'));
vi.mock('@/lib/utils/screenshot', () => import('../../src/lib/utils/screenshot'));

// 3. Mock @google/genai
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      generateContent: mockGenerateContent,
    };
  },
}));

// 4. Mock @supabase/supabase-js
const mockGetUser = vi.fn();
const mockRpc = vi.fn();

const mockSupabase = {
  auth: {
    getUser: mockGetUser,
  },
  rpc: mockRpc,
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabase),
}));

import { POST } from '../../src/app/api/companion/screen-help/route';
import { defaultRateLimiter } from '../../src/lib/rateLimit';

describe('POST /api/companion/screen-help', () => {
  const mockValidUser = {
    id: 'user-screen-help-101',
    email: 'screenhelpplayer@teemchat.com',
    is_anonymous: false,
    app_metadata: {},
    user_metadata: {},
  };

  const VALID_PNG_DATA_URL =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  const VALID_JPEG_DATA_URL =
    'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

  const validPayload = () => ({
    userMessage: 'How do I enable spatial audio in settings?',
    screenshot: VALID_PNG_DATA_URL,
    companionName: 'Pixel Techie',
    userName: 'Morgan',
    platform: 'Windows',
    recentHistory: [
      { role: 'user', content: 'Can you see my screen?' },
      { role: 'assistant', content: 'Yes, I can see your screen now!' },
    ],
  });

  beforeEach(() => {
    vi.clearAllMocks();
    defaultRateLimiter.reset();

    mockGetUser.mockResolvedValue({
      data: { user: mockValidUser },
      error: null,
    });

    mockRpc.mockImplementation((rpcName: string) => {
      if (rpcName === 'check_and_increment_ai_usage') {
        return Promise.resolve({ data: { allowed: true }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    mockGenerateContent.mockResolvedValue({
      text: 'Click on the "Audio & Voice" tab on the left navigation bar.',
    });
  });

  describe('Happy Path & Multimodal Guidance', () => {
    it('returns status 200 with step-by-step guidance for valid PNG screenshot', async () => {
      const req = new NextRequest('http://localhost:3000/api/companion/screen-help', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-user-token',
        },
        body: JSON.stringify(validPayload()),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toEqual({
        response: 'Click on the "Audio & Voice" tab on the left navigation bar.',
      });

      // Verify Gemini multimodal call structure
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemini-3.8-flash',
          contents: expect.arrayContaining([
            { role: 'user', parts: [{ text: 'Can you see my screen?' }] },
            { role: 'model', parts: [{ text: 'Yes, I can see your screen now!' }] },
            {
              role: 'user',
              parts: [
                { text: 'How do I enable spatial audio in settings?' },
                {
                  inlineData: {
                    mimeType: 'image/png',
                    data: expect.any(String),
                  },
                },
              ],
            },
          ]),
          config: expect.objectContaining({
            temperature: 0.4,
            maxOutputTokens: 4096,
            systemInstruction: expect.stringContaining("You are 'Pixel Techie'"),
          }),
        })
      );
    });

    it('returns status 200 for valid JPEG screenshot', async () => {
      const payload = {
        ...validPayload(),
        screenshot: VALID_JPEG_DATA_URL,
      };

      const req = new NextRequest('http://localhost:3000/api/companion/screen-help', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-user-token',
        },
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const generateCall = mockGenerateContent.mock.calls[0][0];
      const userPart = generateCall.contents[generateCall.contents.length - 1].parts[1];
      expect(userPart.inlineData.mimeType).toBe('image/jpeg');
    });

    it('normalizes platform operating system in system instructions', async () => {
      const platforms = ['Windows', 'macOS', 'Linux', 'ChromeOS', 'Unknown'] as const;

      for (const os of platforms) {
        mockGenerateContent.mockClear();
        const payload = { ...validPayload(), platform: os };

        const req = new NextRequest('http://localhost:3000/api/companion/screen-help', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer valid-user-token',
          },
          body: JSON.stringify(payload),
        });

        const res = await POST(req);
        expect(res.status).toBe(200);

        const generateCall = mockGenerateContent.mock.calls[0][0];
        expect(generateCall.config.systemInstruction).toContain(`operating system is probably: ${os}`);
      }
    });

    it('falls back to "Unknown" for unlisted or invalid platform strings', async () => {
      const payload = { ...validPayload(), platform: 'FreeBSD-Solaris' };

      const req = new NextRequest('http://localhost:3000/api/companion/screen-help', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-user-token',
        },
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const generateCall = mockGenerateContent.mock.calls[0][0];
      expect(generateCall.config.systemInstruction).toContain('operating system is probably: Unknown');
    });
  });

  describe('Daily Quota Exhaustion', () => {
    it('returns status 200 with quotaExceeded: true for trial accounts', async () => {
      mockRpc.mockImplementation((rpcName: string) => {
        if (rpcName === 'check_and_increment_ai_usage') {
          return Promise.resolve({ data: { allowed: false, is_trial: true }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      });

      const req = new NextRequest('http://localhost:3000/api/companion/screen-help', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-user-token',
        },
        body: JSON.stringify(validPayload()),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.quotaExceeded).toBe(true);
      expect(data.response).toContain("free daily trial limit");
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('returns status 200 with quotaExceeded: true for standard accounts', async () => {
      mockRpc.mockImplementation((rpcName: string) => {
        if (rpcName === 'check_and_increment_ai_usage') {
          return Promise.resolve({ data: { allowed: false, is_trial: false }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      });

      const req = new NextRequest('http://localhost:3000/api/companion/screen-help', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-user-token',
        },
        body: JSON.stringify(validPayload()),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.quotaExceeded).toBe(true);
      expect(data.response).toContain("daily energy limit (50/50 messages)");
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });
  });

  describe('Payload & Screenshot Validation Errors (Status 400)', () => {
    it('rejects non-object request body with status 400', async () => {
      const req = new NextRequest('http://localhost:3000/api/companion/screen-help', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-user-token',
        },
        body: '"plain-string-body"',
      });

      const res = await POST(req);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data).toEqual({ error: 'Invalid request body' });
    });

    it('rejects missing userMessage with status 400', async () => {
      const payload = validPayload();
      // @ts-expect-error deleting required property
      delete payload.userMessage;

      const req = new NextRequest('http://localhost:3000/api/companion/screen-help', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-user-token',
        },
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data).toEqual({ error: 'Missing userMessage' });
    });

    it('rejects userMessage exceeding 2000 characters with status 400', async () => {
      const payload = {
        ...validPayload(),
        userMessage: 'X'.repeat(2001),
      };

      const req = new NextRequest('http://localhost:3000/api/companion/screen-help', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-user-token',
        },
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data).toEqual({ error: 'Message is too long' });
    });

    it('rejects missing screenshot with status 400', async () => {
      const payload = validPayload();
      // @ts-expect-error deleting required property
      delete payload.screenshot;

      const req = new NextRequest('http://localhost:3000/api/companion/screen-help', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-user-token',
        },
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data).toEqual({ error: 'Missing screenshot' });
    });

    it('rejects screenshot that is not a valid data URL with status 400', async () => {
      const payload = {
        ...validPayload(),
        screenshot: 'https://example.com/screenshot.png',
      };

      const req = new NextRequest('http://localhost:3000/api/companion/screen-help', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-user-token',
        },
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data).toEqual({ error: 'Screenshot must be a base64 image data URL' });
    });

    it.each([
      ['image/gif', 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'],
      ['image/webp', 'data:image/webp;base64,UklGRkAAAABXRUJQVlA4WAoAAAAQAAAAAAAAAAAAQUxQSAIAAAAA'],
    ])('rejects unsupported image format %s with status 400', async (_, dataUrl) => {
      const payload = {
        ...validPayload(),
        screenshot: dataUrl,
      };

      const req = new NextRequest('http://localhost:3000/api/companion/screen-help', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-user-token',
        },
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data).toEqual({ error: 'Screenshot must be a JPEG or PNG image' });
    });

    it('rejects image/svg+xml data URL failing regex pattern with status 400', async () => {
      const payload = {
        ...validPayload(),
        screenshot: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==',
      };

      const req = new NextRequest('http://localhost:3000/api/companion/screen-help', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-user-token',
        },
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data).toEqual({ error: 'Screenshot must be a base64 image data URL' });
    });

    it('rejects screenshot exceeding 2,000,000 base64 characters with status 400', async () => {
      const hugeBase64 = 'A'.repeat(2_000_001);
      const payload = {
        ...validPayload(),
        screenshot: `data:image/png;base64,${hugeBase64}`,
      };

      const req = new NextRequest('http://localhost:3000/api/companion/screen-help', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-user-token',
        },
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data).toEqual({ error: 'Screenshot is too large' });
    });
  });

  describe('Authentication & Authorization Gates (Status 401 & 403)', () => {
    it('returns status 401 when Authorization header is missing', async () => {
      const req = new NextRequest('http://localhost:3000/api/companion/screen-help', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validPayload()),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data).toEqual({ error: 'Unauthorized' });
    });

    it('returns status 401 when token is invalid', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'Invalid JWT signature' },
      });

      const req = new NextRequest('http://localhost:3000/api/companion/screen-help', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer invalid-token',
        },
        body: JSON.stringify(validPayload()),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data).toEqual({ error: 'Invalid user token' });
    });

    it('returns status 403 when user is a guest account', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { ...mockValidUser, is_anonymous: true } },
        error: null,
      });

      const req = new NextRequest('http://localhost:3000/api/companion/screen-help', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer guest-user-token',
        },
        body: JSON.stringify(validPayload()),
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data).toEqual({
        error: 'Forbidden',
        message: 'Sign in with an account to chat with your companion.',
      });
    });
  });

  describe('Rate Limiting & Server Errors', () => {
    it('returns status 429 when user exceeds 6 screen-help requests per minute', async () => {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: 'Bearer screen-help-rate-limit-user',
      };

      // 6 allowed requests (RATE_LIMITS.USER_AI_SCREEN_HELP)
      for (let i = 0; i < 6; i++) {
        const req = new NextRequest('http://localhost:3000/api/companion/screen-help', {
          method: 'POST',
          headers,
          body: JSON.stringify(validPayload()),
        });
        const res = await POST(req);
        expect(res.status).toBe(200);
      }

      // 7th request blocked
      const blockedReq = new NextRequest('http://localhost:3000/api/companion/screen-help', {
        method: 'POST',
        headers,
        body: JSON.stringify(validPayload()),
      });

      const blockedRes = await POST(blockedReq);
      expect(blockedRes.status).toBe(429);

      const blockedData = await blockedRes.json();
      expect(blockedData.error).toBe('Rate limit exceeded');
      expect(blockedRes.headers.get('retry-after')).toBeDefined();
    });

    it('returns status 500 when Gemini model throws an exception', async () => {
      mockGenerateContent.mockRejectedValueOnce(new Error('Gemini vision model internal crash'));

      const req = new NextRequest('http://localhost:3000/api/companion/screen-help', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-user-token',
        },
        body: JSON.stringify(validPayload()),
      });

      const res = await POST(req);
      expect(res.status).toBe(500);

      const data = await res.json();
      expect(data).toEqual({ error: 'Screen help is unavailable right now.' });
    });
  });
});
