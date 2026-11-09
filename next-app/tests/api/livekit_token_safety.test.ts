import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockAddGrant, mockToJwt } = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://pirpqkbdayorovfzczpq.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key-test-value';
  process.env.LIVEKIT_API_KEY = 'mock-livekit-api-key';
  process.env.LIVEKIT_API_SECRET = 'mock-livekit-secret-32-chars-length';
  return {
    mockAddGrant: vi.fn(),
    mockToJwt: vi.fn().mockResolvedValue('mocked-livekit-token'),
  };
});

vi.mock('@/lib/rateLimit', () => import('../../src/lib/rateLimit'));
vi.mock('@/lib/models/space', () => import('../../src/lib/models/space'));

vi.mock('livekit-server-sdk', () => ({
  AccessToken: class {
    addGrant = mockAddGrant;
    toJwt = mockToJwt;
  },
  TrackSource: { MICROPHONE: 2, SCREEN_SHARE: 3, SCREEN_SHARE_AUDIO: 4 },
}));

const mockGetUser = vi.fn();
const mockMaybeSingle = vi.fn();
const mockRpc = vi.fn();

const mockSupabase = {
  auth: { getUser: mockGetUser },
  rpc: mockRpc,
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

const CALLER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PARTNER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SPACE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CONVO = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/livekit/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-user-token' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/livekit/token safety checks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    defaultRateLimiter.reset();
    mockGetUser.mockResolvedValue({ data: { user: { id: CALLER, email: 'c@teemchat.com' } }, error: null });
    mockToJwt.mockResolvedValue('mocked-livekit-token');
  });

  it('refuses a token to a player banned from the space', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: SPACE }, error: null });
    mockRpc.mockResolvedValue({ data: { banned: true, voice_muted: false, chat_muted: false }, error: null });

    const res = await POST(request({ spaceId: SPACE }));
    expect(res.status).toBe(403);
    expect(mockRpc).toHaveBeenCalledWith('my_space_restrictions', { p_space: SPACE });
    expect(mockAddGrant).not.toHaveBeenCalled();
  });

  it('lets a voice-muted player listen but not publish', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: SPACE }, error: null });
    mockRpc.mockResolvedValue({ data: { banned: false, voice_muted: true, chat_muted: false }, error: null });

    const res = await POST(request({ spaceId: SPACE }));
    expect(res.status).toBe(200);
    expect(mockAddGrant).toHaveBeenCalledWith(
      expect.objectContaining({ room: `space-${SPACE}`, canPublish: false, canSubscribe: true })
    );
  });

  it('fails open when the safety RPC is not deployed', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: SPACE }, error: null });
    mockRpc.mockResolvedValue({ data: null, error: { message: 'function does not exist' } });

    const res = await POST(request({ spaceId: SPACE }));
    expect(res.status).toBe(200);
    expect(mockAddGrant).toHaveBeenCalledWith(expect.objectContaining({ canPublish: true }));
  });

  it('refuses a DM call token when the other participant blocked the caller', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { user_one: CALLER, user_two: PARTNER }, error: null });
    mockRpc.mockResolvedValue({ data: { can_befriend: false, can_message: false }, error: null });

    const res = await POST(request({ roomName: `call-dm-${CONVO}` }));
    expect(res.status).toBe(403);
    expect(mockRpc).toHaveBeenCalledWith('contact_permissions', { p_other: PARTNER });
  });

  it('allows a DM call between players who may message each other', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { user_one: PARTNER, user_two: CALLER }, error: null });
    mockRpc.mockResolvedValue({ data: { can_befriend: true, can_message: true }, error: null });

    const res = await POST(request({ roomName: `call-dm-${CONVO}` }));
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('contact_permissions', { p_other: PARTNER });
  });
});
