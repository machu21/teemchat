import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// 1. Hoist environment variables and mock functions
const { mockEmbedContent, mockGenerateContent } = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://pirpqkbdayorovfzczpq.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key-test-value';
  process.env.GEMINI_API_KEY = 'mock-gemini-api-key';
  process.env.GEMINI_MODEL = 'gemini-3.8-flash';

  return {
    mockEmbedContent: vi.fn(),
    mockGenerateContent: vi.fn(),
  };
});

// 2. Mock internal library aliases
vi.mock('@/lib/rateLimit', () => import('../../src/lib/rateLimit'));
vi.mock('@/lib/companionAuth', () => import('../../src/lib/companionAuth'));

// 3. Mock @google/genai
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      embedContent: mockEmbedContent,
      generateContent: mockGenerateContent,
    };
  },
}));

// 4. Mock @supabase/supabase-js
const mockGetUser = vi.fn();
const mockRpc = vi.fn();
const mockFromInsert = vi.fn().mockResolvedValue({ data: null, error: null });

const mockSupabase = {
  auth: {
    getUser: mockGetUser,
  },
  rpc: mockRpc,
  from: vi.fn(() => ({
    insert: mockFromInsert,
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
  })),
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabase),
}));

import { POST } from '../../src/app/api/companion/chat/route';
import { defaultRateLimiter } from '../../src/lib/rateLimit';

