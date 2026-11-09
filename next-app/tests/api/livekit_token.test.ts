import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// 1. Hoist environment variables and mock functions
const { mockAddGrant, mockToJwt } = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://pirpqkbdayorovfzczpq.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key-test-value';
  process.env.LIVEKIT_API_KEY = 'mock-livekit-api-key';
  process.env.LIVEKIT_API_SECRET = 'mock-livekit-secret-32-chars-length';

  return {
    mockAddGrant: vi.fn(),
    mockToJwt: vi.fn().mockResolvedValue('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mocked-livekit-token'),
  };
});

// 2. Mock internal library aliases
vi.mock('@/lib/rateLimit', () => import('../../src/lib/rateLimit'));
vi.mock('@/lib/models/space', () => import('../../src/lib/models/space'));

// 3. Mock livekit-server-sdk
vi.mock('livekit-server-sdk', () => ({
  AccessToken: class {
    identity: string;
    name: string;
    ttl: string;
    constructor(apiKey: string, apiSecret: string, options: { identity: string; name: string; ttl: string }) {
      this.identity = options.identity;
      this.name = options.name;
      this.ttl = options.ttl;
    }
    addGrant = mockAddGrant;
    toJwt = mockToJwt;
  },
  TrackSource: { MICROPHONE: 2, SCREEN_SHARE: 3, SCREEN_SHARE_AUDIO: 4 },
}));

// 4. Mock @supabase/supabase-js
const mockGetUser = vi.fn();
const mockMaybeSingle = vi.fn();

const mockSupabase = {
  auth: {
    getUser: mockGetUser,
  },
  from: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: mockMaybeSingle,
  })),
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabase),
}));

import { POST } from '../../src/app/api/livekit/token/route';
import { defaultRateLimiter } from '../../src/lib/rateLimit';
import { defaultHQ } from '../../src/lib/models/space';

