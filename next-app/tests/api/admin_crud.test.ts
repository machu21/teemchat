import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://pirpqkbdayorovfzczpq.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key-test-value';
  process.env.ADMIN_SECRET_KEY = 'super-secret-admin-machine-key';
});

const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockAuditInsert = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();

const mockSupabaseAdmin = {
  auth: {
    getUser: mockGetUser,
  },
  from: mockFrom,
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseAdmin),
}));

import { GET as getCollection, POST as postCollection } from '../../src/app/api/admin/crud/[entity]/route';
import { GET as getItem, PATCH as patchItem, DELETE as deleteItem } from '../../src/app/api/admin/crud/[entity]/[id]/route';
import { defaultRateLimiter } from '../../src/lib/rateLimit';

describe('Admin Schema-Governed CRUD Engine API', () => {
  const adminId = '11111111-1111-1111-1111-111111111111';
  const entityId = '55555555-5555-5555-5555-555555555555';
  const spaceId = '66666666-6666-6666-6666-666666666666';

  beforeEach(() => {
    vi.clearAllMocks();
    defaultRateLimiter.reset();
    mockAuditInsert.mockResolvedValue({ error: null });

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

      if (table === 'admin_audit_logs') {
        return {
          insert: mockAuditInsert,
        };
      }

      // Default mock for whitelisted tables
      const crudBuilder: Record<string, unknown> = {
        select: vi.fn().mockImplementation(() => crudBuilder),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'new-id', name: 'Created Item' },
              error: null,
            }),
          }),
        }),
        update: mockUpdate.mockImplementation(() => crudBuilder),
        delete: vi.fn().mockImplementation(() => crudBuilder),
        eq: mockEq.mockImplementation((col: string, val: string) => {
          if (val === 'not-found-id') {
            return { single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }) };
          }
          return {
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { [col]: val, name: 'Sample Item', active: true },
                error: null,
              }),
            }),
            single: vi.fn().mockResolvedValue({
              data: { [col]: val, name: 'Sample Item', active: true },
              error: null,
            }),
            then: (onfulfilled: (res: { error: null }) => unknown) => Promise.resolve(onfulfilled({ error: null })),
          };
        }),
        order: mockOrder.mockImplementation(() => crudBuilder),
        range: vi.fn().mockResolvedValue({
          data: [{ id: entityId, name: 'Sample Item' }],
          count: 1,
          error: null,
        }),
      };
      return crudBuilder;
    });
  });

  describe('RBAC & Auth Boundaries', () => {
    it('rejects unauthenticated requests on all 5 CRUD operations with 401', async () => {
      const getColReq = new NextRequest('http://localhost:3000/api/admin/crud/spaces');
      expect((await getCollection(getColReq, { params: Promise.resolve({ entity: 'spaces' }) })).status).toBe(401);

      const postColReq = new NextRequest('http://localhost:3000/api/admin/crud/spaces', { method: 'POST', body: '{}' });
      expect((await postCollection(postColReq, { params: Promise.resolve({ entity: 'spaces' }) })).status).toBe(401);

      const getItemReq = new NextRequest(`http://localhost:3000/api/admin/crud/spaces/${entityId}`);
      expect((await getItem(getItemReq, { params: Promise.resolve({ entity: 'spaces', id: entityId }) })).status).toBe(401);

      const patchItemReq = new NextRequest(`http://localhost:3000/api/admin/crud/spaces/${entityId}`, { method: 'PATCH', body: '{}' });
      expect((await patchItem(patchItemReq, { params: Promise.resolve({ entity: 'spaces', id: entityId }) })).status).toBe(401);

      const delItemReq = new NextRequest(`http://localhost:3000/api/admin/crud/spaces/${entityId}`, { method: 'DELETE' });
      expect((await deleteItem(delItemReq, { params: Promise.resolve({ entity: 'spaces', id: entityId }) })).status).toBe(401);
    });

    it('rejects non-admin users with 403', async () => {
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

      const req = new NextRequest('http://localhost:3000/api/admin/crud/spaces', {
        headers: { authorization: 'Bearer user-token' },
      });
      const res = await getCollection(req, { params: Promise.resolve({ entity: 'spaces' }) });
      expect(res.status).toBe(403);
    });
  });

  describe('Entity Whitelisting Validation (All 5 Methods)', () => {
    it('rejects non-whitelisted database tables with 400 across all 5 methods', async () => {
      const headers = { authorization: 'Bearer token', 'content-type': 'application/json' };
      const nonWhitelisted = 'auth_users';

      // 1. GET collection
      const getColRes = await getCollection(new NextRequest('http://localhost:3000/api/admin/crud/auth_users', { headers }), {
        params: Promise.resolve({ entity: nonWhitelisted }),
      });
      expect(getColRes.status).toBe(400);

      // 2. POST collection
      const postColRes = await postCollection(new NextRequest('http://localhost:3000/api/admin/crud/auth_users', { method: 'POST', headers, body: '{}' }), {
        params: Promise.resolve({ entity: nonWhitelisted }),
      });
      expect(postColRes.status).toBe(400);

      // 3. GET item
      const getItemRes = await getItem(new NextRequest('http://localhost:3000/api/admin/crud/auth_users/123', { headers }), {
        params: Promise.resolve({ entity: nonWhitelisted, id: '123' }),
      });
      expect(getItemRes.status).toBe(400);

      // 4. PATCH item
      const patchItemRes = await patchItem(new NextRequest('http://localhost:3000/api/admin/crud/auth_users/123', { method: 'PATCH', headers, body: '{}' }), {
        params: Promise.resolve({ entity: nonWhitelisted, id: '123' }),
      });
      expect(patchItemRes.status).toBe(400);

      // 5. DELETE item
      const delItemRes = await deleteItem(new NextRequest('http://localhost:3000/api/admin/crud/auth_users/123', { method: 'DELETE', headers }), {
        params: Promise.resolve({ entity: nonWhitelisted, id: '123' }),
      });
      expect(delItemRes.status).toBe(400);
    });
  });

  describe('Dynamic Primary Key Resolution (space_settings -> space_id)', () => {
    it('uses space_id primary key when querying space_settings via GET', async () => {
      const req = new NextRequest(`http://localhost:3000/api/admin/crud/space_settings/${spaceId}`, {
        headers: { authorization: 'Bearer token' },
      });

      const res = await getItem(req, { params: Promise.resolve({ entity: 'space_settings', id: spaceId }) });
      expect(res.status).toBe(200);

      expect(mockEq).toHaveBeenCalledWith('space_id', spaceId);
    });

    it('uses space_id primary key when updating space_settings via PATCH', async () => {
      const req = new NextRequest(`http://localhost:3000/api/admin/crud/space_settings/${spaceId}`, {
        method: 'PATCH',
        headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
        body: JSON.stringify({ default_spawn_x: 750.0 }),
      });

      const res = await patchItem(req, { params: Promise.resolve({ entity: 'space_settings', id: spaceId }) });
      expect(res.status).toBe(200);

      expect(mockEq).toHaveBeenCalledWith('space_id', spaceId);
    });

    it('uses space_id primary key when deleting space_settings via DELETE', async () => {
      const req = new NextRequest(`http://localhost:3000/api/admin/crud/space_settings/${spaceId}`, {
        method: 'DELETE',
        headers: { authorization: 'Bearer token' },
      });

      const res = await deleteItem(req, { params: Promise.resolve({ entity: 'space_settings', id: spaceId }) });
      expect(res.status).toBe(200);

      expect(mockEq).toHaveBeenCalledWith('space_id', spaceId);
    });
  });

  describe('Conditional updated_at Injection', () => {
    it('injects updated_at when updating entities that have the column (spaces)', async () => {
      const req = new NextRequest(`http://localhost:3000/api/admin/crud/spaces/${entityId}`, {
        method: 'PATCH',
        headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'HQ Spaces' }),
      });

      const res = await patchItem(req, { params: Promise.resolve({ entity: 'spaces', id: entityId }) });
      expect(res.status).toBe(200);

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'HQ Spaces',
          updated_at: expect.any(String),
        })
      );
    });

    it('does NOT inject updated_at when updating entities without the column (space_roles)', async () => {
      const req = new NextRequest(`http://localhost:3000/api/admin/crud/space_roles/${entityId}`, {
        method: 'PATCH',
        headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Co-Host', priority: 5 }),
      });

      const res = await patchItem(req, { params: Promise.resolve({ entity: 'space_roles', id: entityId }) });
      expect(res.status).toBe(200);

      expect(mockUpdate).toHaveBeenCalledWith({
        name: 'Co-Host',
        priority: 5,
      });
    });
  });

  describe('Default Sorting Fallbacks', () => {
    it('defaults space_roles sorting to priority instead of created_at', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/crud/space_roles', {
        headers: { authorization: 'Bearer token' },
      });

      const res = await getCollection(req, { params: Promise.resolve({ entity: 'space_roles' }) });
      expect(res.status).toBe(200);

      expect(mockOrder).toHaveBeenCalledWith('priority', { ascending: false });
    });

    it('defaults space_settings sorting to updated_at', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/crud/space_settings', {
        headers: { authorization: 'Bearer token' },
      });

      const res = await getCollection(req, { params: Promise.resolve({ entity: 'space_settings' }) });
      expect(res.status).toBe(200);

      expect(mockOrder).toHaveBeenCalledWith('updated_at', { ascending: false });
    });
  });

  describe('Standard Operations & Audit Assertions', () => {
    it('creates record and logs audit action with target table and record id', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/crud/spaces', {
        method: 'POST',
        headers: {
          authorization: 'Bearer token',
          'content-type': 'application/json',
          'x-forwarded-for': '198.51.100.32',
        },
        body: JSON.stringify({ name: 'HQ Meeting Space', visibility: 'public' }),
      });

      const res = await postCollection(req, { params: Promise.resolve({ entity: 'spaces' }) });
      expect(res.status).toBe(201);

      expect(mockAuditInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'crud_create_spaces',
          target_table: 'spaces',
          target_id: 'new-id',
        })
      );
    });

    it('updates record and logs audit action with changes_before and changes_after', async () => {
      const req = new NextRequest(`http://localhost:3000/api/admin/crud/spaces/${entityId}`, {
        method: 'PATCH',
        headers: {
          authorization: 'Bearer token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ name: 'Updated Space' }),
      });

      const res = await patchItem(req, { params: Promise.resolve({ entity: 'spaces', id: entityId }) });
      expect(res.status).toBe(200);

      expect(mockAuditInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'crud_update_spaces',
          target_table: 'spaces',
          target_id: entityId,
        })
      );
    });

    it('deletes record and logs audit action with null changes_after', async () => {
      const req = new NextRequest(`http://localhost:3000/api/admin/crud/spaces/${entityId}`, {
        method: 'DELETE',
        headers: { authorization: 'Bearer token' },
      });

      const res = await deleteItem(req, { params: Promise.resolve({ entity: 'spaces', id: entityId }) });
      expect(res.status).toBe(200);

      expect(mockAuditInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'crud_delete_spaces',
          target_table: 'spaces',
          target_id: entityId,
          changes_after: null,
        })
      );
    });

    it('rejects POST and PATCH with non-object JSON body with 400', async () => {
      const postReq = new NextRequest('http://localhost:3000/api/admin/crud/spaces', {
        method: 'POST',
        headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
        body: JSON.stringify(['array', 'not', 'allowed']),
      });
      expect((await postCollection(postReq, { params: Promise.resolve({ entity: 'spaces' }) })).status).toBe(400);

      const patchReq = new NextRequest(`http://localhost:3000/api/admin/crud/spaces/${entityId}`, {
        method: 'PATCH',
        headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
        body: JSON.stringify('string not allowed'),
      });
      expect((await patchItem(patchReq, { params: Promise.resolve({ entity: 'spaces', id: entityId }) })).status).toBe(400);
    });

    it('returns 404 on GET, PATCH, and DELETE when record is not found', async () => {
      const headers = { authorization: 'Bearer token', 'content-type': 'application/json' };

      const getRes = await getItem(new NextRequest('http://localhost:3000/api/admin/crud/spaces/not-found-id', { headers }), {
        params: Promise.resolve({ entity: 'spaces', id: 'not-found-id' }),
      });
      expect(getRes.status).toBe(404);

      const patchRes = await patchItem(new NextRequest('http://localhost:3000/api/admin/crud/spaces/not-found-id', { method: 'PATCH', headers, body: JSON.stringify({ name: 'x' }) }), {
        params: Promise.resolve({ entity: 'spaces', id: 'not-found-id' }),
      });
      expect(patchRes.status).toBe(404);

      const delRes = await deleteItem(new NextRequest('http://localhost:3000/api/admin/crud/spaces/not-found-id', { method: 'DELETE', headers }), {
        params: Promise.resolve({ entity: 'spaces', id: 'not-found-id' }),
      });
      expect(delRes.status).toBe(404);
    });
  });
});
