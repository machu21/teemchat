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

import { GET } from '../../src/app/api/admin/auth/verify/route';
import { defaultRateLimiter } from '../../src/lib/rateLimit';

describe('Admin Authentication & Verification API', () => {
  const adminUserId = '11111111-1111-1111-1111-111111111111';
  const regularUserId = '22222222-2222-2222-2222-222222222222';

  const createRequest = (headers: Record<string, string> = {}) => {
    return new NextRequest('http://localhost:3000/api/admin/auth/verify', {
      method: 'GET',
      headers: {
        'x-forwarded-for': '198.51.100.77',
        ...headers,
      },
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    defaultRateLimiter.reset();
  });

  it('rejects requests missing an Authorization or X-Admin-Api-Key header with 401', async () => {
    const req = createRequest();
    const res = await GET(req);
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('rejects requests with invalid or expired tokens with 401', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'Token expired' } });

    const req = createRequest({ authorization: 'Bearer expired-token' });
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
            data: { id: regularUserId, username: 'reg_user', display_name: 'Regular', system_role: 'user' },
            error: null,
          }),
        }),
      }),
    });

    const req = createRequest({ authorization: 'Bearer valid-user-token' });
    const res = await GET(req);
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.error).toBe('Forbidden');
    expect(body.message).toContain('Insufficient administrative privileges');
  });

  it('rejects moderators (system_role = moderator) with 403', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: regularUserId, email: 'mod@example.com' } },
      error: null,
    });

    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValueOnce({
        eq: vi.fn().mockReturnValueOnce({
          single: vi.fn().mockResolvedValueOnce({
            data: { id: regularUserId, username: 'mod_user', display_name: 'Moderator', system_role: 'moderator', status: 'available' },
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

  it('rejects requests when admin profile is not found with 403', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: adminUserId, email: 'ghost@teemchat.chat' } },
      error: null,
    });

    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValueOnce({
        eq: vi.fn().mockReturnValueOnce({
          single: vi.fn().mockResolvedValueOnce({
            data: null,
            error: { message: 'Row not found' },
          }),
        }),
      }),
    });

    const req = createRequest({ authorization: 'Bearer ghost-admin-token' });
    const res = await GET(req);
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.error).toBe('Forbidden');
    expect(body.message).toContain('Admin profile record not found');
  });

  it('rejects suspended/banned administrator with 403', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: adminUserId, email: 'suspended@teemchat.chat' } },
      error: null,
    });

    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValueOnce({
        eq: vi.fn().mockReturnValueOnce({
          single: vi.fn().mockResolvedValueOnce({
            data: { id: adminUserId, username: 'suspended_admin', display_name: 'Suspended Admin', system_role: 'admin', status: 'banned' },
            error: null,
          }),
        }),
      }),
    });

    const req = createRequest({ authorization: 'Bearer suspended-token' });
    const res = await GET(req);
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.error).toBe('Forbidden');
    expect(body.message).toContain('Administrative account is suspended or banned');
  });

  it('rejects invalid or wrong X-Admin-Api-Key with 401', async () => {
    const req = createRequest({ 'x-admin-api-key': 'incorrect-machine-secret-key' });
    const res = await GET(req);
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
    expect(body.message).toContain('Invalid administrative API key');
  });

  it('rejects malformed Authorization header with 401', async () => {
    const req = createRequest({ authorization: 'Basic dXNlcjpwYXNz' });
    const res = await GET(req);
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
    expect(body.message).toContain('Missing or malformed Authorization header');
  });

  it('accepts administrators (system_role = admin) with 200 and capability flags', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: adminUserId, email: 'admin@teemchat.chat' } },
      error: null,
    });

    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValueOnce({
        eq: vi.fn().mockReturnValueOnce({
          single: vi.fn().mockResolvedValueOnce({
            data: { id: adminUserId, username: 'admin_joe', display_name: 'Joe Admin', system_role: 'admin' },
            error: null,
          }),
        }),
      }),
    });

    const req = createRequest({ authorization: 'Bearer valid-admin-token' });
    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.verified).toBe(true);
    expect(body.admin.systemRole).toBe('admin');
    expect(body.capabilities.canManageUsers).toBe(true);
    expect(body.capabilities.canAssignSuperadmin).toBe(false);
  });

  it('accepts superadmins with 200 and superadmin permissions', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: adminUserId, email: 'matzcabal23@gmail.com' } },
      error: null,
    });

    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValueOnce({
        eq: vi.fn().mockReturnValueOnce({
          single: vi.fn().mockResolvedValueOnce({
            data: { id: adminUserId, username: 'matzcabal23', display_name: 'Matt', system_role: 'superadmin' },
            error: null,
          }),
        }),
      }),
    });

    const req = createRequest({ authorization: 'Bearer superadmin-token' });
    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.verified).toBe(true);
    expect(body.admin.systemRole).toBe('superadmin');
    expect(body.capabilities.canAssignSuperadmin).toBe(true);
  });

  it('accepts requests authenticated with X-Admin-Api-Key', async () => {
    const req = createRequest({ 'x-admin-api-key': 'super-secret-admin-machine-key' });
    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.verified).toBe(true);
    expect(body.admin.isMachineKey).toBe(true);
    expect(body.admin.systemRole).toBe('superadmin');
  });

  it('enforces rate limiting when too many requests arrive from one IP', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: adminUserId, email: 'admin@teemchat.chat' } },
      error: null,
    });

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: adminUserId, username: 'admin', display_name: 'Admin', system_role: 'admin' },
            error: null,
          }),
        }),
      }),
    });

    const headers = { authorization: 'Bearer token', 'x-forwarded-for': '203.0.113.88' };

    // Fire 120 calls to reach the limit
    for (let i = 0; i < 120; i++) {
      const okRes = await GET(createRequest(headers));
      expect(okRes.status).toBe(200);
    }

    // Call 121 should be rate limited
    const rateLimitedRes = await GET(createRequest(headers));
    expect(rateLimitedRes.status).toBe(429);
    const body = await rateLimitedRes.json();
    expect(body.error).toBe('Rate limit exceeded');
  });
});

