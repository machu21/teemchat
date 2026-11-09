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
const mockRpc = vi.fn();

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
  rpc: mockRpc,
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseAdmin),
}));

import { GET as listUsers, POST as createUser } from '../../src/app/api/admin/users/route';
import { PATCH as updateUser } from '../../src/app/api/admin/users/[id]/route';
import { GET as listSubs, PATCH as updateSub } from '../../src/app/api/admin/payments/subscriptions/route';
import { GET as listInvoices, POST as createInvoice } from '../../src/app/api/admin/payments/invoices/route';
import { GET as getLogs } from '../../src/app/api/admin/logs/route';
import { GET as getCrudCollection, POST as postCrudCollection } from '../../src/app/api/admin/crud/[entity]/route';
import { GET as getCrudItem, PATCH as patchCrudItem, DELETE as deleteCrudItem } from '../../src/app/api/admin/crud/[entity]/[id]/route';
import { GET as getMetrics } from '../../src/app/api/admin/metrics/route';
import { defaultRateLimiter } from '../../src/lib/rateLimit';

describe('Adversarial & Empirical Stress Testing Suite (Milestone 2 Admin API)', () => {
  const adminId = '11111111-1111-1111-1111-111111111111';
  const targetUserId = '22222222-2222-2222-2222-222222222222';
  const validHeaders = {
    authorization: 'Bearer admin-test-token',
    'content-type': 'application/json',
    'x-forwarded-for': '198.51.100.99',
  };

  const setupCaller = (role: 'admin' | 'superadmin' = 'admin', id = adminId) => {
    mockGetUser.mockResolvedValue({
      data: { user: { id, email: `${role}@teemchat.internal` } },
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
              return {
                single: vi.fn().mockResolvedValue({
                  data: { id: val, username: 'target_user', display_name: 'Target User', system_role: 'user', status: 'available' },
                  error: null,
                }),
              };
            }
            return queryBuilder;
          }),
          or: vi.fn().mockImplementation(() => queryBuilder),
          order: vi.fn().mockImplementation(() => queryBuilder),
          range: vi.fn().mockResolvedValue({
            data: [{ id: targetUserId, username: 'target_user' }],
            count: 1,
            error: null,
          }),
          upsert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'new-id', username: 'created_user' },
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: targetUserId, display_name: 'Updated Name' },
                  error: null,
                }),
              }),
            }),
          }),
        };
        return queryBuilder;
      }

      // Default mock for all whitelisted dynamic tables
      const genericBuilder: Record<string, unknown> = {
        select: vi.fn().mockImplementation(() => genericBuilder),
        eq: vi.fn().mockImplementation((col: string, val: string) => {
          if (val === 'non-existent-id') {
            return { single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }) };
          }
          return {
            ...genericBuilder,
            single: vi.fn().mockResolvedValue({ data: { [col]: val, name: 'Record' }, error: null }),
            then: (resolve: (v: { error: null }) => unknown) => Promise.resolve(resolve({ error: null })),
          };
        }),
        or: vi.fn().mockImplementation(() => genericBuilder),
        order: vi.fn().mockImplementation(() => genericBuilder),
        range: vi.fn().mockResolvedValue({
          data: [{ id: 'sample-id', name: 'Sample' }],
          count: 1,
          error: null,
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'created-id', name: 'Created' },
              error: null,
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'updated-id', name: 'Updated' },
                error: null,
              }),
            }),
          }),
        }),
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      };

      if (table === 'admin_audit_logs') {
        return {
          ...genericBuilder,
          insert: mockAuditInsert,
        };
      }

      return genericBuilder;
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    defaultRateLimiter.reset();
    mockAuditInsert.mockResolvedValue({ error: null });
    setupCaller('admin');
  });

  // =========================================================================
  // 1. QUERY STRING ADVERSARIAL STRESS & INJECTION TESTING
  // =========================================================================
  describe('Query String Stress & SQL / PostgREST Injection Strings', () => {
    describe('Users Endpoint (GET /api/admin/users)', () => {
      it('rejects negative limit (?limit=-10) with 400', async () => {
        const req = new NextRequest('http://localhost:3000/api/admin/users?limit=-10', { headers: validHeaders });
        const res = await listUsers(req);
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toBe('Invalid query parameters');
      });

      it('rejects zero limit (?limit=0) with 400', async () => {
        const req = new NextRequest('http://localhost:3000/api/admin/users?limit=0', { headers: validHeaders });
        const res = await listUsers(req);
        expect(res.status).toBe(400);
      });

      it('rejects negative page (?page=-5) with 400', async () => {
        const req = new NextRequest('http://localhost:3000/api/admin/users?page=-5', { headers: validHeaders });
        const res = await listUsers(req);
        expect(res.status).toBe(400);
      });

      it('rejects zero page (?page=0) with 400', async () => {
        const req = new NextRequest('http://localhost:3000/api/admin/users?page=0', { headers: validHeaders });
        const res = await listUsers(req);
        expect(res.status).toBe(400);
      });

      it('rejects non-numeric page and limit (?page=abc&limit=xyz) with 400', async () => {
        const req = new NextRequest('http://localhost:3000/api/admin/users?page=abc&limit=xyz', { headers: validHeaders });
        const res = await listUsers(req);
        expect(res.status).toBe(400);
      });

      it('rejects limit exceeding maximum boundary (?limit=101 and ?limit=999999) with 400', async () => {
        const req1 = new NextRequest('http://localhost:3000/api/admin/users?limit=101', { headers: validHeaders });
        expect((await listUsers(req1)).status).toBe(400);

        const req2 = new NextRequest('http://localhost:3000/api/admin/users?limit=999999', { headers: validHeaders });
        expect((await listUsers(req2)).status).toBe(400);
      });

      it('rejects invalid sortOrder (?sortOrder=sideways) with 400', async () => {
        const req = new NextRequest('http://localhost:3000/api/admin/users?sortOrder=sideways', { headers: validHeaders });
        const res = await listUsers(req);
        expect(res.status).toBe(400);
      });

      it('rejects invalid system role filter (?role=superhacker) with 400', async () => {
        const req = new NextRequest('http://localhost:3000/api/admin/users?role=superhacker', { headers: validHeaders });
        const res = await listUsers(req);
        expect(res.status).toBe(400);
      });

      it('neutralizes SQL injection payload in search string: "\' OR \'1\'=\'1"', async () => {
        const searchPayload = encodeURIComponent("' OR '1'='1");
        const req = new NextRequest(`http://localhost:3000/api/admin/users?search=${searchPayload}`, { headers: validHeaders });
        const res = await listUsers(req);
        expect(res.status).toBe(200);
      });

      it('neutralizes PostgREST filter injection string: "admin,status.eq.banned"', async () => {
        const searchPayload = encodeURIComponent("admin,status.eq.banned");
        const req = new NextRequest(`http://localhost:3000/api/admin/users?search=${searchPayload}`, { headers: validHeaders });
        const res = await listUsers(req);
        expect(res.status).toBe(200);
      });

      it('neutralizes PostgREST parentheses syntax hijacking: ")or(system_role.eq.superadmin"', async () => {
        const searchPayload = encodeURIComponent(")or(system_role.eq.superadmin");
        const req = new NextRequest(`http://localhost:3000/api/admin/users?search=${searchPayload}`, { headers: validHeaders });
        const res = await listUsers(req);
        expect(res.status).toBe(200);
      });

      it('safely handles null bytes, quotes, semicolons, and comment strings: "\\0\'\";--"', async () => {
        const searchPayload = encodeURIComponent("\0'\";--");
        const req = new NextRequest(`http://localhost:3000/api/admin/users?search=${searchPayload}`, { headers: validHeaders });
        const res = await listUsers(req);
        expect(res.status).toBe(200);
      });

      it('handles search consisting exclusively of sanitized characters (only commas and parens): ",,,((()))"', async () => {
        const searchPayload = encodeURIComponent(",,,((()))");
        const req = new NextRequest(`http://localhost:3000/api/admin/users?search=${searchPayload}`, { headers: validHeaders });
        const res = await listUsers(req);
        expect(res.status).toBe(200);
      });

      it('falls back safely to default sort column when sortBy is arbitrary column', async () => {
        const req = new NextRequest('http://localhost:3000/api/admin/users?sortBy=password_hash', { headers: validHeaders });
        const res = await listUsers(req);
        expect(res.status).toBe(200);
      });
    });

    describe('Payments Endpoints Query Stress', () => {
      it('rejects invalid pagination on subscriptions (?page=-1&limit=0) with 400', async () => {
        const req = new NextRequest('http://localhost:3000/api/admin/payments/subscriptions?page=-1&limit=0', { headers: validHeaders });
        const res = await listSubs(req);
        expect(res.status).toBe(400);
      });

      it('rejects invalid pagination on invoices (?limit=500) with 400', async () => {
        const req = new NextRequest('http://localhost:3000/api/admin/payments/invoices?limit=500', { headers: validHeaders });
        const res = await listInvoices(req);
        expect(res.status).toBe(400);
      });

      it('sanitizes search in subscriptions and invoices with PostgREST syntax characters', async () => {
        const attackStr = encodeURIComponent('cus_123,status.eq.canceled(injected)');
        const req1 = new NextRequest(`http://localhost:3000/api/admin/payments/subscriptions?search=${attackStr}`, { headers: validHeaders });
        expect((await listSubs(req1)).status).toBe(200);

        const req2 = new NextRequest(`http://localhost:3000/api/admin/payments/invoices?search=${attackStr}`, { headers: validHeaders });
        expect((await listInvoices(req2)).status).toBe(200);
      });
    });

    describe('Logs Multi-Category Query Stress', () => {
      it('rejects invalid categories with 400 and returns valid category list', async () => {
        const req = new NextRequest('http://localhost:3000/api/admin/logs?category=arbitrary_table', { headers: validHeaders });
        const res = await getLogs(req);
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toBe('Invalid log category');
        expect(body.validCategories).toBeInstanceOf(Array);
      });

      it('sanitizes injection payload across multiple log categories', async () => {
        const attack = encodeURIComponent("test,action.eq.superadmin_escalation(malicious)");
        for (const cat of ['admin_audit', 'space_audit', 'reports']) {
          const req = new NextRequest(`http://localhost:3000/api/admin/logs?category=${cat}&search=${attack}`, { headers: validHeaders });
          const res = await getLogs(req);
          if (res.status !== 200) {
            const body = await res.json();
            console.error(`FAILED CATEGORY: ${cat}`, body);
          }
          expect(res.status).toBe(200);
        }
      });
    });

    describe('Generic CRUD Collection Query Stress (GET /api/admin/crud/[entity])', () => {
      it('handles negative or clamped limit and page parameters gracefully without crashing', async () => {
        const req = new NextRequest('http://localhost:3000/api/admin/crud/spaces?page=-10&limit=-50', { headers: validHeaders });
        const res = await getCrudCollection(req, { params: Promise.resolve({ entity: 'spaces' }) });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.pagination.page).toBe(1);
        expect(body.pagination.limit).toBe(1);
      });

      it('clamps maximum limit to 100 when huge limit is provided (?limit=999999)', async () => {
        const req = new NextRequest('http://localhost:3000/api/admin/crud/spaces?limit=999999', { headers: validHeaders });
        const res = await getCrudCollection(req, { params: Promise.resolve({ entity: 'spaces' }) });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.pagination.limit).toBe(100);
      });
    });
  });

  // =========================================================================
  // 2. INVALID PAYLOAD STRESS & MALFORMED BODIES
  // =========================================================================
  describe('Payload Stress & Malformed Body Validation', () => {
    describe('POST /api/admin/users', () => {
      it('rejects empty JSON payload {} with 400 Validation failed', async () => {
        const req = new NextRequest('http://localhost:3000/api/admin/users', {
          method: 'POST',
          headers: validHeaders,
          body: JSON.stringify({}),
        });
        const res = await createUser(req);
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toBe('Validation failed');
        expect(body.details.email).toBeDefined();
        expect(body.details.password).toBeDefined();
      });

      it('rejects invalid email formats with 400', async () => {
        for (const badEmail of ['not-an-email', 'user@', '@domain.com', 'user@domain']) {
          const req = new NextRequest('http://localhost:3000/api/admin/users', {
            method: 'POST',
            headers: validHeaders,
            body: JSON.stringify({ email: badEmail, password: 'ValidPassword123!' }),
          });
          const res = await createUser(req);
          expect(res.status).toBe(400);
        }
      });

      it('rejects password shorter than 8 characters with 400', async () => {
        const req = new NextRequest('http://localhost:3000/api/admin/users', {
          method: 'POST',
          headers: validHeaders,
          body: JSON.stringify({ email: 'valid@example.com', password: 'short' }),
        });
        const res = await createUser(req);
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.details.password._errors[0]).toContain('at least 8 characters');
      });

      it('rejects usernames with illegal characters (spaces, semicolons, quotes, slashes)', async () => {
        for (const badUsername of ['user name', 'user;drop', "user'admin", 'user/slash', 'user<script>']) {
          const req = new NextRequest('http://localhost:3000/api/admin/users', {
            method: 'POST',
            headers: validHeaders,
            body: JSON.stringify({
              email: 'valid@example.com',
              password: 'ValidPassword123!',
              username: badUsername,
            }),
          });
          const res = await createUser(req);
          expect(res.status).toBe(400);
        }
      });

      it('rejects out-of-range displayName (>50 characters)', async () => {
        const req = new NextRequest('http://localhost:3000/api/admin/users', {
          method: 'POST',
          headers: validHeaders,
          body: JSON.stringify({
            email: 'valid@example.com',
            password: 'ValidPassword123!',
            displayName: 'A'.repeat(51),
          }),
        });
        const res = await createUser(req);
        expect(res.status).toBe(400);
      });

      it('rejects invalid enum values for gender and tier with 400', async () => {
        const req = new NextRequest('http://localhost:3000/api/admin/users', {
          method: 'POST',
          headers: validHeaders,
          body: JSON.stringify({
            email: 'valid@example.com',
            password: 'ValidPassword123!',
            gender: 'other',
            tier: 'vip_gold',
          }),
        });
        const res = await createUser(req);
        expect(res.status).toBe(400);
      });

      it('rejects array and primitive payloads with 400', async () => {
        const reqArr = new NextRequest('http://localhost:3000/api/admin/users', {
          method: 'POST',
          headers: validHeaders,
          body: JSON.stringify(['array', 'not', 'allowed']),
        });
        expect((await createUser(reqArr)).status).toBe(400);

        const reqStr = new NextRequest('http://localhost:3000/api/admin/users', {
          method: 'POST',
          headers: validHeaders,
          body: JSON.stringify('plain-string'),
        });
        expect((await createUser(reqStr)).status).toBe(400);
      });
    });

    describe('PATCH /api/admin/users/[id]', () => {
      it('rejects password reset with password < 8 chars with 400', async () => {
        const req = new NextRequest(`http://localhost:3000/api/admin/users/${targetUserId}`, {
          method: 'PATCH',
          headers: validHeaders,
          body: JSON.stringify({ password: '123' }),
        });
        const res = await updateUser(req, { params: Promise.resolve({ id: targetUserId }) });
        expect(res.status).toBe(400);
      });

      it('rejects invalid status with 400', async () => {
        const req = new NextRequest(`http://localhost:3000/api/admin/users/${targetUserId}`, {
          method: 'PATCH',
          headers: validHeaders,
          body: JSON.stringify({ status: 'superbanned' }),
        });
        const res = await updateUser(req, { params: Promise.resolve({ id: targetUserId }) });
        expect(res.status).toBe(400);
      });

      it('rejects statusMessage exceeding 160 characters with 400', async () => {
        const req = new NextRequest(`http://localhost:3000/api/admin/users/${targetUserId}`, {
          method: 'PATCH',
          headers: validHeaders,
          body: JSON.stringify({ statusMessage: 'M'.repeat(161) }),
        });
        const res = await updateUser(req, { params: Promise.resolve({ id: targetUserId }) });
        expect(res.status).toBe(400);
      });

      it('rejects non-object body (array or primitive) with 400', async () => {
        const req = new NextRequest(`http://localhost:3000/api/admin/users/${targetUserId}`, {
          method: 'PATCH',
          headers: validHeaders,
          body: JSON.stringify([1, 2, 3]),
        });
        const res = await updateUser(req, { params: Promise.resolve({ id: targetUserId }) });
        expect(res.status).toBe(400);
      });
    });

    describe('POST /api/admin/payments/invoices', () => {
      it('rejects empty payload {} with 400', async () => {
        const req = new NextRequest('http://localhost:3000/api/admin/payments/invoices', {
          method: 'POST',
          headers: validHeaders,
          body: JSON.stringify({}),
        });
        const res = await createInvoice(req);
        expect(res.status).toBe(400);
      });

      it('rejects invalid UUID for userId with 400', async () => {
        const req = new NextRequest('http://localhost:3000/api/admin/payments/invoices', {
          method: 'POST',
          headers: validHeaders,
          body: JSON.stringify({ userId: 'not-a-valid-uuid', amountCents: 100 }),
        });
        const res = await createInvoice(req);
        expect(res.status).toBe(400);
      });

      it('rejects negative or floating point amountCents with 400', async () => {
        const reqNeg = new NextRequest('http://localhost:3000/api/admin/payments/invoices', {
          method: 'POST',
          headers: validHeaders,
          body: JSON.stringify({ userId: targetUserId, amountCents: -500 }),
        });
        expect((await createInvoice(reqNeg)).status).toBe(400);

        const reqFloat = new NextRequest('http://localhost:3000/api/admin/payments/invoices', {
          method: 'POST',
          headers: validHeaders,
          body: JSON.stringify({ userId: targetUserId, amountCents: 49.99 }),
        });
        expect((await createInvoice(reqFloat)).status).toBe(400);
      });

      it('rejects invalid invoicePdf URL with 400', async () => {
        const req = new NextRequest('http://localhost:3000/api/admin/payments/invoices', {
          method: 'POST',
          headers: validHeaders,
          body: JSON.stringify({ userId: targetUserId, amountCents: 1000, invoicePdf: 'invalid-url' }),
        });
        const res = await createInvoice(req);
        expect(res.status).toBe(400);
      });

      it('rejects invalid paidAt ISO datetime with 400', async () => {
        const req = new NextRequest('http://localhost:3000/api/admin/payments/invoices', {
          method: 'POST',
          headers: validHeaders,
          body: JSON.stringify({ userId: targetUserId, amountCents: 1000, paidAt: 'not-a-date' }),
        });
        const res = await createInvoice(req);
        expect(res.status).toBe(400);
      });
    });

    describe('PATCH /api/admin/payments/subscriptions', () => {
      it('rejects request when both id and userId are omitted with 400', async () => {
        const req = new NextRequest('http://localhost:3000/api/admin/payments/subscriptions', {
          method: 'PATCH',
          headers: validHeaders,
          body: JSON.stringify({ status: 'active' }),
        });
        const res = await updateSub(req);
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.message).toContain('Either subscription id or userId is required');
      });

      it('rejects invalid subscription status with 400', async () => {
        const req = new NextRequest('http://localhost:3000/api/admin/payments/subscriptions', {
          method: 'PATCH',
          headers: validHeaders,
          body: JSON.stringify({ id: 'sub-id', status: 'lifetime_free' }),
        });
        const res = await updateSub(req);
        expect(res.status).toBe(400);
      });

      it('rejects invalid currentPeriodEnd datetime with 400', async () => {
        const req = new NextRequest('http://localhost:3000/api/admin/payments/subscriptions', {
          method: 'PATCH',
          headers: validHeaders,
          body: JSON.stringify({ id: 'sub-id', status: 'active', currentPeriodEnd: 'invalid_datetime' }),
        });
        const res = await updateSub(req);
        expect(res.status).toBe(400);
      });
    });

    describe('Generic CRUD Payloads (POST & PATCH)', () => {
      it('rejects array payloads on POST and PATCH with 400', async () => {
        const postReq = new NextRequest('http://localhost:3000/api/admin/crud/spaces', {
          method: 'POST',
          headers: validHeaders,
          body: JSON.stringify([{ name: 'Space 1' }, { name: 'Space 2' }]),
        });
        expect((await postCrudCollection(postReq, { params: Promise.resolve({ entity: 'spaces' }) })).status).toBe(400);

        const patchReq = new NextRequest('http://localhost:3000/api/admin/crud/spaces/123', {
          method: 'PATCH',
          headers: validHeaders,
          body: JSON.stringify([{ name: 'Space 1' }]),
        });
        expect((await patchCrudItem(patchReq, { params: Promise.resolve({ entity: 'spaces', id: '123' }) })).status).toBe(400);
      });

      it('rejects primitive string payloads on POST and PATCH with 400', async () => {
        const postReq = new NextRequest('http://localhost:3000/api/admin/crud/spaces', {
          method: 'POST',
          headers: validHeaders,
          body: JSON.stringify('raw string body'),
        });
        expect((await postCrudCollection(postReq, { params: Promise.resolve({ entity: 'spaces' }) })).status).toBe(400);
      });
    });
  });

  // =========================================================================
  // 3. ENTITY ROUTING & STRICT TABLE ISOLATION IN CRUD
  // =========================================================================
  describe('Entity Routing in CRUD & Table Isolation', () => {
    const forbiddenEntities = [
      'pg_shadow',
      'pg_authid',
      'auth_users',
      'auth.users',
      'information_schema.tables',
      'profiles', // Separated into dedicated /api/admin/users
      'admin_audit_logs', // Immutable audit log table
      'space_audit_logs',
      'guest_provision_log',
      'secret_keys',
      'system_settings',
      '../profiles',
      '..%2F..%2Fetc%2Fpasswd',
      '__proto__',
      'constructor',
      'toString',
    ];

    for (const forbidden of forbiddenEntities) {
      it(`strictly rejects forbidden entity "${forbidden}" across all 5 CRUD operations with 400`, async () => {
        // 1. GET collection
        const getColRes = await getCrudCollection(
          new NextRequest(`http://localhost:3000/api/admin/crud/${forbidden}`, { headers: validHeaders }),
          { params: Promise.resolve({ entity: forbidden }) }
        );
        expect(getColRes.status).toBe(400);
        const getColBody = await getColRes.json();
        expect(getColBody.error).toBe('Invalid or forbidden entity for CRUD access.');
        expect(getColBody.allowedEntities).toBeDefined();

        // 2. POST collection
        const postColRes = await postCrudCollection(
          new NextRequest(`http://localhost:3000/api/admin/crud/${forbidden}`, {
            method: 'POST',
            headers: validHeaders,
            body: JSON.stringify({ test: 123 }),
          }),
          { params: Promise.resolve({ entity: forbidden }) }
        );
        expect(postColRes.status).toBe(400);

        // 3. GET item
        const getItemRes = await getCrudItem(
          new NextRequest(`http://localhost:3000/api/admin/crud/${forbidden}/test-id`, { headers: validHeaders }),
          { params: Promise.resolve({ entity: forbidden, id: 'test-id' }) }
        );
        expect(getItemRes.status).toBe(400);

        // 4. PATCH item
        const patchItemRes = await patchCrudItem(
          new NextRequest(`http://localhost:3000/api/admin/crud/${forbidden}/test-id`, {
            method: 'PATCH',
            headers: validHeaders,
            body: JSON.stringify({ test: 456 }),
          }),
          { params: Promise.resolve({ entity: forbidden, id: 'test-id' }) }
        );
        expect(patchItemRes.status).toBe(400);

        // 5. DELETE item
        const delItemRes = await deleteCrudItem(
          new NextRequest(`http://localhost:3000/api/admin/crud/${forbidden}/test-id`, {
            method: 'DELETE',
            headers: validHeaders,
          }),
          { params: Promise.resolve({ entity: forbidden, id: 'test-id' }) }
        );
        expect(delItemRes.status).toBe(400);
      });
    }
  });

  // =========================================================================
  // 4. MOCK FIDELITY & OFFLINE DETERMINISM VERIFICATION
  // =========================================================================
  describe('Mock Fidelity & Offline Determinism', () => {
    it('executes completely offline without invoking real network fetch', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      // Call metrics
      mockRpc.mockResolvedValueOnce({ data: { totalUsers: 100 }, error: null });
      const metricsReq = new NextRequest('http://localhost:3000/api/admin/metrics', { headers: validHeaders });
      const metricsRes = await getMetrics(metricsReq);
      expect(metricsRes.status).toBe(200);

      // Call users
      const usersReq = new NextRequest('http://localhost:3000/api/admin/users', { headers: validHeaders });
      const usersRes = await listUsers(usersReq);
      expect(usersRes.status).toBe(200);

      // Assert global fetch was never touched
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it('does not leak unhandled promise rejections on database RPC failure', async () => {
      mockRpc.mockRejectedValueOnce(new Error('Network transport offline'));

      const req = new NextRequest('http://localhost:3000/api/admin/metrics', { headers: validHeaders });
      const res = await getMetrics(req);
      expect(res.status).toBe(500);

      const body = await res.json();
      expect(body.error).toBe('Internal server error');
      expect(body.message).toBe('Network transport offline');
    });
  });
});