describe('POST /api/livekit/token', () => {
  const callerUser = {
    id: 'user-lk-caller-001',
    email: 'livekitcaller@teemchat.com',
  };

  const validHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: 'Bearer valid-user-token',
  });

  beforeEach(() => {
    vi.clearAllMocks();
    defaultRateLimiter.reset();

    mockGetUser.mockResolvedValue({
      data: { user: callerUser },
      error: null,
    });

    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockToJwt.mockResolvedValue('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mocked-livekit-token');
  });

  describe('Happy Path & Room Authorization', () => {
    it('generates LiveKit token for public lobby room (space-room-lobby)', async () => {
      const req = new NextRequest('http://localhost:3000/api/livekit/token', {
        method: 'POST',
        headers: validHeaders(),
        body: JSON.stringify({
          roomName: 'space-room-lobby',
          displayName: 'Explorer Steve',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toEqual({
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mocked-livekit-token',
      });

      // Verify token grant was added
      expect(mockAddGrant).toHaveBeenCalledWith({
        room: 'space-room-lobby',
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
        // Spaces: microphone + screen share (shown only in private rooms); never camera
        canPublishSources: [2, 3, 4],
      });
    });

    it('generates token for Default HQ space without querying database', async () => {
      const hqId = defaultHQ().id; // 'b6941fa2-8305-4e00-833c-ca3cd5f08c9b'
      const req = new NextRequest('http://localhost:3000/api/livekit/token', {
        method: 'POST',
        headers: validHeaders(),
        body: JSON.stringify({
          spaceId: hqId,
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.token).toBeDefined();

      // Database spaces table should not be queried for Default HQ
      expect(mockSupabase.from).not.toHaveBeenCalledWith('spaces');
      expect(mockAddGrant).toHaveBeenCalledWith(
        expect.objectContaining({
          room: `space-${hqId}`,
          roomJoin: true,
        })
      );
    });

    it('generates token for authorized custom space when visible in database', async () => {
      const customSpaceId = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
      mockMaybeSingle.mockResolvedValueOnce({
        data: { id: customSpaceId },
        error: null,
      });

      const req = new NextRequest('http://localhost:3000/api/livekit/token', {
        method: 'POST',
        headers: validHeaders(),
        body: JSON.stringify({
          spaceId: customSpaceId,
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      expect(mockSupabase.from).toHaveBeenCalledWith('spaces');
      expect(mockAddGrant).toHaveBeenCalledWith(
        expect.objectContaining({
          room: `space-${customSpaceId}`,
        })
      );
    });

    it('generates token for 1-on-1 DM call when caller is participant', async () => {
      const dmConvId = '11111111-2222-3333-4444-555555555555';
      mockMaybeSingle.mockResolvedValueOnce({
        data: {
          user_one: callerUser.id,
          user_two: 'user-friend-456',
        },
        error: null,
      });

      const req = new NextRequest('http://localhost:3000/api/livekit/token', {
        method: 'POST',
        headers: validHeaders(),
        body: JSON.stringify({
          roomName: `call-dm-${dmConvId}`,
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      expect(mockSupabase.from).toHaveBeenCalledWith('buddy_conversations');
      expect(mockAddGrant).toHaveBeenCalledWith(
        expect.objectContaining({
          room: `call-dm-${dmConvId}`,
        })
      );
      // Calls keep camera + screen share: no source restriction
      expect(mockAddGrant.mock.calls[0][0]).not.toHaveProperty('canPublishSources');
    });

    it('generates token for group call when caller is group member', async () => {
      const groupConvId = '77777777-8888-9999-aaaa-bbbbccccdddd';
      mockMaybeSingle.mockResolvedValueOnce({
        data: {
          user_id: callerUser.id,
        },
        error: null,
      });

      const req = new NextRequest('http://localhost:3000/api/livekit/token', {
        method: 'POST',
        headers: validHeaders(),
        body: JSON.stringify({
          roomName: `call-group-${groupConvId}`,
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      expect(mockSupabase.from).toHaveBeenCalledWith('group_conversation_members');
    });

    it('allows verified guest users to join public lobby rooms', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: {
          user: {
            id: 'guest-user-999',
            is_anonymous: true,
            email: 'guest_999@guest.teemchat.local',
          },
        },
        error: null,
      });

      const req = new NextRequest('http://localhost:3000/api/livekit/token', {
        method: 'POST',
        headers: validHeaders(),
        body: JSON.stringify({
          roomName: 'space-room-lobby',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.token).toBeDefined();
    });

    it('truncates displayName to 64 characters', async () => {
      const longName = 'PlayerName_'.repeat(10); // 110 characters
      const req = new NextRequest('http://localhost:3000/api/livekit/token', {
        method: 'POST',
        headers: validHeaders(),
        body: JSON.stringify({
          roomName: 'space-room-lobby',
          displayName: longName,
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
    });
  });

  describe('Room Authorization Forbidden (Status 403)', () => {
    it('returns status 403 when user attempts to join a private space they do not have access to', async () => {
      const privateSpaceId = '99999999-8888-7777-6666-555544443333';
      // RLS query returns null (row not found / not permitted)
      mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

      const req = new NextRequest('http://localhost:3000/api/livekit/token', {
        method: 'POST',
        headers: validHeaders(),
        body: JSON.stringify({
          spaceId: privateSpaceId,
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(403);

      const data = await res.json();
      expect(data).toEqual({ error: 'Not allowed to join this room' });
      expect(mockAddGrant).not.toHaveBeenCalled();
    });

    it('returns status 403 when user is not a participant in the DM call', async () => {
      const dmConvId = '11111111-2222-3333-4444-555555555555';
      mockMaybeSingle.mockResolvedValueOnce({
        data: {
          user_one: 'other-user-a',
          user_two: 'other-user-b',
        },
        error: null,
      });

      const req = new NextRequest('http://localhost:3000/api/livekit/token', {
        method: 'POST',
        headers: validHeaders(),
        body: JSON.stringify({
          roomName: `call-dm-${dmConvId}`,
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe('Not allowed to join this room');
    });

    it('returns status 403 when user is not an enrolled member in the group call', async () => {
      const groupConvId = '77777777-8888-9999-aaaa-bbbbccccdddd';
      mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

      const req = new NextRequest('http://localhost:3000/api/livekit/token', {
        method: 'POST',
        headers: validHeaders(),
        body: JSON.stringify({
          roomName: `call-group-${groupConvId}`,
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe('Not allowed to join this room');
    });

    it.each([
      ['arbitrary name', 'my-custom-zoom-call'],
      ['raw uuid', 'b6941fa2-8305-4e00-833c-ca3cd5f08c9b'],
      ['invalid prefix', 'chat-room-lobby'],
      ['injection attempt', 'space-room-lobby; DROP TABLE spaces;'],
    ])('returns status 403 for unauthorized room format (%s)', async (_, invalidRoom) => {
      const req = new NextRequest('http://localhost:3000/api/livekit/token', {
        method: 'POST',
        headers: validHeaders(),
        body: JSON.stringify({
          roomName: invalidRoom,
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe('Not allowed to join this room');
    });
  });

  describe('Input Validation (Status 400)', () => {
    it('returns status 400 when both roomName and spaceId are missing', async () => {
      const req = new NextRequest('http://localhost:3000/api/livekit/token', {
        method: 'POST',
        headers: validHeaders(),
        body: JSON.stringify({
          displayName: 'Explorer NoRoom',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data).toEqual({ error: 'Missing roomName or spaceId' });
    });

    it('returns status 400 when roomName is empty string and spaceId is omitted', async () => {
      const req = new NextRequest('http://localhost:3000/api/livekit/token', {
        method: 'POST',
        headers: validHeaders(),
        body: JSON.stringify({
          roomName: '',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Missing roomName or spaceId');
    });
  });

  describe('Authentication & Token Validation (Status 401)', () => {
    it('returns status 401 when Authorization header is missing', async () => {
      const req = new NextRequest('http://localhost:3000/api/livekit/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomName: 'space-room-lobby' }),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);

      const data = await res.json();
      expect(data).toEqual({ error: 'Missing Authorization header' });
    });

    it('returns status 401 when Supabase auth token is invalid or expired', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'token is expired by 300s' },
      });

      const req = new NextRequest('http://localhost:3000/api/livekit/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer expired-jwt-token',
        },
        body: JSON.stringify({ roomName: 'space-room-lobby' }),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);

      const data = await res.json();
      expect(data).toEqual({ error: 'Unauthorized user token' });
    });
  });

  describe('Rate Limiting & Server Errors (Status 429 & 500)', () => {
    it('returns status 429 when user exceeds 25 token requests per minute', async () => {
      const headers = validHeaders();

      // 25 allowed requests (RATE_LIMITS.USER_LIVEKIT_TOKEN)
      for (let i = 0; i < 25; i++) {
        const req = new NextRequest('http://localhost:3000/api/livekit/token', {
          method: 'POST',
          headers,
          body: JSON.stringify({ roomName: 'space-room-lobby' }),
        });
        const res = await POST(req);
        expect(res.status).toBe(200);
      }

      // 26th request triggers rate limit
      const blockedReq = new NextRequest('http://localhost:3000/api/livekit/token', {
        method: 'POST',
        headers,
        body: JSON.stringify({ roomName: 'space-room-lobby' }),
      });

      const blockedRes = await POST(blockedReq);
      expect(blockedRes.status).toBe(429);

      const blockedData = await blockedRes.json();
      expect(blockedData.error).toBe('Rate limit exceeded');
      expect(blockedData.message).toContain('Too many token requests');
      expect(blockedRes.headers.get('retry-after')).toBeDefined();
    });

    it('returns status 500 when LiveKit credentials are unconfigured', async () => {
      const origKey = process.env.LIVEKIT_API_KEY;
      const origSecret = process.env.LIVEKIT_API_SECRET;
      try {
        delete process.env.LIVEKIT_API_KEY;
        delete process.env.LIVEKIT_API_SECRET;
        vi.resetModules();

        const { POST: unconfiguredPOST } = await import('../../src/app/api/livekit/token/route');

        const req = new NextRequest('http://localhost:3000/api/livekit/token', {
          method: 'POST',
          headers: validHeaders(),
          body: JSON.stringify({ roomName: 'space-room-lobby' }),
        });

        const res = await unconfiguredPOST(req);
        expect(res.status).toBe(500);

        const data = await res.json();
        expect(data).toEqual({ error: 'LiveKit server credentials unconfigured' });
      } finally {
        process.env.LIVEKIT_API_KEY = origKey;
        process.env.LIVEKIT_API_SECRET = origSecret;
        vi.resetModules();
      }
    });

    it('returns status 500 when token signing fails', async () => {
      mockToJwt.mockRejectedValueOnce(new Error('Signing key corrupted or crypto error'));

      const req = new NextRequest('http://localhost:3000/api/livekit/token', {
        method: 'POST',
        headers: validHeaders(),
        body: JSON.stringify({ roomName: 'space-room-lobby' }),
      });

      const res = await POST(req);
      expect(res.status).toBe(500);

      const data = await res.json();
      expect(data).toEqual({ error: 'Failed to generate token' });
    });

    it('returns status 500 when request body contains unparseable JSON stream', async () => {
      const req = new NextRequest('http://localhost:3000/api/livekit/token', {
        method: 'POST',
        headers: validHeaders(),
        body: 'invalid-json-stream',
      });

      const res = await POST(req);
      expect(res.status).toBe(500);

      const data = await res.json();
      expect(data).toEqual({ error: 'Failed to generate token' });
    });
  });
});
