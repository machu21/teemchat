import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://pirpqkbdayorovfzczpq.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key-test-value';
  process.env.ADMIN_SECRET_KEY = 'super-secret-admin-machine-key';
});

const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockRpc = vi.fn();

const mockSupabaseAdmin = {
  auth: {
    getUser: mockGetUser,
    admin: {
      createUser: vi.fn(),
      deleteUser: vi.fn(),
      updateUserById: vi.fn(),
      getUserById: vi.fn(),
    },
  },
  from: mockFrom,
  rpc: mockRpc,
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseAdmin),
}));

import { GET } from '../../src/app/api/admin/metrics/route';
import { defaultRateLimiter } from '../../src/lib/rateLimit';

describe('Admin Overview Metrics API (GET /api/admin/metrics)', () => {
  const adminUserId = '11111111-1111-1111-1111-111111111111';
  const superadminUserId = '22222222-2222-2222-2222-222222222222';
  const regularUserId = '33333333-3333-3333-3333-333333333333';
  const moderatorUserId = '44444444-4444-4444-4444-444444444444';

  const mockMetricsData = {
    totalUsers: 1420,
    newUsers24h: 35,
    activeSubscriptions: 88,
    totalRevenueCents: 440000,
    pendingReports: 4,
    activeSpaces: 12,
    todayAiMessages: 350,
  };

  const createRequest = (headers: Record<string, string> = {}) => {
    return new NextRequest('http://localhost:3000/api/admin/metrics', {
      method: 'GET',
      headers: {
        'x-forwarded-for': '198.51.100.42',
        ...headers,
      },
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    defaultRateLimiter.reset();
  });

  it('rejects unauthenticated requests missing headers with 401', async () => {
    const req = createRequest();
    const res = await GET(req);
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('rejects expired or invalid bearer tokens with 401', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'Token expired' } });

    const req = createRequest({ authorization: 'Bearer bad-token' });
    const res = await GET(req);
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.message).toContain('Invalid or expired');
  });

  it('rejects ordinary users (system_role = user) with 403', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: regularUserId, email: 'user@example.com' } },
      error: null,
    });

    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValueOnce({
        eq: vi.fn().mockReturnValueOnce({
          single: vi.fn().mockResolvedValueOnce({
            data: { id: regularUserId, username: 'reg_user', display_name: 'Regular', system_role: 'user', status: 'available' },
            error: null,
          }),
        }),
      }),
    });

    const req = createRequest({ authorization: 'Bearer user-token' });
    const res = await GET(req);
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.error).toBe('Forbidden');
    expect(body.message).toContain('Insufficient administrative privileges');
  });

  it('rejects moderators (system_role = moderator) with 403', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: moderatorUserId, email: 'mod@example.com' } },
      error: null,
    });

    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValueOnce({
        eq: vi.fn().mockReturnValueOnce({
          single: vi.fn().mockResolvedValueOnce({
            data: { id: moderatorUserId, username: 'mod_user', display_name: 'Moderator', system_role: 'moderator', status: 'available' },
            error: null,
          }),
        }),
      }),
    });

    const req = createRequest({ authorization: 'Bearer mod-token' });
    const res = await GET(req);
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.error).toBe('Forbidden');
    expect(body.message).toContain('Insufficient administrative privileges');
  });

  it('rejects suspended/banned admins with 403', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: adminUserId, email: 'banned@example.com' } },
      error: null,
    });

    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValueOnce({
        eq: vi.fn().mockReturnValueOnce({
          single: vi.fn().mockResolvedValueOnce({
            data: { id: adminUserId, username: 'banned_admin', display_name: 'Banned Admin', system_role: 'admin', status: 'banned' },
            error: null,
          }),
        }),
      }),
    });

    const req = createRequest({ authorization: 'Bearer banned-admin-token' });
    const res = await GET(req);
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.error).toBe('Forbidden');
    expect(body.message).toContain('suspended or banned');
  });

  it('returns 200 with aggregated metrics for admin (system_role = admin)', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: adminUserId, email: 'admin@teemchat.chat' } },
      error: null,
    });

    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValueOnce({
        eq: vi.fn().mockReturnValueOnce({
          single: vi.fn().mockResolvedValueOnce({
            data: { id: adminUserId, username: 'admin_joe', display_name: 'Joe Admin', system_role: 'admin', status: 'available' },
            error: null,
          }),
        }),
      }),
    });

    mockRpc.mockResolvedValueOnce({ data: mockMetricsData, error: null });

    const req = createRequest({ authorization: 'Bearer admin-token' });
    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.metrics).toEqual(mockMetricsData);
    expect(body.timestamp).toBeDefined();
    expect(mockRpc).toHaveBeenCalledWith('get_admin_overview_metrics');
  });

  it('returns 200 with aggregated metrics for superadmin', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: superadminUserId, email: 'super@teemchat.chat' } },
      error: null,
    });

    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValueOnce({
        eq: vi.fn().mockReturnValueOnce({
          single: vi.fn().mockResolvedValueOnce({
            data: { id: superadminUserId, username: 'superadmin', display_name: 'Super Admin', system_role: 'superadmin', status: 'available' },
            error: null,
          }),
        }),
      }),
    });

    mockRpc.mockResolvedValueOnce({ data: mockMetricsData, error: null });

    const req = createRequest({ authorization: 'Bearer superadmin-token' });
    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.metrics).toEqual(mockMetricsData);
  });

  it('returns 200 when authenticated via valid X-Admin-Api-Key', async () => {
    mockRpc.mockResolvedValueOnce({ data: mockMetricsData, error: null });

    const req = createRequest({ 'x-admin-api-key': 'super-secret-admin-machine-key' });
    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.metrics).toEqual(mockMetricsData);
  });

  it('returns 500 when Supabase RPC returns a database error', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: adminUserId, email: 'admin@teemchat.chat' } },
      error: null,
    });

    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValueOnce({
        eq: vi.fn().mockReturnValueOnce({
          single: vi.fn().mockResolvedValueOnce({
            data: { id: adminUserId, username: 'admin', display_name: 'Admin', system_role: 'admin', status: 'available' },
            error: null,
          }),
        }),
      }),
    });

    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'Database connection failed' } });

    const req = createRequest({ authorization: 'Bearer admin-token' });
    const res = await GET(req);
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.error).toBe('Failed to retrieve metrics');
    expect(body.message).toBe('Database connection failed');
  });

  it('returns 500 when an unhandled exception is thrown', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: adminUserId, email: 'admin@teemchat.chat' } },
      error: null,
    });

    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValueOnce({
        eq: vi.fn().mockReturnValueOnce({
          single: vi.fn().mockResolvedValueOnce({
            data: { id: adminUserId, username: 'admin', display_name: 'Admin', system_role: 'admin', status: 'available' },
            error: null,
          }),
        }),
      }),
    });

    mockRpc.mockRejectedValueOnce(new Error('Fatal connection reset'));

    const req = createRequest({ authorization: 'Bearer admin-token' });
    const res = await GET(req);
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.error).toBe('Internal server error');
    expect(body.message).toBe('Fatal connection reset');
  });

  it('enforces rate limiting (429) after threshold exceeded', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: adminUserId, email: 'admin@teemchat.chat' } },
      error: null,
    });

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: adminUserId, username: 'admin', display_name: 'Admin', system_role: 'admin', status: 'available' },
            error: null,
          }),
        }),
      }),
    });

    mockRpc.mockResolvedValue({ data: mockMetricsData, error: null });

    const headers = { authorization: 'Bearer token', 'x-forwarded-for': '203.0.113.99' };

    for (let i = 0; i < 120; i++) {
      const okRes = await GET(createRequest(headers));
      expect(okRes.status).toBe(200);
    }

    const rateLimitedRes = await GET(createRequest(headers));
    expect(rateLimitedRes.status).toBe(429);
    const body = await rateLimitedRes.json();
    expect(body.error).toBe('Rate limit exceeded');
  });
});
