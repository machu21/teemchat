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
  isValidCrudEntity,
  WhitelistedCrudEntity,
} from '../src/lib/services/adminClient';

describe('AdminClientService Adversarial Stress & Edge Case Test Suite', () => {
  const originalFetch = globalThis.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;

  const mockJsonResponse = (status: number, data: unknown, headers: Record<string, string> = {}) => {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    });
  };

  const mockTextResponse = (status: number, text: string, contentType = 'text/plain', headers: Record<string, string> = {}) => {
    return new Response(text, {
      status,
      headers: {
        'Content-Type': contentType,
        ...headers,
      },
    });
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
  /* 1. Malformed Queries, Undefined, Null, and Special Character Serialization */
  /* -------------------------------------------------------------------------- */
  describe('1. Query Serialization & Special Characters Stress', () => {
    it('handles undefined, null, and empty objects without crashing', () => {
      expect(AdminClientService.buildQuery()).toBe('');
      expect(AdminClientService.buildQuery(undefined)).toBe('');
      expect(AdminClientService.buildQuery({})).toBe('');
      expect(AdminClientService.buildQuery({ a: undefined, b: null, c: '' })).toBe('');
    });

    it('preserves falsy non-empty values (0, false)', () => {
      const q = AdminClientService.buildQuery({
        page: 0,
        limit: 0,
        active: false,
        name: '',
      });
      expect(q).toBe('?page=0&limit=0&active=false');
    });

    it('correctly percent-encodes URI-breaking special characters in search query', async () => {
      mockFetch.mockReturnValueOnce(
        mockJsonResponse(200, { users: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } })
      );

      const hostileSearch = 'tag/name?test=1&b=2#sec%20+foo=bar';
      await AdminClientService.getUsers({ search: hostileSearch });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const calledUrl = mockFetch.mock.calls[0][0] as string;

      expect(calledUrl).toContain('/api/admin/users?');
      const urlObj = new URL(calledUrl, 'https://example.com');
      // The search param must decode back to the exact input
      expect(urlObj.searchParams.get('search')).toBe(hostileSearch);
    });

    it('handles Unicode, emoji, and zero-width characters in search queries', async () => {
      mockFetch.mockReturnValueOnce(
        mockJsonResponse(200, { users: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } })
      );

      const unicodeSearch = 'こんにちは世界 🚀 éàç\u200B\u200C\u200D';
      await AdminClientService.getUsers({ search: unicodeSearch });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      const urlObj = new URL(calledUrl, 'https://example.com');
      expect(urlObj.searchParams.get('search')).toBe(unicodeSearch);
    });

    it('handles oversized strings (10KB) without crashing', async () => {
      mockFetch.mockReturnValueOnce(
        mockJsonResponse(200, { users: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } })
      );

      const massiveString = 'A'.repeat(10000);
      await AdminClientService.getUsers({ search: massiveString });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      const urlObj = new URL(calledUrl, 'https://example.com');
      expect(urlObj.searchParams.get('search')).toHaveLength(10000);
    });

    it('handles SQL injection payloads in search query safely as encoded parameters', async () => {
      mockFetch.mockReturnValueOnce(
        mockJsonResponse(200, { users: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } })
      );

      const sqliSearch = "admin' OR 1=1; DROP TABLE users; --";
      await AdminClientService.getUsers({ search: sqliSearch });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      const urlObj = new URL(calledUrl, 'https://example.com');
      expect(urlObj.searchParams.get('search')).toBe(sqliSearch);
    });

    it('encodes special characters and path traversal attempts in resource IDs', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(mockJsonResponse(200, { user: { id: 'test' } }))
      );

      // Path traversal attempt in user ID
      await AdminClientService.getUser('../admin/secret');
      expect(mockFetch).toHaveBeenLastCalledWith(
        '/api/admin/users/..%2Fadmin%2Fsecret',
        expect.anything()
      );

      // Slashes and hashes in user ID
      await AdminClientService.getUser('user/123#frag');
      expect(mockFetch).toHaveBeenLastCalledWith(
        '/api/admin/users/user%2F123%23frag',
        expect.anything()
      );

      // Query delimiters in user ID during DELETE
      mockFetch.mockReturnValueOnce(mockJsonResponse(200, { message: 'Deleted' }));
      await AdminClientService.deleteUser('user?evil=1&mode=hard', 'soft');
      expect(mockFetch).toHaveBeenLastCalledWith(
        '/api/admin/users/user%3Fevil%3D1%26mode%3Dhard?mode=soft',
        expect.anything()
      );
    });

    it('serializes nested filters with various primitives and special keys', () => {
      const q = AdminClientService.buildQuery({
        filters: {
          'status': 'active',
          'is_public': true,
          'count': 0,
          'empty_val': '',
          'null_val': null as unknown as string,
          'undef_val': undefined as unknown as string,
          'complex&key=weird': 'val#1',
        },
      });

      const urlParams = new URLSearchParams(q.replace(/^\?/, ''));
      expect(urlParams.get('status')).toBe('active');
      expect(urlParams.get('is_public')).toBe('true');
      expect(urlParams.get('count')).toBe('0');
      expect(urlParams.has('empty_val')).toBe(false);
      expect(urlParams.has('null_val')).toBe(false);
      expect(urlParams.has('undef_val')).toBe(false);
      expect(urlParams.get('complex&key=weird')).toBe('val#1');
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 2. CRUD Whitelisting & Non-Whitelisted Entity Rejection                    */
  /* -------------------------------------------------------------------------- */
  describe('2. CRUD Whitelist Security Boundaries', () => {
    const forbiddenEntities = [
      'evil_table',
      'users',
      'auth.users',
      'profiles',
      'pg_tables',
      'pg_stat_activity',
      'information_schema.tables',
      '../admin',
      '',
      '__proto__',
      'constructor',
      'space_settings; DROP TABLE spaces; --',
    ];

    it.each(forbiddenEntities)(
      'strictly rejects non-whitelisted entity "%s" across all CRUD operations without network call',
      async (forbidden) => {
        const entity = forbidden as WhitelistedCrudEntity;

        // 1. getCrudRecords
        await expect(AdminClientService.getCrudRecords(entity)).rejects.toThrow(AdminApiError);
        expect(mockFetch).not.toHaveBeenCalled();

        // 2. createCrudRecord
        await expect(AdminClientService.createCrudRecord(entity, { name: 'test' })).rejects.toThrow(AdminApiError);
        expect(mockFetch).not.toHaveBeenCalled();

        // 3. getCrudRecord
        await expect(AdminClientService.getCrudRecord(entity, 'rec-1')).rejects.toThrow(AdminApiError);
        expect(mockFetch).not.toHaveBeenCalled();

        // 4. updateCrudRecord
        await expect(AdminClientService.updateCrudRecord(entity, 'rec-1', { name: 'updated' })).rejects.toThrow(AdminApiError);
        expect(mockFetch).not.toHaveBeenCalled();

        // 5. deleteCrudRecord
        await expect(AdminClientService.deleteCrudRecord(entity, 'rec-1')).rejects.toThrow(AdminApiError);
        expect(mockFetch).not.toHaveBeenCalled();
      }
    );

    it('thrown error for non-whitelisted entity has status 400 and isClientError true', async () => {
      try {
        await AdminClientService.getCrudRecords('arbitrary_unknown_table' as WhitelistedCrudEntity);
        expect.fail('Should have thrown');
      } catch (err) {
        const apiErr = err as AdminApiError;
        expect(apiErr.status).toBe(400);
        expect(apiErr.isClientError).toBe(true);
        expect(apiErr.isServerError).toBe(false);
        expect(apiErr.message).toContain('is not permitted for administrative CRUD operations');
      }
    });

    it('accepts all 15 valid entities and formats URLs correctly', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(mockJsonResponse(200, { entity: 'spaces', records: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } }))
      );

      for (const entity of WHITELISTED_CRUD_ENTITIES) {
        expect(isValidCrudEntity(entity)).toBe(true);
        await AdminClientService.getCrudRecords(entity);
      }

      expect(mockFetch).toHaveBeenCalledTimes(15);
    });

    it('safely handles empty string or whitespace sortBy on whitelisted entity', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(mockJsonResponse(200, { entity: 'space_settings', records: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } }))
      );

      // If sortBy is empty string, defaults to updated_at
      await AdminClientService.getCrudRecords('space_settings', { sortBy: '' });
      expect(mockFetch).toHaveBeenLastCalledWith(
        '/api/admin/crud/space_settings?sortBy=updated_at&sortOrder=desc',
        expect.anything()
      );
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 3. HTTP 429 Rate Limiting & Retry-After Edge Cases                         */
  /* -------------------------------------------------------------------------- */
  describe('3. HTTP 429 Rate Limiting & Retry-After Parsing', () => {
    it('parses numeric retry-after from header', async () => {
      mockFetch.mockReturnValueOnce(
        mockJsonResponse(429, { message: 'Too many requests' }, { 'retry-after': '30' })
      );

      try {
        await AdminClientService.getMetrics();
        expect.fail('Should have thrown');
      } catch (err) {
        const apiErr = err as AdminApiError;
        expect(apiErr.status).toBe(429);
        expect(apiErr.isRateLimited).toBe(true);
        expect(apiErr.retryAfter).toBe(30);
      }
    });

    it('prefers JSON body retryAfter over header or falls back cleanly', async () => {
      mockFetch.mockReturnValueOnce(
        mockJsonResponse(429, { message: 'Rate limited', retryAfter: 90 }, { 'retry-after': '45' })
      );

      try {
        await AdminClientService.getMetrics();
        expect.fail('Should have thrown');
      } catch (err) {
        const apiErr = err as AdminApiError;
        expect(apiErr.status).toBe(429);
        expect(apiErr.retryAfter).toBe(90);
      }
    });

    it('handles 429 without any retry-after info gracefully', async () => {
      mockFetch.mockReturnValueOnce(
        mockJsonResponse(429, { message: 'Quota exhausted' })
      );

      try {
        await AdminClientService.getMetrics();
        expect.fail('Should have thrown');
      } catch (err) {
        const apiErr = err as AdminApiError;
        expect(apiErr.status).toBe(429);
        expect(apiErr.isRateLimited).toBe(true);
        expect(apiErr.retryAfter).toBeUndefined();
      }
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 4. Non-JSON Server Errors (502, 503, 504, HTML, Plain Text)                */
  /* -------------------------------------------------------------------------- */
  describe('4. Non-JSON & Server Error Resilience', () => {
    it('handles 502 Bad Gateway with Cloudflare / Nginx HTML payload', async () => {
      const htmlPayload = '<!DOCTYPE html><html><head><title>502 Bad Gateway</title></head><body><center><h1>502 Bad Gateway</h1></center><hr><center>cloudflare</center></body></html>';
      mockFetch.mockReturnValueOnce(
        mockTextResponse(502, htmlPayload, 'text/html')
      );

      try {
        await AdminClientService.verifyAuth();
        expect.fail('Should have thrown');
      } catch (err) {
        const apiErr = err as AdminApiError;
        expect(apiErr.status).toBe(502);
        expect(apiErr.isServerError).toBe(true);
        expect(apiErr.data).toBe(htmlPayload);
        expect(apiErr.message).toBe('Request failed with status 502');
      }
    });

    it('handles 503 Service Unavailable with plain text body', async () => {
      mockFetch.mockReturnValueOnce(
        mockTextResponse(503, 'Upstream maintenance in progress', 'text/plain')
      );

      try {
        await AdminClientService.getMetrics();
        expect.fail('Should have thrown');
      } catch (err) {
        const apiErr = err as AdminApiError;
        expect(apiErr.status).toBe(503);
        expect(apiErr.isServerError).toBe(true);
        expect(apiErr.data).toBe('Upstream maintenance in progress');
      }
    });

    it('handles 500 error with empty body without throwing syntax error', async () => {
      mockFetch.mockReturnValueOnce(
        Promise.resolve(new Response('', { status: 500, headers: { 'Content-Type': 'application/json' } }))
      );

      try {
        await AdminClientService.getMetrics();
        expect.fail('Should have thrown');
      } catch (err) {
        const apiErr = err as AdminApiError;
        expect(apiErr.status).toBe(500);
        expect(apiErr.isServerError).toBe(true);
        expect(apiErr.message).toBe('Request failed with status 500');
      }
    });

    it('extracts error string from JSON when response uses { error: "msg" } instead of { message: "msg" }', async () => {
      mockFetch.mockReturnValueOnce(
        mockJsonResponse(400, { error: 'Payload validation rejected' })
      );

      try {
        await AdminClientService.createUser({
          email: 'bad@example.com',
          password: 'pwd',
          displayName: 'Test',
          gender: 'male',
          tier: 'free',
          systemRole: 'user',
          autoConfirm: true,
          hasAiCompanion: false,
        });
        expect.fail('Should have thrown');
      } catch (err) {
        const apiErr = err as AdminApiError;
        expect(apiErr.status).toBe(400);
        expect(apiErr.message).toBe('Payload validation rejected');
      }
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 5. AbortSignal, Network Timeouts & Rejections                              */
  /* -------------------------------------------------------------------------- */
  describe('5. AbortSignal & Network Disconnection Handling', () => {
    it('passes AbortSignal to fetch and propagates AbortError', async () => {
      const controller = new AbortController();
      controller.abort();

      mockFetch.mockImplementationOnce((_url, init) => {
        if (init?.signal?.aborted) {
          return Promise.reject(new DOMException('This operation was aborted', 'AbortError'));
        }
        return mockJsonResponse(200, { verified: true });
      });

      await expect(
        AdminClientService.verifyAuth({ signal: controller.signal })
      ).rejects.toThrow('This operation was aborted');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/auth/verify',
        expect.objectContaining({ signal: controller.signal })
      );
    });

    it('propagates network timeout rejections cleanly', async () => {
      mockFetch.mockRejectedValueOnce(new DOMException('The operation timed out.', 'TimeoutError'));

      await expect(AdminClientService.getMetrics()).rejects.toThrow('The operation timed out.');
    });

    it('propagates DNS resolution or connection reset TypeError', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(AdminClientService.getMetrics()).rejects.toThrow('Failed to fetch');
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 6. Auth Headers Resilience & Session Failure                               */
  /* -------------------------------------------------------------------------- */
  describe('6. Auth Headers Resilience', () => {
    it('gracefully degrades when Supabase auth getSession throws an unexpected error', async () => {
      mockGetSession.mockRejectedValueOnce(new Error('Supabase client crashed'));

      const headers = await AdminClientService.getHeaders();
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['Authorization']).toBeUndefined();
    });

    it('trims leading and trailing whitespace from developer API key', () => {
      AdminClientService.setDevApiKey('   machine-key-padded   ');
      expect(AdminClientService.getDevApiKey()).toBe('machine-key-padded');
    });

    it('prioritizes explicit options token over session token', async () => {
      mockGetSession.mockResolvedValueOnce({
        data: { session: { access_token: 'session-jwt' } },
        error: null,
      });

      const headers = await AdminClientService.getHeaders({ token: 'explicit-jwt' });
      expect(headers['Authorization']).toBe('Bearer explicit-jwt');
    });
  });
});