describe('POST /api/companion/chat', () => {
  const mockValidUser = {
    id: 'user-registered-123',
    email: 'adventurer@teemchat.com',
    is_anonymous: false,
    app_metadata: {},
    user_metadata: {},
  };

  const validPayload = () => ({
    userMessage: 'What should we explore next?',
    companion: {
      id: 'companion-uuid-1',
      name: 'Pixel Spark',
      persona: 'Playful tech buddy',
      companionType: 'robot',
      avatarStyle: 'bot_yellow',
      learnedContext: { hobby: 'fishing' },
    },
    userName: 'Alex',
    currentZone: 'Adventure Camp',
    recentHistory: [
      { role: 'user', content: 'Good morning!' },
      { role: 'assistant', content: 'Good morning Alex!' },
    ],
  });

  beforeEach(() => {
    vi.clearAllMocks();
    defaultRateLimiter.reset();

    // Default authenticated non-guest user
    mockGetUser.mockResolvedValue({
      data: { user: mockValidUser },
      error: null,
    });

    // Default quota allows messages
    mockRpc.mockImplementation((rpcName: string) => {
      if (rpcName === 'check_and_increment_ai_usage') {
        return Promise.resolve({ data: { allowed: true }, error: null });
      }
      if (rpcName === 'match_companion_memories') {
        return Promise.resolve({
          data: [{ memory_key: 'favorite_spot', memory_value: 'Crystal Bay dock' }],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    // Default Gemini AI mock returns
    mockEmbedContent.mockResolvedValue({
      embedding: { values: [0.05, 0.12, -0.34, 0.88] },
    });

    mockGenerateContent.mockResolvedValue({
      text: 'Adventure Camp has a secret cave path! Let us check it out together!',
    });
  });

  describe('Happy Path & AI Inference', () => {
    it('returns status 200 with generated AI companion response', async () => {
      const req = new NextRequest('http://localhost:3000/api/companion/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-jwt-token',
        },
        body: JSON.stringify(validPayload()),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toEqual({
        response: 'Adventure Camp has a secret cave path! Let us check it out together!',
      });

      // Verify Gemini was called with proper system instructions and conversation turns
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemini-3.8-flash',
          contents: expect.arrayContaining([
            { role: 'user', parts: [{ text: 'Good morning!' }] },
            { role: 'model', parts: [{ text: 'Good morning Alex!' }] },
            { role: 'user', parts: [{ text: 'What should we explore next?' }] },
          ]),
          config: expect.objectContaining({
            temperature: 0.85,
            maxOutputTokens: 1024,
            systemInstruction: expect.stringContaining("You are 'Pixel Spark'"),
          }),
        })
      );
    });

    it('injects RAG memories and learnedContext into system instructions', async () => {
      const req = new NextRequest('http://localhost:3000/api/companion/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-jwt-token',
        },
        body: JSON.stringify(validPayload()),
      });

      await POST(req);

      const generateCall = mockGenerateContent.mock.calls[0][0];
      const systemInstruction = generateCall.config.systemInstruction;

      // Assert RAG memory from match_companion_memories RPC is present
      expect(systemInstruction).toContain('favorite_spot: Crystal Bay dock');
      // Assert learnedContext is present
      expect(systemInstruction).toContain('hobby: fishing');
      // Assert owner and zone are present
      expect(systemInstruction).toContain('Owner: Alex');
      expect(systemInstruction).toContain('Current location: Adventure Camp');
    });

    it('falls back to default greeting prompt when no memories are matched', async () => {
      mockRpc.mockImplementation((rpcName: string) => {
        if (rpcName === 'check_and_increment_ai_usage') {
          return Promise.resolve({ data: { allowed: true }, error: null });
        }
        if (rpcName === 'match_companion_memories') {
          return Promise.resolve({ data: [], error: null });
        }
        return Promise.resolve({ data: null, error: null });
      });

      const payload = validPayload();
      delete (payload.companion as { learnedContext?: unknown }).learnedContext;

      const req = new NextRequest('http://localhost:3000/api/companion/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-jwt-token',
        },
        body: JSON.stringify(payload),
      });

      await POST(req);

      const generateCall = mockGenerateContent.mock.calls[0][0];
      expect(generateCall.config.systemInstruction).toContain('This is a new friendship. Be curious and attentive!');
    });
  });

  describe('Quota Enforcement', () => {
    it('returns status 200 with quotaExceeded: true when standard energy is exhausted', async () => {
      mockRpc.mockImplementation((rpcName: string) => {
        if (rpcName === 'check_and_increment_ai_usage') {
          return Promise.resolve({ data: { allowed: false, is_trial: false }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      });

      const req = new NextRequest('http://localhost:3000/api/companion/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-jwt-token',
        },
        body: JSON.stringify(validPayload()),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.quotaExceeded).toBe(true);
      expect(data.response).toContain("daily energy limit (50/50 messages)");
      // Gemini generation should not be called when quota exceeded
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('returns status 200 with quotaExceeded: true when trial account limit is exhausted', async () => {
      mockRpc.mockImplementation((rpcName: string) => {
        if (rpcName === 'check_and_increment_ai_usage') {
          return Promise.resolve({ data: { allowed: false, is_trial: true }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      });

      const req = new NextRequest('http://localhost:3000/api/companion/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-jwt-token',
        },
        body: JSON.stringify(validPayload()),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.quotaExceeded).toBe(true);
      expect(data.response).toContain("free daily trial limit (5/5 messages)");
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });
  });

  describe('Input Validation (Status 400)', () => {
    it('returns status 400 when userMessage is missing', async () => {
      const payload = validPayload();
      // @ts-expect-error deleting required property
      delete payload.userMessage;

      const req = new NextRequest('http://localhost:3000/api/companion/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-jwt-token',
        },
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data).toEqual({ error: 'Missing userMessage' });
    });

    it('returns status 400 when userMessage is empty string', async () => {
      const payload = { ...validPayload(), userMessage: '' };

      const req = new NextRequest('http://localhost:3000/api/companion/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-jwt-token',
        },
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data).toEqual({ error: 'Missing userMessage' });
    });
  });

  describe('Authentication & Authorization Gates (Status 401 & 403)', () => {
    it('returns status 401 when Authorization header is missing', async () => {
      const req = new NextRequest('http://localhost:3000/api/companion/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validPayload()),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);

      const data = await res.json();
      expect(data).toEqual({ error: 'Unauthorized' });
    });

    it('returns status 401 when JWT token is invalid or expired', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'jwt expired' },
      });

      const req = new NextRequest('http://localhost:3000/api/companion/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer expired-or-invalid-jwt',
        },
        body: JSON.stringify(validPayload()),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);

      const data = await res.json();
      expect(data).toEqual({ error: 'Invalid user token' });
    });

    it.each([
      ['is_anonymous: true', { ...mockValidUser, is_anonymous: true }],
      ['app_metadata.is_guest: true', { ...mockValidUser, app_metadata: { is_guest: true } }],
      ['user_metadata.is_guest: true', { ...mockValidUser, user_metadata: { is_guest: true } }],
      ['guest email domain', { ...mockValidUser, email: 'guest_9b2a@guest.teemchat.local' }],
    ])('returns status 403 Forbidden when caller is a guest account (%s)', async (_, guestUser) => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: guestUser },
        error: null,
      });

      const req = new NextRequest('http://localhost:3000/api/companion/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer guest-user-jwt',
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
    it('returns status 429 when user exceeds 15 companion chat messages per minute', async () => {
      const userHeaders = {
        'Content-Type': 'application/json',
        Authorization: 'Bearer high-velocity-user-token',
      };

      // Send 15 messages (the maximum allowed by RATE_LIMITS.USER_AI_CHAT)
      for (let i = 0; i < 15; i++) {
        const req = new NextRequest('http://localhost:3000/api/companion/chat', {
          method: 'POST',
          headers: userHeaders,
          body: JSON.stringify(validPayload()),
        });
        const res = await POST(req);
        expect(res.status).toBe(200);
      }

      // 16th message triggers user rate limit
      const blockedReq = new NextRequest('http://localhost:3000/api/companion/chat', {
        method: 'POST',
        headers: userHeaders,
        body: JSON.stringify(validPayload()),
      });

      const blockedRes = await POST(blockedReq);
      expect(blockedRes.status).toBe(429);

      const blockedData = await blockedRes.json();
      expect(blockedData.error).toBe('Rate limit exceeded');
      expect(blockedData.message).toContain('You are sending messages too quickly');
      expect(blockedData.retryAfter).toBeDefined();
      expect(blockedRes.headers.get('retry-after')).toBeDefined();
    });

    it('returns status 500 when Gemini API throws an unexpected error', async () => {
      mockGenerateContent.mockRejectedValueOnce(new Error('Resource has been exhausted (e.g. check quota)'));

      const req = new NextRequest('http://localhost:3000/api/companion/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-jwt-token',
        },
        body: JSON.stringify(validPayload()),
      });

      const res = await POST(req);
      expect(res.status).toBe(500);

      const data = await res.json();
      expect(data.error).toContain('Resource has been exhausted');
    });

    it('returns status 500 when request body contains unparseable JSON', async () => {
      const req = new NextRequest('http://localhost:3000/api/companion/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-jwt-token',
        },
        body: '{ broken json stream',
      });

      const res = await POST(req);
      expect(res.status).toBe(500);

      const data = await res.json();
      expect(data.error).toBeDefined();
    });
  });
});
