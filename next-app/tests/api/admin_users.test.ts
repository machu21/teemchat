import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://pirpqkbdayorovfzczpq.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key-test-value';
  process.env.ADMIN_SECRET_KEY = 'super-secret-admin-machine-key';
});

const mockGetUser = vi.fn();
const mockAdminCreateUser = vi.fn();
const mockAdminUpdateUserById = vi.fn();
const mockAdminDeleteUser = vi.fn();
const mockAdminGetUserById = vi.fn();
const mockFrom = vi.fn();
const mockAuditInsert = vi.fn();

const mockSupabaseAdmin = {
  auth: {
    getUser: mockGetUser,
    admin: {
      createUser: mockAdminCreateUser,
      deleteUser: mockAdminDeleteUser,
      updateUserById: mockAdminUpdateUserById,
      getUserById: mockAdminGetUserById,
    },
  },
  from: mockFrom,
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseAdmin),
}));

import { GET as listUsers, POST as createUser } from '../../src/app/api/admin/users/route';
import { GET as getUser, PATCH as updateUser, DELETE as deleteUser } from '../../src/app/api/admin/users/[id]/route';
import { defaultRateLimiter } from '../../src/lib/rateLimit';

describe('Admin Users Management API', () => {
  const adminId = '11111111-1111-1111-1111-111111111111';
  const superadminId = '99999999-9999-9999-9999-999999999999';
  const targetUserId = '22222222-2222-2222-2222-222222222222';
  const superadminTargetId = '88888888-8888-8888-8888-888888888888';

  const setupAdminCaller = (role: 'admin' | 'superadmin' = 'admin', id = adminId) => {
    mockGetUser.mockResolvedValue({
      data: { user: { id, email: `${role}@teemchat.chat` } },
      error: null,
    });

    mockAdminGetUserById.mockResolvedValue({
      data: { user: { id: targetUserId, email: 'target@example.com' } },
      error: null,
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        const queryBuilder: Record<string, unknown> = {
          select: vi.fn().mockImplementation(() => queryBuilder),
          eq: vi.fn().mockImplementation((col: string, val: string) => {
            if (col === 'id') {
              if (val === id) {
                return {
                  single: vi.fn().mockResolvedValue({
                    data: { id, username: role, display_name: `${role} User`, system_role: role, status: 'available' },
                    error: null,
                  }),
                };
              }
              if (val === superadminTargetId) {
                return {
                  single: vi.fn().mockResolvedValue({
                    data: { id: val, username: 'super_target', display_name: 'Target Super', system_role: 'superadmin', status: 'available' },
                    error: null,
                  }),
                };
              }
              return {
                single: vi.fn().mockResolvedValue({
                  data: { id: val, username: 'target', display_name: 'Target User', system_role: 'user', status: 'available' },
                  error: null,
                }),
              };
            }
            return queryBuilder;
          }),
          or: vi.fn().mockImplementation(() => queryBuilder),
          order: vi.fn().mockImplementation(() => queryBuilder),
          range: vi.fn().mockResolvedValue({
            data: [
              { id: targetUserId, username: 'player_one', display_name: 'Player One', system_role: 'user' },
            ],
            count: 1,
            error: null,
          }),
          upsert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'new-id', username: 'newbie', display_name: 'Newbie', system_role: 'user' },
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: targetUserId, username: 'updated_name', display_name: 'Updated Name', system_role: 'user' },
                  error: null,
                }),
              }),
            }),
          }),
        };
        return queryBuilder;
      }

      if (table === 'admin_audit_logs') {
        return {
          insert: mockAuditInsert,
        };
      }

      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [] }),
            }),
          }),
        }),
      };
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuditInsert.mockResolvedValue({ error: null });
    defaultRateLimiter.reset();
  });

  describe('RBAC & Authentication Boundaries (All User Endpoints)', () => {
    it('rejects unauthenticated requests on all user endpoints with 401', async () => {
      const getReq = new NextRequest('http://localhost:3000/api/admin/users');
      expect((await listUsers(getReq)).status).toBe(401);

      const postReq = new NextRequest('http://localhost:3000/api/admin/users', { method: 'POST', body: '{}' });
      expect((await createUser(postReq)).status).toBe(401);

      const getIdReq = new NextRequest(`http://localhost:3000/api/admin/users/${targetUserId}`);
      expect((await getUser(getIdReq, { params: Promise.resolve({ id: targetUserId }) })).status).toBe(401);

      const patchReq = new NextRequest(`http://localhost:3000/api/admin/users/${targetUserId}`, { method: 'PATCH', body: '{}' });
      expect((await updateUser(patchReq, { params: Promise.resolve({ id: targetUserId }) })).status).toBe(401);

      const delReq = new NextRequest(`http://localhost:3000/api/admin/users/${targetUserId}`, { method: 'DELETE' });
      expect((await deleteUser(delReq, { params: Promise.resolve({ id: targetUserId }) })).status).toBe(401);
    });

    it('rejects regular users (system_role = user) with 403 across endpoints', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'regular-user-id', email: 'user@example.com' } },
        error: null,
      });

      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'regular-user-id', username: 'user', display_name: 'User', system_role: 'user', status: 'available' },
              error: null,
            }),
          }),
        }),
      });

      const getReq = new NextRequest('http://localhost:3000/api/admin/users', { headers: { authorization: 'Bearer user-token' } });
      expect((await listUsers(getReq)).status).toBe(403);
    });
  });

  describe('GET /api/admin/users', () => {
    it('returns paginated list of users', async () => {
      setupAdminCaller('admin');

      const req = new NextRequest('http://localhost:3000/api/admin/users?page=1&limit=10', {
        headers: { authorization: 'Bearer token', 'x-forwarded-for': '198.51.100.1' },
      });

      const res = await listUsers(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.users).toHaveLength(1);
      expect(body.pagination.total).toBe(1);
      expect(body.pagination.page).toBe(1);
    });

    it('rejects invalid query parameters (e.g. limit > 100) with 400', async () => {
      setupAdminCaller('admin');

      const req = new NextRequest('http://localhost:3000/api/admin/users?limit=500', {
        headers: { authorization: 'Bearer token' },
      });

      const res = await listUsers(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Invalid query parameters');
    });

    it('sanitizes search input with commas and parentheses to prevent query crashes', async () => {
      setupAdminCaller('admin');

      const req = new NextRequest('http://localhost:3000/api/admin/users?search=John%2C%20Jr.%20(admin)', {
        headers: { authorization: 'Bearer token' },
      });

      const res = await listUsers(req);
      expect(res.status).toBe(200);
    });

    it('filters by status, role, and tier', async () => {
      setupAdminCaller('admin');

      const req = new NextRequest('http://localhost:3000/api/admin/users?status=banned&role=moderator&tier=enterprise', {
        headers: { authorization: 'Bearer token' },
      });

      const res = await listUsers(req);
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/admin/users', () => {
    it('creates a new user with auto-confirmation, provisions profile, and logs audit', async () => {
      setupAdminCaller('superadmin', superadminId);

      mockAdminCreateUser.mockResolvedValueOnce({
        data: {
          user: {
            id: '33333333-3333-3333-3333-333333333333',
            email: 'newuser@example.com',
          },
        },
        error: null,
      });

      const req = new NextRequest('http://localhost:3000/api/admin/users', {
        method: 'POST',
        headers: {
          authorization: 'Bearer token',
          'content-type': 'application/json',
          'x-forwarded-for': '198.51.100.2',
        },
        body: JSON.stringify({
          email: 'newuser@example.com',
          password: 'ValidPassword123!',
          username: 'newbie',
          displayName: 'Newbie User',
          tier: 'pro',
          systemRole: 'user',
          autoConfirm: true,
        }),
      });

      const res = await createUser(req);
      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.message).toContain('User created successfully');
      expect(mockAdminCreateUser).toHaveBeenCalledWith({
        email: 'newuser@example.com',
        password: 'ValidPassword123!',
        email_confirm: true,
        user_metadata: {
          username: 'newbie',
          display_name: 'Newbie User',
          gender: 'male',
        },
      });

      // Assert audit logging
      expect(mockAuditInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'create_user',
          target_table: 'profiles',
          target_id: '33333333-3333-3333-3333-333333333333',
          changes_after: expect.objectContaining({
            email: 'newuser@example.com',
            tier: 'pro',
            systemRole: 'user',
          }),
        })
      );
    });

    it('rejects creation when email or password is invalid', async () => {
      setupAdminCaller('admin');

      const req = new NextRequest('http://localhost:3000/api/admin/users', {
        method: 'POST',
        headers: {
          authorization: 'Bearer token',
          'content-type': 'application/json',
          'x-forwarded-for': '198.51.100.3',
        },
        body: JSON.stringify({
          email: 'not-an-email',
          password: 'short',
        }),
      });

      const res = await createUser(req);
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toBe('Validation failed');
    });

    it('prevents regular admin from creating another admin or superadmin', async () => {
      setupAdminCaller('admin');

      const req = new NextRequest('http://localhost:3000/api/admin/users', {
        method: 'POST',
        headers: {
          authorization: 'Bearer token',
          'content-type': 'application/json',
          'x-forwarded-for': '198.51.100.4',
        },
        body: JSON.stringify({
          email: 'coadmin@example.com',
          password: 'ValidPassword123!',
          systemRole: 'admin',
        }),
      });

      const res = await createUser(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.message).toContain('Only a superadmin can provision accounts with admin privileges');
    });

    it('rolls back created auth user and returns 400 if profile upsert fails', async () => {
      setupAdminCaller('superadmin', superadminId);

      const createdAuthId = '44444444-4444-4444-4444-444444444444';
      mockAdminCreateUser.mockResolvedValueOnce({
        data: {
          user: { id: createdAuthId, email: 'collision@example.com' },
        },
        error: null,
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: superadminId, username: 'superadmin', display_name: 'Super', system_role: 'superadmin', status: 'available' },
                  error: null,
                }),
              }),
            }),
            upsert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: null,
                  error: { message: 'duplicate key value violates unique constraint' },
                }),
              }),
            }),
          };
        }
        return {};
      });

      const req = new NextRequest('http://localhost:3000/api/admin/users', {
        method: 'POST',
        headers: {
          authorization: 'Bearer token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          email: 'collision@example.com',
          password: 'ValidPassword123!',
          username: 'collision',
          displayName: 'Collision User',
        }),
      });

      const res = await createUser(req);
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toContain('Failed to provision user profile');
      expect(mockAdminDeleteUser).toHaveBeenCalledWith(createdAuthId);
    });
  });

  describe('GET /api/admin/users/[id]', () => {
    it('returns a comprehensive user dossier', async () => {
      setupAdminCaller('admin');

      const req = new NextRequest(`http://localhost:3000/api/admin/users/${targetUserId}`, {
        headers: {
          authorization: 'Bearer token',
          'x-forwarded-for': '198.51.100.9',
        },
      });

      const res = await getUser(req, { params: Promise.resolve({ id: targetUserId }) });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.user.id).toBe(targetUserId);
      expect(body.user.profile.username).toBe('target');
    });

    it('returns 404 when user is not found in profiles', async () => {
      setupAdminCaller('admin');

      mockFrom.mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation((col: string, val: string) => {
                if (val === adminId) {
                  return {
                    single: vi.fn().mockResolvedValue({
                      data: { id: adminId, username: 'admin', display_name: 'Admin', system_role: 'admin', status: 'available' },
                      error: null,
                    }),
                  };
                }
                return {
                  single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
                };
              }),
            }),
          };
        }
        return {};
      });

      const req = new NextRequest('http://localhost:3000/api/admin/users/non-existent-id', {
        headers: { authorization: 'Bearer token' },
      });

      const res = await getUser(req, { params: Promise.resolve({ id: 'non-existent-id' }) });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe('User not found');
    });
  });

  describe('PATCH /api/admin/users/[id]', () => {
    it('updates user profile and records audit log', async () => {
      setupAdminCaller('admin');

      const req = new NextRequest(`http://localhost:3000/api/admin/users/${targetUserId}`, {
        method: 'PATCH',
        headers: {
          authorization: 'Bearer token',
          'content-type': 'application/json',
          'x-forwarded-for': '198.51.100.5',
        },
        body: JSON.stringify({
          displayName: 'Updated Name',
          status: 'busy',
        }),
      });

      const res = await updateUser(req, { params: Promise.resolve({ id: targetUserId }) });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.message).toContain('User updated successfully');

      // Assert audit log
      expect(mockAuditInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'update_user',
          target_table: 'profiles',
          target_id: targetUserId,
          changes_before: expect.objectContaining({ username: 'target' }),
          changes_after: expect.objectContaining({ username: 'updated_name' }),
        })
      );
    });

    it('guards against regular admin modifying or resetting password of a superadmin', async () => {
      setupAdminCaller('admin');

      const req = new NextRequest(`http://localhost:3000/api/admin/users/${superadminTargetId}`, {
        method: 'PATCH',
        headers: {
          authorization: 'Bearer token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          password: 'NewAttackerPassword123!',
          status: 'banned',
        }),
      });

      const res = await updateUser(req, { params: Promise.resolve({ id: superadminTargetId }) });
      expect(res.status).toBe(403);

      const body = await res.json();
      expect(body.message).toContain('Only a superadmin can modify another superadmin');
    });

    it('records credential update in audit log when superadmin resets password', async () => {
      setupAdminCaller('superadmin', superadminId);
      mockAdminUpdateUserById.mockResolvedValueOnce({ error: null });

      const req = new NextRequest(`http://localhost:3000/api/admin/users/${targetUserId}`, {
        method: 'PATCH',
        headers: {
          authorization: 'Bearer token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          password: 'NewSecurePassword123!',
        }),
      });

      const res = await updateUser(req, { params: Promise.resolve({ id: targetUserId }) });
      expect(res.status).toBe(200);

      expect(mockAdminUpdateUserById).toHaveBeenCalledWith(targetUserId, { password: 'NewSecurePassword123!' });
      expect(mockAuditInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'update_user',
          changes_after: expect.objectContaining({ credential_updated: true }),
        })
      );
    });

    it('returns 404 when target user for PATCH is not found', async () => {
      setupAdminCaller('admin');

      mockFrom.mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation((col: string, val: string) => {
                if (val === adminId) {
                  return {
                    single: vi.fn().mockResolvedValue({
                      data: { id: adminId, username: 'admin', display_name: 'Admin', system_role: 'admin', status: 'available' },
                      error: null,
                    }),
                  };
                }
                return { single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }) };
              }),
            }),
          };
        }
        return {};
      });

      const req = new NextRequest('http://localhost:3000/api/admin/users/missing-id', {
        method: 'PATCH',
        headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: 'New Name' }),
      });

      const res = await updateUser(req, { params: Promise.resolve({ id: 'missing-id' }) });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/admin/users/[id]', () => {
    it('prevents self-deletion', async () => {
      setupAdminCaller('admin', adminId);

      const req = new NextRequest(`http://localhost:3000/api/admin/users/${adminId}`, {
        method: 'DELETE',
        headers: {
          authorization: 'Bearer token',
          'x-forwarded-for': '198.51.100.6',
        },
      });

      const res = await deleteUser(req, { params: Promise.resolve({ id: adminId }) });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.message).toContain('cannot delete your own account');
    });

    it('guards against regular admin deleting a superadmin', async () => {
      setupAdminCaller('admin');

      const req = new NextRequest(`http://localhost:3000/api/admin/users/${superadminTargetId}`, {
        method: 'DELETE',
        headers: { authorization: 'Bearer token' },
      });

      const res = await deleteUser(req, { params: Promise.resolve({ id: superadminTargetId }) });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.message).toContain('Only a superadmin can remove another superadmin');
    });

    it('performs soft ban by default and logs audit', async () => {
      setupAdminCaller('admin');
      mockAdminUpdateUserById.mockResolvedValueOnce({ error: null });

      const req = new NextRequest(`http://localhost:3000/api/admin/users/${targetUserId}`, {
        method: 'DELETE',
        headers: {
          authorization: 'Bearer token',
          'x-forwarded-for': '198.51.100.7',
        },
      });

      const res = await deleteUser(req, { params: Promise.resolve({ id: targetUserId }) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.message).toContain('User suspended successfully (soft ban)');

      expect(mockAuditInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'suspend_user',
          target_table: 'profiles',
          target_id: targetUserId,
          changes_after: { status: 'banned' },
        })
      );
    });

    it('performs hard delete when mode=hard and logs audit', async () => {
      setupAdminCaller('superadmin', superadminId);
      mockAdminDeleteUser.mockResolvedValueOnce({ error: null });

      const req = new NextRequest(`http://localhost:3000/api/admin/users/${targetUserId}?mode=hard`, {
        method: 'DELETE',
        headers: {
          authorization: 'Bearer token',
          'x-forwarded-for': '198.51.100.8',
        },
      });

      const res = await deleteUser(req, { params: Promise.resolve({ id: targetUserId }) });
      expect(res.status).toBe(200);
      expect(mockAdminDeleteUser).toHaveBeenCalledWith(targetUserId);

      expect(mockAuditInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'delete_user_hard',
          target_table: 'profiles',
          target_id: targetUserId,
          changes_after: null,
        })
      );
    });

    it('returns 404 when user for DELETE is not found', async () => {
      setupAdminCaller('admin');

      mockFrom.mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation((col: string, val: string) => {
                if (val === adminId) {
                  return {
                    single: vi.fn().mockResolvedValue({
                      data: { id: adminId, username: 'admin', display_name: 'Admin', system_role: 'admin', status: 'available' },
                      error: null,
                    }),
                  };
                }
                return { single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }) };
              }),
            }),
          };
        }
        return {};
      });

      const req = new NextRequest('http://localhost:3000/api/admin/users/missing-id', {
        method: 'DELETE',
        headers: { authorization: 'Bearer token' },
      });

      const res = await deleteUser(req, { params: Promise.resolve({ id: 'missing-id' }) });
      expect(res.status).toBe(404);
    });
  });
});
