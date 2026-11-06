import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// 1. Mock Supabase client session retrieval before importing service
const mockGetSession = vi.fn();
vi.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
    },
  },
}));

// 2. Import service under test
import {
  AdminClientService,
  AdminApiError,
  WHITELISTED_CRUD_ENTITIES,
} from '../src/lib/services/adminClient';

describe('AdminClientService Unit Test Suite', () => {
  const originalFetch = globalThis.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;

  const mockJsonResponse = (status: number, data: unknown, headers: Record<string, string> = {}) => {
    return Promise.resolve(
      new Response(JSON.stringify(data), {
        status,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      })
    );
  };

  const mockTextResponse = (status: number, text: string, headers: Record<string, string> = {}) => {
    return Promise.resolve(
      new Response(text, {
        status,
        headers: {
          'Content-Type': 'text/plain',
          ...headers,
        },
      })
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    AdminClientService.setDevApiKey(null);
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });

    mockFetch = vi.fn();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    AdminClientService.setDevApiKey(null);
  });

  /* -------------------------------------------------------------------------- */
  /* Group 1: Auth Headers & Machine Secret Fallback                            */
  /* -------------------------------------------------------------------------- */
  describe('Group 1: Auth Headers & Machine Key Resolution', () => {
    it('returns standard headers without auth when session and dev key are absent', async () => {
      const headers = await AdminClientService.getHeaders();
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['Accept']).toBe('application/json');
      expect(headers['Authorization']).toBeUndefined();
      expect(headers['x-admin-api-key']).toBeUndefined();
    });

    it('injects Bearer token from Supabase session when available', async () => {
      mockGetSession.mockResolvedValueOnce({
        data: { session: { access_token: 'mock-jwt-token-123' } },
        error: null,
      });

      const headers = await AdminClientService.getHeaders();
      expect(headers['Authorization']).toBe('Bearer mock-jwt-token-123');
      expect(headers['x-admin-api-key']).toBeUndefined();
    });

    it('injects x-admin-api-key when set via setDevApiKey', async () => {
      AdminClientService.setDevApiKey('super-secret-machine-key');
      const headers = await AdminClientService.getHeaders();
      expect(headers['x-admin-api-key']).toBe('super-secret-machine-key');
    });

    it('injects both Bearer token and x-admin-api-key when both are configured', async () => {
      mockGetSession.mockResolvedValueOnce({
        data: { session: { access_token: 'jwt-456' } },
        error: null,
      });
      AdminClientService.setDevApiKey('machine-key-789');

      const headers = await AdminClientService.getHeaders();
      expect(headers['Authorization']).toBe('Bearer jwt-456');
      expect(headers['x-admin-api-key']).toBe('machine-key-789');
    });

    it('allows overriding token and apiKey via options parameter', async () => {
      mockGetSession.mockResolvedValueOnce({
        data: { session: { access_token: 'session-token' } },
        error: null,
      });
      AdminClientService.setDevApiKey('stored-machine-key');

      const headers = await AdminClientService.getHeaders({
        token: 'override-token',
        apiKey: 'override-api-key',
      });
      expect(headers['Authorization']).toBe('Bearer override-token');
      expect(headers['x-admin-api-key']).toBe('override-api-key');
    });

    it('clears devApiKey when set to null', async () => {
      AdminClientService.setDevApiKey('temp-key');
      expect(AdminClientService.getDevApiKey()).toBe('temp-key');
      AdminClientService.setDevApiKey(null);
      expect(AdminClientService.getDevApiKey()).toBeNull();
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Group 2: Error Mapping & Classification (AdminApiError)                    */
  /* -------------------------------------------------------------------------- */
  describe('Group 2: Error Mapping & AdminApiError Classification', () => {
    it('maps 401 Unauthorized response with isUnauthorized flag', async () => {
      mockFetch.mockReturnValueOnce(
        mockJsonResponse(401, { error: 'Unauthorized', message: 'Token expired' })
      );

      try {
        await AdminClientService.verifyAuth();
        expect.fail('Expected verifyAuth to throw');
      } catch (err) {
        const apiErr = err as AdminApiError;
        expect(apiErr.status).toBe(401);
        expect(apiErr.isUnauthorized).toBe(true);
        expect(apiErr.isForbidden).toBe(false);
        expect(apiErr.message).toBe('Token expired');
      }
    });

    it('maps 403 Forbidden response with isForbidden flag', async () => {
      mockFetch.mockReturnValueOnce(
        mockJsonResponse(403, { error: 'Forbidden', message: 'Insufficient privileges' })
      );

      try {
        await AdminClientService.verifyAuth();
      } catch (err) {
        const apiErr = err as AdminApiError;
        expect(apiErr.status).toBe(403);
        expect(apiErr.isForbidden).toBe(true);
        expect(apiErr.isUnauthorized).toBe(false);
        expect(apiErr.message).toBe('Insufficient privileges');
      }
    });

    it('maps 404 Not Found response with isNotFound flag', async () => {
      mockFetch.mockReturnValueOnce(
        mockJsonResponse(404, { error: 'Not Found', message: 'User not found' })
      );

      try {
        await AdminClientService.getUser('non-existent-id');
      } catch (err) {
        const apiErr = err as AdminApiError;
        expect(apiErr.status).toBe(404);
        expect(apiErr.isNotFound).toBe(true);
        expect(apiErr.message).toBe('User not found');
      }
    });

    it('maps 429 Rate Limited response and parses retryAfter header and body', async () => {
      mockFetch.mockReturnValueOnce(
        mockJsonResponse(
          429,
          { error: 'Rate limit exceeded', retryAfter: 45 },
          { 'retry-after': '45' }
        )
      );

      try {
        await AdminClientService.getMetrics();
      } catch (err) {
        const apiErr = err as AdminApiError;
        expect(apiErr.status).toBe(429);
        expect(apiErr.isRateLimited).toBe(true);
        expect(apiErr.retryAfter).toBe(45);
      }
    });

    it('maps 500 Internal Server Error with isServerError flag', async () => {
      mockFetch.mockReturnValueOnce(
        mockJsonResponse(500, { message: 'Database connection failed' })
      );

      try {
        await AdminClientService.getMetrics();
      } catch (err) {
        const apiErr = err as AdminApiError;
        expect(apiErr.status).toBe(500);
        expect(apiErr.isServerError).toBe(true);
        expect(apiErr.isClientError).toBe(false);
      }
    });

    it('handles non-JSON text or HTML error response without parsing failure', async () => {
      mockFetch.mockReturnValueOnce(
        mockTextResponse(502, 'Bad Gateway: Cloudflare')
      );

      try {
        await AdminClientService.getMetrics();
      } catch (err) {
        const apiErr = err as AdminApiError;
        expect(apiErr.status).toBe(502);
        expect(apiErr.data).toBe('Bad Gateway: Cloudflare');
      }
    });

    it('propagates network rejection errors', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      await expect(AdminClientService.verifyAuth()).rejects.toThrow('Failed to fetch');
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Group 3: Overview Metrics                                                  */
  /* -------------------------------------------------------------------------- */
  describe('Group 3: Overview Metrics (getMetrics)', () => {
    it('calls GET /api/admin/metrics and returns metrics payload', async () => {
      const mockMetricsData = {
        totalUsers: 1250,
        newUsers24h: 30,
        activeSubscriptions: 85,
        totalRevenueCents: 150000,
        pendingReports: 2,
        activeSpaces: 40,
        todayAiMessages: 280,
      };

      mockFetch.mockReturnValueOnce(
        mockJsonResponse(200, {
          metrics: mockMetricsData,
          timestamp: '2026-11-05T22:00:00Z',
        })
      );

      const res = await AdminClientService.getMetrics();
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/metrics',
        expect.objectContaining({ method: 'GET' })
      );
      expect(res.metrics.totalUsers).toBe(1250);
      expect(res.metrics.activeSubscriptions).toBe(85);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Group 4: Users Management                                                  */
  /* -------------------------------------------------------------------------- */
  describe('Group 4: Users Management Endpoints', () => {
    it('getUsers serializes complex query parameters correctly', async () => {
      mockFetch.mockReturnValueOnce(
        mockJsonResponse(200, {
          users: [],
          pagination: { page: 2, limit: 50, total: 100, totalPages: 2 },
        })
      );

      await AdminClientService.getUsers({
        page: 2,
        limit: 50,
        search: 'alice',
        sortBy: 'username',
        sortOrder: 'asc',
        status: 'available',
        role: 'admin',
        tier: 'pro',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/users?page=2&limit=50&search=alice&sortBy=username&sortOrder=asc&status=available&role=admin&tier=pro',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('createUser sends POST /api/admin/users with payload', async () => {
      mockFetch.mockReturnValueOnce(
        mockJsonResponse(201, {
          message: 'User created successfully',
          user: { id: 'new-user-1', email: 'test@example.com', profile: {} },
        })
      );

      const payload = {
        email: 'test@example.com',
        password: 'Password123!',
        displayName: 'Test User',
        gender: 'male' as const,
        tier: 'free' as const,
        systemRole: 'user' as const,
        autoConfirm: true,
        hasAiCompanion: false,
      };

      const res = await AdminClientService.createUser(payload);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/users',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(payload),
        })
      );
      expect(res.user.id).toBe('new-user-1');
    });

    it('getUser calls GET /api/admin/users/[id]', async () => {
      mockFetch.mockReturnValueOnce(
        mockJsonResponse(200, {
          user: {
            id: 'u-123',
            email: 'user@example.com',
            emailConfirmedAt: '2026-10-01T00:00:00Z',
            lastSignInAt: '2026-11-01T00:00:00Z',
            bannedUntil: null,
            profile: {},
            subscription: null,
            aiUsage: [],
            reports: { total: 0, items: [] },
            spaces: { total: 1, memberships: [] },
          },
        })
      );

      const res = await AdminClientService.getUser('u-123');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/users/u-123',
        expect.objectContaining({ method: 'GET' })
      );
      expect(res.user.id).toBe('u-123');
    });

    it('updateUser sends PATCH /api/admin/users/[id] with body', async () => {
      mockFetch.mockReturnValueOnce(
        mockJsonResponse(200, {
          message: 'User updated successfully',
          profile: { display_name: 'Updated Name' },
        })
      );

      await AdminClientService.updateUser('u-123', {
        displayName: 'Updated Name',
        tier: 'enterprise',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/users/u-123',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ displayName: 'Updated Name', tier: 'enterprise' }),
        })
      );
    });

    it('deleteUser defaults to soft ban mode', async () => {
      mockFetch.mockReturnValueOnce(
        mockJsonResponse(200, { message: 'User suspended successfully (soft ban).' })
      );

      await AdminClientService.deleteUser('u-123');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/users/u-123?mode=soft',
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('deleteUser hard mode passes mode=hard', async () => {
      mockFetch.mockReturnValueOnce(
        mockJsonResponse(200, { message: 'User permanently deleted.' })
      );

      await AdminClientService.deleteUser('u-123', 'hard');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/users/u-123?mode=hard',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Group 5: Payments & Subscriptions                                          */
  /* -------------------------------------------------------------------------- */
  describe('Group 5: Payments & Subscriptions Endpoints', () => {
    it('getSubscriptions queries /api/admin/payments/subscriptions with parameters', async () => {
      mockFetch.mockReturnValueOnce(
        mockJsonResponse(200, {
          subscriptions: [],
          pagination: { page: 1, limit: 10, total: 0, totalPages: 1 },
        })
      );

      await AdminClientService.getSubscriptions({
        page: 1,
        limit: 10,
        status: 'active',
        sortBy: 'current_period_end',
        sortOrder: 'desc',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/payments/subscriptions?page=1&limit=10&status=active&sortBy=current_period_end&sortOrder=desc',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('updateSubscription sends PATCH with override payload', async () => {
      mockFetch.mockReturnValueOnce(
        mockJsonResponse(200, {
          message: 'Subscription updated',
          subscription: { id: 'sub-1', status: 'canceled' },
        })
      );

      const payload = {
        id: 'sub-1',
        status: 'canceled' as const,
        cancelAtPeriodEnd: true,
      };

      await AdminClientService.updateSubscription(payload);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/payments/subscriptions',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
      );
    });

    it('getInvoices queries /api/admin/payments/invoices', async () => {
      mockFetch.mockReturnValueOnce(
        mockJsonResponse(200, {
          invoices: [],
          pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
        })
      );

      await AdminClientService.getInvoices({ status: 'paid', sortBy: 'amount_cents', sortOrder: 'asc' });
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/payments/invoices?status=paid&sortBy=amount_cents&sortOrder=asc',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('createInvoice sends POST with invoice payload', async () => {
      mockFetch.mockReturnValueOnce(
        mockJsonResponse(201, {
          message: 'Invoice created',
          invoice: { id: 'inv-123' },
        })
      );

      const payload = {
        userId: '11111111-1111-1111-1111-111111111111',
        amountCents: 2500,
        currency: 'usd',
        status: 'paid' as const,
      };

      await AdminClientService.createInvoice(payload);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/payments/invoices',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(payload),
        })
      );
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Group 6: Multi-Category System Logs                                        */
  /* -------------------------------------------------------------------------- */
  describe('Group 6: System Logs Endpoints', () => {
    it('getLogs defaults to category=admin_audit', async () => {
      mockFetch.mockReturnValueOnce(
        mockJsonResponse(200, {
          category: 'admin_audit',
          logs: [],
          pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
        })
      );

      await AdminClientService.getLogs();
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/logs?category=admin_audit',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('getLogs serializes date filters and search terms', async () => {
      mockFetch.mockReturnValueOnce(
        mockJsonResponse(200, {
          category: 'space_audit',
          logs: [],
          pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
        })
      );

      await AdminClientService.getLogs({
        category: 'space_audit',
        startDate: '2026-11-01T00:00:00Z',
        endDate: '2026-11-05T00:00:00Z',
        search: 'kick',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/logs?category=space_audit&startDate=2026-11-01T00%3A00%3A00Z&endDate=2026-11-05T00%3A00%3A00Z&search=kick',
        expect.objectContaining({ method: 'GET' })
      );
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Group 7: Database CRUD Explorer                                            */
  /* -------------------------------------------------------------------------- */
  describe('Group 7: Database CRUD Explorer Endpoints', () => {
    it('getCrudRecords on spaces sets standard default sort to created_at desc', async () => {
      mockFetch.mockReturnValueOnce(
        mockJsonResponse(200, {
          entity: 'spaces',
          records: [],
          pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
        })
      );

      await AdminClientService.getCrudRecords('spaces');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/crud/spaces?sortBy=created_at&sortOrder=desc',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('getCrudRecords on space_settings automatically overrides default sort to updated_at', async () => {
      mockFetch.mockReturnValueOnce(
        mockJsonResponse(200, {
          entity: 'space_settings',
          records: [],
          pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
        })
      );

      await AdminClientService.getCrudRecords('space_settings');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/crud/space_settings?sortBy=updated_at&sortOrder=desc',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('getCrudRecords on space_members automatically overrides default sort to joined_at', async () => {
      mockFetch.mockReturnValueOnce(
        mockJsonResponse(200, {
          entity: 'space_members',
          records: [],
          pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
        })
      );

      await AdminClientService.getCrudRecords('space_members');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/crud/space_members?sortBy=joined_at&sortOrder=desc',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('getCrudRecords serializes dynamic equality filters', async () => {
      mockFetch.mockReturnValueOnce(
        mockJsonResponse(200, {
          entity: 'spaces',
          records: [],
          pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
        })
      );

      await AdminClientService.getCrudRecords('spaces', {
        filters: { space_id: 'space-123', is_active: true },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/crud/spaces?sortBy=created_at&sortOrder=desc&space_id=space-123&is_active=true',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('createCrudRecord sends POST /api/admin/crud/[entity]', async () => {
      mockFetch.mockReturnValueOnce(
        mockJsonResponse(201, {
          message: 'Record created',
          record: { id: 'w-1', name: 'Cyber World' },
        })
      );

      const payload = { name: 'Cyber World', slug: 'cyber-world' };
      await AdminClientService.createCrudRecord('worlds', payload);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/crud/worlds',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(payload),
        })
      );
    });

    it('getCrudRecord calls GET /api/admin/crud/[entity]/[id]', async () => {
      mockFetch.mockReturnValueOnce(
        mockJsonResponse(200, {
          entity: 'worlds',
          record: { id: 'w-1', name: 'Cyber World' },
        })
      );

      await AdminClientService.getCrudRecord('worlds', 'w-1');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/crud/worlds/w-1',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('updateCrudRecord sends PATCH /api/admin/crud/[entity]/[id]', async () => {
      mockFetch.mockReturnValueOnce(
        mockJsonResponse(200, {
          message: 'Record updated',
          record: { id: 'w-1', description: 'Updated' },
        })
      );

      await AdminClientService.updateCrudRecord('worlds', 'w-1', { description: 'Updated' });
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/crud/worlds/w-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ description: 'Updated' }),
        })
      );
    });

    it('deleteCrudRecord sends DELETE /api/admin/crud/[entity]/[id]', async () => {
      mockFetch.mockReturnValueOnce(
        mockJsonResponse(200, { message: 'Record deleted' })
      );

      await AdminClientService.deleteCrudRecord('worlds', 'w-1');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/crud/worlds/w-1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('rejects non-whitelisted entity with 400 AdminApiError before fetch', async () => {
      // @ts-expect-error testing invalid entity
      await expect(AdminClientService.getCrudRecords('forbidden_table')).rejects.toThrow(
        AdminApiError
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('whitelisted entities array contains all 15 expected tables', () => {
      expect(WHITELISTED_CRUD_ENTITIES).toHaveLength(15);
      expect(WHITELISTED_CRUD_ENTITIES).toContain('spaces');
      expect(WHITELISTED_CRUD_ENTITIES).toContain('worlds');
      expect(WHITELISTED_CRUD_ENTITIES).toContain('space_settings');
      expect(WHITELISTED_CRUD_ENTITIES).toContain('space_members');
      expect(WHITELISTED_CRUD_ENTITIES).toContain('space_roles');
      expect(WHITELISTED_CRUD_ENTITIES).toContain('user_reports');
      expect(WHITELISTED_CRUD_ENTITIES).toContain('space_bans');
      expect(WHITELISTED_CRUD_ENTITIES).toContain('space_mutes');
      expect(WHITELISTED_CRUD_ENTITIES).toContain('ai_companions');
      expect(WHITELISTED_CRUD_ENTITIES).toContain('companion_memories');
      expect(WHITELISTED_CRUD_ENTITIES).toContain('space_playlists');
      expect(WHITELISTED_CRUD_ENTITIES).toContain('playlist_tracks');
      expect(WHITELISTED_CRUD_ENTITIES).toContain('world_objects');
      expect(WHITELISTED_CRUD_ENTITIES).toContain('billing_invoices');
      expect(WHITELISTED_CRUD_ENTITIES).toContain('user_subscriptions');
    });
  });
});
