import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://pirpqkbdayorovfzczpq.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key-test-value';
  process.env.ADMIN_SECRET_KEY = 'super-secret-admin-machine-key';
});

const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockGte = vi.fn();
const mockLte = vi.fn();
const mockOr = vi.fn();
const mockIlike = vi.fn();

const mockSupabaseAdmin = {
  auth: {
    getUser: mockGetUser,
  },
  from: mockFrom,
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseAdmin),
}));

import { GET as getLogs } from '../../src/app/api/admin/logs/route';
import { defaultRateLimiter } from '../../src/lib/rateLimit';

describe('Admin System & Multi-Category Logs API', () => {
  const adminId = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    vi.clearAllMocks();
    defaultRateLimiter.reset();

    mockGetUser.mockResolvedValue({
      data: { user: { id: adminId, email: 'admin@teemchat.chat' } },
      error: null,
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: adminId, username: 'admin', display_name: 'Admin', system_role: 'admin', status: 'available' },
                error: null,
              }),
            }),
          }),
        };
      }

      const logQueryBuilder: Record<string, unknown> = {
        select: vi.fn().mockImplementation(() => logQueryBuilder),
        gte: mockGte.mockImplementation(() => logQueryBuilder),
        lte: mockLte.mockImplementation(() => logQueryBuilder),
        or: mockOr.mockImplementation(() => logQueryBuilder),
        ilike: mockIlike.mockImplementation(() => logQueryBuilder),
        order: vi.fn().mockImplementation(() => logQueryBuilder),
        range: vi.fn().mockResolvedValue({
          data: [{ id: 'record-1', sampleField: `from_${table}` }],
          count: 1,
          error: null,
        }),
      };
      return logQueryBuilder;
    });
  });

  describe('RBAC & Auth Boundaries', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/logs');
      const res = await getLogs(req);
      expect(res.status).toBe(401);
    });

    it('rejects regular users with 403', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: 'reg-id', email: 'reg@example.com' } },
        error: null,
      });

      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnValueOnce({
          eq: vi.fn().mockReturnValueOnce({
            single: vi.fn().mockResolvedValueOnce({
              data: { id: 'reg-id', username: 'reg', display_name: 'Reg', system_role: 'user', status: 'available' },
              error: null,
            }),
          }),
        }),
      });

      const req = new NextRequest('http://localhost:3000/api/admin/logs', {
        headers: { authorization: 'Bearer user-token' },
      });
      const res = await getLogs(req);
      expect(res.status).toBe(403);
    });
  });

  describe('Category Queries & Defaulting', () => {
    const categories = ['payments', 'admin_audit', 'space_audit', 'ai_usage', 'guest_security', 'reports'];

    for (const cat of categories) {
      it(`retrieves logs for category: ${cat}`, async () => {
        const req = new NextRequest(`http://localhost:3000/api/admin/logs?category=${cat}&page=1&limit=5`, {
          headers: { authorization: 'Bearer token', 'x-forwarded-for': '198.51.100.20' },
        });

        const res = await getLogs(req);
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.category).toBe(cat);
        expect(body.logs).toHaveLength(1);
        expect(body.pagination.total).toBe(1);
      });
    }

    it('defaults to admin_audit category when omitted', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/logs', {
        headers: { authorization: 'Bearer token' },
      });

      const res = await getLogs(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.category).toBe('admin_audit');
    });

    it('rejects unrecognized log categories with 400', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/logs?category=unknown_nonsense', {
        headers: { authorization: 'Bearer token', 'x-forwarded-for': '198.51.100.21' },
      });

      const res = await getLogs(req);
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toBe('Invalid log category');
      expect(body.validCategories).toContain('payments');
    });
  });

  describe('Date Range & Search Filtering', () => {
    it('applies startDate and endDate date filters', async () => {
      const startDate = '2026-11-01T00:00:00.000Z';
      const endDate = '2026-11-05T23:59:59.999Z';

      const req = new NextRequest(`http://localhost:3000/api/admin/logs?category=admin_audit&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`, {
        headers: { authorization: 'Bearer token' },
      });

      const res = await getLogs(req);
      expect(res.status).toBe(200);

      expect(mockGte).toHaveBeenCalledWith('created_at', startDate);
      expect(mockLte).toHaveBeenCalledWith('created_at', endDate);
    });

    it('applies search filter on ai_usage by user_id', async () => {
      const search = 'user-uuid-123';
      const req = new NextRequest(`http://localhost:3000/api/admin/logs?category=ai_usage&search=${search}`, {
        headers: { authorization: 'Bearer token' },
      });

      const res = await getLogs(req);
      expect(res.status).toBe(200);

      expect(mockIlike).toHaveBeenCalledWith('user_id', `%${search}%`);
    });

    it('applies search filter on guest_security by client_ip', async () => {
      const search = '192.168.1.1';
      const req = new NextRequest(`http://localhost:3000/api/admin/logs?category=guest_security&search=${search}`, {
        headers: { authorization: 'Bearer token' },
      });

      const res = await getLogs(req);
      expect(res.status).toBe(200);

      expect(mockIlike).toHaveBeenCalledWith('client_ip', `%${search}%`);
    });

    it('sanitizes search input with commas for .or() queries', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/logs?category=admin_audit&search=create%2Cuser(admin)', {
        headers: { authorization: 'Bearer token' },
      });

      const res = await getLogs(req);
      expect(res.status).toBe(200);

      expect(mockOr).toHaveBeenCalledWith(expect.stringContaining('create user admin'));
    });
  });

  describe('Validation & Error Handling', () => {
    it('rejects invalid pagination parameters with 400', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/logs?limit=500', {
        headers: { authorization: 'Bearer token' },
      });

      const res = await getLogs(req);
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toBe('Invalid query parameters');
    });

    it('returns 500 when database query encounters an error', async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: adminId, username: 'admin', display_name: 'Admin', system_role: 'admin', status: 'available' },
                  error: null,
                }),
              }),
            }),
          };
        }

        const brokenBuilder: Record<string, unknown> = {
          select: vi.fn().mockImplementation(() => brokenBuilder),
          order: vi.fn().mockImplementation(() => brokenBuilder),
          range: vi.fn().mockResolvedValue({
            data: null,
            count: null,
            error: { message: 'Database connection reset' },
          }),
        };
        return brokenBuilder;
      });

      const req = new NextRequest('http://localhost:3000/api/admin/logs', {
        headers: { authorization: 'Bearer token' },
      });

      const res = await getLogs(req);
      expect(res.status).toBe(500);

      const body = await res.json();
      expect(body.error).toBe('Internal server error');
    });
  });
});
