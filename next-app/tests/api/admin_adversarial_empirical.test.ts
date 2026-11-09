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
  rpc: vi.fn(),
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseAdmin),
}));

import { GET as verifyAuth } from '../../src/app/api/admin/auth/verify/route';
import { GET as getMetrics } from '../../src/app/api/admin/metrics/route';
import { GET as listUsers, POST as createUser } from '../../src/app/api/admin/users/route';
import { PATCH as updateUser, DELETE as deleteUser } from '../../src/app/api/admin/users/[id]/route';
import { GET as listSubs } from '../../src/app/api/admin/payments/subscriptions/route';
import { GET as listInvoices } from '../../src/app/api/admin/payments/invoices/route';
import { GET as getLogs } from '../../src/app/api/admin/logs/route';
import { GET as getCrudCol } from '../../src/app/api/admin/crud/[entity]/route';
import { defaultRateLimiter } from '../../src/lib/rateLimit';

describe('Empirical Adversarial Security Verification Suite', () => {
  const superadminId = '00000000-0000-0000-0000-000000000001';
  const adminId = '00000000-0000-0000-0000-000000000002';
  const moderatorId = '00000000-0000-0000-0000-000000000003';
  const regularUserId = '00000000-0000-0000-0000-000000000004';
  const suspendedAdminId = '00000000-0000-0000-0000-000000000005';
  const bannedAdminId = '00000000-0000-0000-0000-000000000006';
  const targetSuperadminId = '00000000-0000-0000-0000-000000000099';
  const targetNormalUserId = '00000000-0000-0000-0000-000000000088';

  beforeEach(() => {
    vi.clearAllMocks();
    defaultRateLimiter.reset();
    process.env.ADMIN_SECRET_KEY = 'super-secret-admin-machine-key';
    mockAuditInsert.mockResolvedValue({ error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'admin_audit_logs') {
        return { insert: mockAuditInsert };
      }

      if (table === 'profiles') {
        const profileBuilder: Record<string, unknown> = {
          select: vi.fn().mockImplementation(() => profileBuilder),
          eq: vi.fn().mockImplementation((col: string, val: string) => {
            if (col === 'id') {
              if (val === superadminId) {
                return {
                  single: vi.fn().mockResolvedValue({
                    data: { id: superadminId, username: 'superadmin', display_name: 'Super Admin', system_role: 'superadmin', status: 'available' },
                    error: null,
                  }),
                };
              }
              if (val === adminId) {
                return {
                  single: vi.fn().mockResolvedValue({
                    data: { id: adminId, username: 'admin', display_name: 'Regular Admin', system_role: 'admin', status: 'available' },
                    error: null,
                  }),
                };
              }
              if (val === moderatorId) {
                return {
                  single: vi.fn().mockResolvedValue({
                    data: { id: moderatorId, username: 'moderator', display_name: 'Moderator', system_role: 'moderator', status: 'available' },
                    error: null,
                  }),
                };
              }
              if (val === regularUserId) {
                return {
                  single: vi.fn().mockResolvedValue({
                    data: { id: regularUserId, username: 'user', display_name: 'Regular User', system_role: 'user', status: 'available' },
                    error: null,
                  }),
                };
              }
              if (val === suspendedAdminId) {
                return {
                  single: vi.fn().mockResolvedValue({
                    data: { id: suspendedAdminId, username: 'suspended_admin', display_name: 'Suspended Admin', system_role: 'admin', status: 'suspended' },
                    error: null,
                  }),
                };
              }
              if (val === bannedAdminId) {
                return {
                  single: vi.fn().mockResolvedValue({
                    data: { id: bannedAdminId, username: 'banned_admin', display_name: 'Banned Admin', system_role: 'admin', status: 'banned' },
                    error: null,
                  }),
                };
              }
              if (val === targetSuperadminId) {
                return {
                  single: vi.fn().mockResolvedValue({
                    data: { id: targetSuperadminId, username: 'target_super', display_name: 'Target Super', system_role: 'superadmin', status: 'available' },
                    error: null,
                  }),
                };
              }
              if (val === targetNormalUserId) {
                return {
                  single: vi.fn().mockResolvedValue({
                    data: { id: targetNormalUserId, username: 'target_user', display_name: 'Target User', system_role: 'user', status: 'available' },
                    error: null,
                  }),
                };
              }
            }
            return profileBuilder;
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: targetNormalUserId, username: 'updated_user', system_role: 'user' },
                  error: null,
                }),
              }),
            }),
          }),
        };
        return profileBuilder;
      }

      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'sample' }, error: null }),
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          }),
        }),
      };
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 1. Database Trigger Logic Verification Oracle                              */
  /* -------------------------------------------------------------------------- */
  describe('1. Database Trigger Oracle: guard_profile_system_role()', () => {
    /**
     * Exact replication of PostgreSQL trigger behavior:
     * create or replace function public.guard_profile_system_role()
     * returns trigger language plpgsql security definer
     * set search_path = public, pg_temp as $$
     * begin
     *   if (TG_OP = 'INSERT') then
     *     if new.system_role is not null and new.system_role <> 'user' then
     *       if auth.role() is distinct from 'service_role' and not public.is_system_admin(auth.uid()) then
     *         raise exception 'Unauthorized: Only system administrators can set elevated system_role';
     *       end if;
     *     end if;
     *   elsif (TG_OP = 'UPDATE') then
     *     if (old.system_role is distinct from new.system_role) then
     *       if auth.role() is distinct from 'service_role' and not public.is_system_admin(auth.uid()) then
     *         raise exception 'Unauthorized: Only system administrators can alter system_role';
     *       end if;
     *     end if;
     *   end if;
     *   return new;
     * end;
     * $$;
     */
    function simulateTrigger(params: {
      op: 'INSERT' | 'UPDATE';
      authRole: string | null;
      callerSystemRole?: string;
      newRow: { system_role?: string | null };
      oldRow?: { system_role?: string | null };
    }) {
      const isSystemAdmin =
        params.callerSystemRole === 'admin' || params.callerSystemRole === 'superadmin';
      const isServiceRole = params.authRole === 'service_role';

      if (params.op === 'INSERT') {
        if (params.newRow.system_role != null && params.newRow.system_role !== 'user') {
          if (!isServiceRole && !isSystemAdmin) {
            throw new Error('Unauthorized: Only system administrators can set elevated system_role');
          }
        }
      } else if (params.op === 'UPDATE') {
        const oldRole = params.oldRow?.system_role;
        const newRole = params.newRow.system_role;
        if (oldRole !== newRole) {
          if (!isServiceRole && !isSystemAdmin) {
            throw new Error('Unauthorized: Only system administrators can alter system_role');
          }
        }
      }
      return params.newRow;
    }

    it('rejects INSERT with system_role = admin by anonymous or authenticated non-admin', () => {
      expect(() =>
        simulateTrigger({
          op: 'INSERT',
          authRole: 'anon',
          newRow: { system_role: 'admin' },
        })
      ).toThrow('Unauthorized: Only system administrators can set elevated system_role');

      expect(() =>
        simulateTrigger({
          op: 'INSERT',
          authRole: 'authenticated',
          callerSystemRole: 'user',
          newRow: { system_role: 'admin' },
        })
      ).toThrow('Unauthorized: Only system administrators can set elevated system_role');

      expect(() =>
        simulateTrigger({
          op: 'INSERT',
          authRole: 'authenticated',
          callerSystemRole: 'moderator',
          newRow: { system_role: 'admin' },
        })
      ).toThrow('Unauthorized: Only system administrators can set elevated system_role');
    });

    it('rejects INSERT with system_role = superadmin by non-admin', () => {
      expect(() =>
        simulateTrigger({
          op: 'INSERT',
          authRole: 'authenticated',
          callerSystemRole: 'user',
          newRow: { system_role: 'superadmin' },
        })
      ).toThrow('Unauthorized: Only system administrators can set elevated system_role');
    });

    it('allows INSERT with system_role = user or null by anonymous or standard user', () => {
      expect(() =>
        simulateTrigger({
          op: 'INSERT',
          authRole: 'anon',
          newRow: { system_role: 'user' },
        })
      ).not.toThrow();

      expect(() =>
        simulateTrigger({
          op: 'INSERT',
          authRole: 'authenticated',
          callerSystemRole: 'user',
          newRow: { system_role: null },
        })
      ).not.toThrow();
    });

    it('allows INSERT with elevated system_role by service_role or existing system admin', () => {
      expect(() =>
        simulateTrigger({
          op: 'INSERT',
          authRole: 'service_role',
          newRow: { system_role: 'admin' },
        })
      ).not.toThrow();

      expect(() =>
        simulateTrigger({
          op: 'INSERT',
          authRole: 'authenticated',
          callerSystemRole: 'admin',
          newRow: { system_role: 'admin' },
        })
      ).not.toThrow();

      expect(() =>
        simulateTrigger({
          op: 'INSERT',
          authRole: 'authenticated',
          callerSystemRole: 'superadmin',
          newRow: { system_role: 'superadmin' },
        })
      ).not.toThrow();
    });

    it('rejects UPDATE elevating system_role by standard user or moderator', () => {
      expect(() =>
        simulateTrigger({
          op: 'UPDATE',
          authRole: 'authenticated',
          callerSystemRole: 'user',
          oldRow: { system_role: 'user' },
          newRow: { system_role: 'admin' },
        })
      ).toThrow('Unauthorized: Only system administrators can alter system_role');

      expect(() =>
        simulateTrigger({
          op: 'UPDATE',
          authRole: 'authenticated',
          callerSystemRole: 'moderator',
          oldRow: { system_role: 'moderator' },
          newRow: { system_role: 'superadmin' },
        })
      ).toThrow('Unauthorized: Only system administrators can alter system_role');
    });

    it('allows UPDATE when system_role is unchanged by normal users', () => {
      expect(() =>
        simulateTrigger({
          op: 'UPDATE',
          authRole: 'authenticated',
          callerSystemRole: 'user',
          oldRow: { system_role: 'user' },
          newRow: { system_role: 'user' },
        })
      ).not.toThrow();
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 2. Machine API Key Security Adversarial Attacks                             */
  /* -------------------------------------------------------------------------- */
  describe('2. Machine API Key Security Attacks', () => {
    it('rejects missing API key with 401 when no auth header is present', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/auth/verify');
      const res = await verifyAuth(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe('Unauthorized');
    });

    it('rejects incorrect machine key with 401', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/auth/verify', {
        headers: { 'x-admin-api-key': 'attacker-forged-key-value' },
      });
      const res = await verifyAuth(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.message).toContain('Invalid administrative API key');
    });

    it('rejects partial prefix match key attempt with 401 (timingSafeEqual & length guard)', async () => {
      const validKey = process.env.ADMIN_SECRET_KEY!;
      const prefixKey = validKey.slice(0, 10);
      const req = new NextRequest('http://localhost:3000/api/admin/auth/verify', {
        headers: { 'x-admin-api-key': prefixKey },
      });
      const res = await verifyAuth(req);
      expect(res.status).toBe(401);
    });

    it('rejects empty or whitespace-only machine key header with 401', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/auth/verify', {
        headers: { 'x-admin-api-key': '     ' },
      });
      const res = await verifyAuth(req);
      expect(res.status).toBe(401);
    });

    it('fails closed with 401 if ADMIN_SECRET_KEY is undefined on server', async () => {
      delete process.env.ADMIN_SECRET_KEY;

      const req = new NextRequest('http://localhost:3000/api/admin/auth/verify', {
        headers: { 'x-admin-api-key': 'super-secret-admin-machine-key' },
      });
      const res = await verifyAuth(req);
      expect(res.status).toBe(401);
    });

    it('fails closed with 401 if ADMIN_SECRET_KEY is empty string on server', async () => {
      process.env.ADMIN_SECRET_KEY = '';

      const req = new NextRequest('http://localhost:3000/api/admin/auth/verify', {
        headers: { 'x-admin-api-key': '' },
      });
      const res = await verifyAuth(req);
      expect(res.status).toBe(401);
    });

    it('accepts exact match machine key with 200 and assigns superadmin context', async () => {
      process.env.ADMIN_SECRET_KEY = 'super-secret-admin-machine-key';
      const req = new NextRequest('http://localhost:3000/api/admin/auth/verify', {
        headers: { 'x-admin-api-key': 'super-secret-admin-machine-key' },
      });
      const res = await verifyAuth(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.verified).toBe(true);
      expect(data.admin.isMachineKey).toBe(true);
      expect(data.admin.systemRole).toBe('superadmin');
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 3. Privilege Escalation & Role Boundary Defense                            */
  /* -------------------------------------------------------------------------- */
  describe('3. Privilege Escalation & Role Boundary Defense', () => {
    it('blocks anonymous users across all admin endpoints with 401', async () => {
      const endpoints = [
        () => verifyAuth(new NextRequest('http://localhost:3000/api/admin/auth/verify')),
        () => getMetrics(new NextRequest('http://localhost:3000/api/admin/metrics')),
        () => listUsers(new NextRequest('http://localhost:3000/api/admin/users')),
        () => listSubs(new NextRequest('http://localhost:3000/api/admin/payments/subscriptions')),
        () => listInvoices(new NextRequest('http://localhost:3000/api/admin/payments/invoices')),
        () => getLogs(new NextRequest('http://localhost:3000/api/admin/logs')),
        () => getCrudCol(new NextRequest('http://localhost:3000/api/admin/crud/spaces'), { params: Promise.resolve({ entity: 'spaces' }) }),
      ];

      for (const call of endpoints) {
        const res = await call();
        expect(res.status).toBe(401);
      }
    });

    it('blocks standard user (system_role = user) across admin endpoints with 403', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: regularUserId, email: 'user@example.com' } },
        error: null,
      });

      const endpoints = [
        () => verifyAuth(new NextRequest('http://localhost:3000/api/admin/auth/verify', { headers: { authorization: 'Bearer tok' } })),
        () => getMetrics(new NextRequest('http://localhost:3000/api/admin/metrics', { headers: { authorization: 'Bearer tok' } })),
        () => listUsers(new NextRequest('http://localhost:3000/api/admin/users', { headers: { authorization: 'Bearer tok' } })),
        () => listSubs(new NextRequest('http://localhost:3000/api/admin/payments/subscriptions', { headers: { authorization: 'Bearer tok' } })),
        () => listInvoices(new NextRequest('http://localhost:3000/api/admin/payments/invoices', { headers: { authorization: 'Bearer tok' } })),
        () => getLogs(new NextRequest('http://localhost:3000/api/admin/logs', { headers: { authorization: 'Bearer tok' } })),
        () => getCrudCol(new NextRequest('http://localhost:3000/api/admin/crud/spaces', { headers: { authorization: 'Bearer tok' } }), { params: Promise.resolve({ entity: 'spaces' }) }),
      ];

      for (const call of endpoints) {
        const res = await call();
        expect(res.status).toBe(403);
      }
    });

    it('blocks moderator (system_role = moderator) across admin endpoints with 403', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: moderatorId, email: 'mod@example.com' } },
        error: null,
      });

      const endpoints = [
        () => verifyAuth(new NextRequest('http://localhost:3000/api/admin/auth/verify', { headers: { authorization: 'Bearer tok' } })),
        () => getMetrics(new NextRequest('http://localhost:3000/api/admin/metrics', { headers: { authorization: 'Bearer tok' } })),
        () => listUsers(new NextRequest('http://localhost:3000/api/admin/users', { headers: { authorization: 'Bearer tok' } })),
        () => listSubs(new NextRequest('http://localhost:3000/api/admin/payments/subscriptions', { headers: { authorization: 'Bearer tok' } })),
      ];

      for (const call of endpoints) {
        const res = await call();
        expect(res.status).toBe(403);
      }
    });

    it('rejects suspended admin tokens with 403', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: suspendedAdminId, email: 'suspended@teemchat.chat' } },
        error: null,
      });

      const req = new NextRequest('http://localhost:3000/api/admin/auth/verify', {
        headers: { authorization: 'Bearer suspended-token' },
      });
      const res = await verifyAuth(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.message).toContain('Administrative account is suspended or banned');
    });

    it('rejects banned admin tokens with 403', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: bannedAdminId, email: 'banned@teemchat.chat' } },
        error: null,
      });

      const req = new NextRequest('http://localhost:3000/api/admin/auth/verify', {
        headers: { authorization: 'Bearer banned-token' },
      });
      const res = await verifyAuth(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.message).toContain('Administrative account is suspended or banned');
    });

    it('blocks standard admin from creating admin or superadmin via POST /api/admin/users', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: adminId, email: 'admin@teemchat.chat' } },
        error: null,
      });

      const postReqAdmin = new NextRequest('http://localhost:3000/api/admin/users', {
        method: 'POST',
        headers: { authorization: 'Bearer tok', 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'newadmin@test.com', password: 'ValidPassword123!', systemRole: 'admin' }),
      });
      const resAdmin = await createUser(postReqAdmin);
      expect(resAdmin.status).toBe(403);
      expect((await resAdmin.json()).message).toContain('Only a superadmin can provision accounts with admin privileges');

      const postReqSuper = new NextRequest('http://localhost:3000/api/admin/users', {
        method: 'POST',
        headers: { authorization: 'Bearer tok', 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'newsuper@test.com', password: 'ValidPassword123!', systemRole: 'superadmin' }),
      });
      const resSuper = await createUser(postReqSuper);
      expect(resSuper.status).toBe(403);
    });

    it('blocks standard admin from updating system_role via PATCH /api/admin/users/[id]', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: adminId, email: 'admin@teemchat.chat' } },
        error: null,
      });

      const patchReq = new NextRequest(`http://localhost:3000/api/admin/users/${targetNormalUserId}`, {
        method: 'PATCH',
        headers: { authorization: 'Bearer tok', 'content-type': 'application/json' },
        body: JSON.stringify({ systemRole: 'admin' }),
      });
      const res = await updateUser(patchReq, { params: Promise.resolve({ id: targetNormalUserId }) });
      expect(res.status).toBe(403);
      expect((await res.json()).message).toContain('Only a superadmin can modify system roles');
    });

    it('blocks standard admin from modifying or resetting password of a superadmin', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: adminId, email: 'admin@teemchat.chat' } },
        error: null,
      });

      const patchReq = new NextRequest(`http://localhost:3000/api/admin/users/${targetSuperadminId}`, {
        method: 'PATCH',
        headers: { authorization: 'Bearer tok', 'content-type': 'application/json' },
        body: JSON.stringify({ password: 'AttackerNewPassword123!' }),
      });
      const res = await updateUser(patchReq, { params: Promise.resolve({ id: targetSuperadminId }) });
      expect(res.status).toBe(403);
      expect((await res.json()).message).toContain('Only a superadmin can modify another superadmin');
    });

    it('blocks standard admin from deleting or soft-banning a superadmin', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: adminId, email: 'admin@teemchat.chat' } },
        error: null,
      });

      const delReq = new NextRequest(`http://localhost:3000/api/admin/users/${targetSuperadminId}`, {
        method: 'DELETE',
        headers: { authorization: 'Bearer tok' },
      });
      const res = await deleteUser(delReq, { params: Promise.resolve({ id: targetSuperadminId }) });
      expect(res.status).toBe(403);
      expect((await res.json()).message).toContain('Only a superadmin can remove another superadmin');
    });

    it('blocks admins from deleting their own account', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: adminId, email: 'admin@teemchat.chat' } },
        error: null,
      });

      const delSelfReq = new NextRequest(`http://localhost:3000/api/admin/users/${adminId}`, {
        method: 'DELETE',
        headers: { authorization: 'Bearer tok' },
      });
      const res = await deleteUser(delSelfReq, { params: Promise.resolve({ id: adminId }) });
      expect(res.status).toBe(403);
      expect((await res.json()).message).toContain('cannot delete your own account');
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 4. Audit Trail Integrity & Completeness Verification                       */
  /* -------------------------------------------------------------------------- */
  describe('4. Audit Trail Integrity Across Mutating Operations', () => {
    it('records valid audit log for user creation (POST /api/admin/users)', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: superadminId, email: 'super@teemchat.chat' } },
        error: null,
      });

      mockAdminCreateUser.mockResolvedValueOnce({
        data: { user: { id: 'created-user-id', email: 'created@example.com' } },
        error: null,
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === 'admin_audit_logs') return { insert: mockAuditInsert };
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
                  data: { id: 'created-user-id', username: 'created', system_role: 'user' },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      });

      const req = new NextRequest('http://localhost:3000/api/admin/users', {
        method: 'POST',
        headers: { authorization: 'Bearer tok', 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'created@example.com', password: 'ValidPassword123!', username: 'created', displayName: 'Created' }),
      });

      const res = await createUser(req);
      expect(res.status).toBe(201);

      expect(mockAuditInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          admin_id: superadminId,
          action: 'create_user',
          target_table: 'profiles',
          target_id: 'created-user-id',
        })
      );
    });

    it('records valid audit log for password reset by superadmin', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: superadminId, email: 'super@teemchat.chat' } },
        error: null,
      });
      mockAdminUpdateUserById.mockResolvedValueOnce({ error: null });

      const req = new NextRequest(`http://localhost:3000/api/admin/users/${targetNormalUserId}`, {
        method: 'PATCH',
        headers: { authorization: 'Bearer tok', 'content-type': 'application/json' },
        body: JSON.stringify({ password: 'SuperReset12345!' }),
      });

      const res = await updateUser(req, { params: Promise.resolve({ id: targetNormalUserId }) });
      expect(res.status).toBe(200);

      expect(mockAuditInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          admin_id: superadminId,
          action: 'update_user',
          target_table: 'profiles',
          target_id: targetNormalUserId,
          changes_after: expect.objectContaining({ credential_updated: true }),
        })
      );
    });

    it('records valid audit log for soft delete (suspend_user)', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: adminId, email: 'admin@teemchat.chat' } },
        error: null,
      });
      mockAdminUpdateUserById.mockResolvedValueOnce({ error: null });

      const req = new NextRequest(`http://localhost:3000/api/admin/users/${targetNormalUserId}`, {
        method: 'DELETE',
        headers: { authorization: 'Bearer tok' },
      });

      const res = await deleteUser(req, { params: Promise.resolve({ id: targetNormalUserId }) });
      expect(res.status).toBe(200);

      expect(mockAuditInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          admin_id: adminId,
          action: 'suspend_user',
          target_table: 'profiles',
          target_id: targetNormalUserId,
          changes_after: { status: 'banned' },
        })
      );
    });

    it('records valid audit log for hard delete (delete_user_hard)', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: superadminId, email: 'super@teemchat.chat' } },
        error: null,
      });
      mockAdminDeleteUser.mockResolvedValueOnce({ error: null });

      const req = new NextRequest(`http://localhost:3000/api/admin/users/${targetNormalUserId}?mode=hard`, {
        method: 'DELETE',
        headers: { authorization: 'Bearer tok' },
      });

      const res = await deleteUser(req, { params: Promise.resolve({ id: targetNormalUserId }) });
      expect(res.status).toBe(200);

      expect(mockAuditInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          admin_id: superadminId,
          action: 'delete_user_hard',
          target_table: 'profiles',
          target_id: targetNormalUserId,
          changes_after: null,
        })
      );
    });

    it('does NOT record mutating audit log when an operation is rejected as forbidden', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: adminId, email: 'admin@teemchat.chat' } },
        error: null,
      });

      const patchReq = new NextRequest(`http://localhost:3000/api/admin/users/${targetSuperadminId}`, {
        method: 'PATCH',
        headers: { authorization: 'Bearer tok', 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: 'Hacked' }),
      });

      const res = await updateUser(patchReq, { params: Promise.resolve({ id: targetSuperadminId }) });
      expect(res.status).toBe(403);

      expect(mockAuditInsert).not.toHaveBeenCalled();
    });
  });
});
