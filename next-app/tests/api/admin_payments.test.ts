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
const mockProfileUpdate = vi.fn();

const mockSupabaseAdmin = {
  auth: {
    getUser: mockGetUser,
  },
  from: mockFrom,
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseAdmin),
}));

import { GET as listSubs, PATCH as updateSub } from '../../src/app/api/admin/payments/subscriptions/route';
import { GET as listInvoices, POST as createInvoice } from '../../src/app/api/admin/payments/invoices/route';
import { defaultRateLimiter } from '../../src/lib/rateLimit';

describe('Admin Payments & Billing Logs API', () => {
  const adminId = '11111111-1111-1111-1111-111111111111';
  const customerUserId = '33333333-3333-3333-3333-333333333333';
  const subId = '44444444-4444-4444-4444-444444444444';

  beforeEach(() => {
    vi.clearAllMocks();
    defaultRateLimiter.reset();
    mockAuditInsert.mockResolvedValue({ error: null });
    mockProfileUpdate.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

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
          update: mockProfileUpdate,
        };
      }

      if (table === 'user_subscriptions') {
        const subBuilder: Record<string, unknown> = {
          select: vi.fn().mockImplementation(() => subBuilder),
          eq: vi.fn().mockImplementation((col: string, val: string) => {
            if (val === 'non-existent-sub') {
              return { single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }) };
            }
            if (col === 'id' || col === 'user_id') {
              return {
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: subId,
                    user_id: customerUserId,
                    plan_id: 'ai_unlimited_monthly',
                    status: 'active',
                  },
                  error: null,
                }),
              };
            }
            return subBuilder;
          }),
          or: vi.fn().mockImplementation(() => subBuilder),
          order: vi.fn().mockImplementation(() => subBuilder),
          range: vi.fn().mockResolvedValue({
            data: [
              {
                id: subId,
                user_id: customerUserId,
                plan_id: 'ai_unlimited_monthly',
                status: 'active',
                profiles: { username: 'paying_user', display_name: 'Paying User' },
              },
            ],
            count: 1,
            error: null,
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: subId,
                    user_id: customerUserId,
                    status: 'canceled',
                  },
                  error: null,
                }),
              }),
            }),
          }),
        };
        return subBuilder;
      }

      if (table === 'billing_invoices') {
        const invBuilder: Record<string, unknown> = {
          select: vi.fn().mockImplementation(() => invBuilder),
          eq: vi.fn().mockImplementation(() => invBuilder),
          or: vi.fn().mockImplementation(() => invBuilder),
          order: vi.fn().mockImplementation(() => invBuilder),
          range: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'inv-1',
                user_id: customerUserId,
                amount_cents: 500,
                status: 'paid',
                currency: 'usd',
              },
            ],
            count: 1,
            error: null,
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'inv-new',
                  user_id: customerUserId,
                  amount_cents: 1000,
                  status: 'paid',
                },
                error: null,
              }),
            }),
          }),
        };
        return invBuilder;
      }

      if (table === 'admin_audit_logs') {
        return {
          insert: mockAuditInsert,
        };
      }

      return {};
    });
  });

  describe('RBAC & Auth Verification', () => {
    it('rejects unauthenticated requests on all payment endpoints with 401', async () => {
      const getSubsReq = new NextRequest('http://localhost:3000/api/admin/payments/subscriptions');
      expect((await listSubs(getSubsReq)).status).toBe(401);

      const patchSubsReq = new NextRequest('http://localhost:3000/api/admin/payments/subscriptions', { method: 'PATCH', body: '{}' });
      expect((await updateSub(patchSubsReq)).status).toBe(401);

      const getInvoicesReq = new NextRequest('http://localhost:3000/api/admin/payments/invoices');
      expect((await listInvoices(getInvoicesReq)).status).toBe(401);

      const postInvoiceReq = new NextRequest('http://localhost:3000/api/admin/payments/invoices', { method: 'POST', body: '{}' });
      expect((await createInvoice(postInvoiceReq)).status).toBe(401);
    });

    it('rejects regular users with 403 on payment endpoints', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: 'reg-user-id', email: 'reg@example.com' } },
        error: null,
      });

      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnValueOnce({
          eq: vi.fn().mockReturnValueOnce({
            single: vi.fn().mockResolvedValueOnce({
              data: { id: 'reg-user-id', username: 'reg', display_name: 'Reg', system_role: 'user', status: 'available' },
              error: null,
            }),
          }),
        }),
      });

      const getSubsReq = new NextRequest('http://localhost:3000/api/admin/payments/subscriptions', {
        headers: { authorization: 'Bearer user-token' },
      });
      expect((await listSubs(getSubsReq)).status).toBe(403);
    });
  });

  describe('GET & PATCH /api/admin/payments/subscriptions', () => {
    it('returns subscription list', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/payments/subscriptions?page=1&limit=10', {
        headers: { authorization: 'Bearer token', 'x-forwarded-for': '198.51.100.10' },
      });

      const res = await listSubs(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.subscriptions).toHaveLength(1);
      expect(body.subscriptions[0].plan_id).toBe('ai_unlimited_monthly');
    });

    it('applies search query parameter when filtering subscriptions', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/payments/subscriptions?search=cus_test123', {
        headers: { authorization: 'Bearer token' },
      });

      const res = await listSubs(req);
      expect(res.status).toBe(200);
    });

    it('rejects PATCH when both id and userId are missing with 400', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/payments/subscriptions', {
        method: 'PATCH',
        headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      });

      const res = await updateSub(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toContain('Either subscription id or userId is required');
    });

    it('rejects PATCH when status is invalid with 400', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/payments/subscriptions', {
        method: 'PATCH',
        headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
        body: JSON.stringify({ id: subId, status: 'unknown_status' }),
      });

      const res = await updateSub(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Validation failed');
    });

    it('returns 404 when target subscription is not found', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/payments/subscriptions', {
        method: 'PATCH',
        headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'non-existent-sub', status: 'canceled' }),
      });

      const res = await updateSub(req);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe('Subscription not found');
    });

    it('overrides subscription status to canceled, synchronizes profile to free tier, and logs audit', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/payments/subscriptions', {
        method: 'PATCH',
        headers: {
          authorization: 'Bearer token',
          'content-type': 'application/json',
          'x-forwarded-for': '198.51.100.11',
        },
        body: JSON.stringify({
          id: subId,
          status: 'canceled',
        }),
      });

      const res = await updateSub(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.message).toContain('Subscription updated successfully');
      expect(body.subscription.status).toBe('canceled');

      // Verify profile sync to free
      expect(mockProfileUpdate).toHaveBeenCalledWith({ is_paid: false, tier: 'free' });

      // Verify audit logging
      expect(mockAuditInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'subscription_override',
          target_table: 'user_subscriptions',
          target_id: subId,
        })
      );
    });

    it('overrides subscription status to active and synchronizes profile to pro tier', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/payments/subscriptions', {
        method: 'PATCH',
        headers: {
          authorization: 'Bearer token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          id: subId,
          status: 'active',
        }),
      });

      const res = await updateSub(req);
      expect(res.status).toBe(200);

      // Verify profile sync to pro
      expect(mockProfileUpdate).toHaveBeenCalledWith({ is_paid: true, tier: 'pro', has_ai_companion: true });
    });
  });

  describe('GET & POST /api/admin/payments/invoices', () => {
    it('returns invoices payment log', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/payments/invoices', {
        headers: { authorization: 'Bearer token', 'x-forwarded-for': '198.51.100.12' },
      });

      const res = await listInvoices(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.invoices).toHaveLength(1);
      expect(body.invoices[0].amount_cents).toBe(500);
    });

    it('applies search filter to invoice queries', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/payments/invoices?search=in_stripe123', {
        headers: { authorization: 'Bearer token' },
      });

      const res = await listInvoices(req);
      expect(res.status).toBe(200);
    });

    it('rejects POST invoice with invalid parameters (e.g. non-uuid userId, negative amount) with 400', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/payments/invoices', {
        method: 'POST',
        headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: 'invalid-not-a-uuid',
          amountCents: -50,
          currency: 'usd',
          status: 'paid',
        }),
      });

      const res = await createInvoice(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Validation failed');
    });

    it('creates an invoice log entry and logs audit', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/payments/invoices', {
        method: 'POST',
        headers: {
          authorization: 'Bearer token',
          'content-type': 'application/json',
          'x-forwarded-for': '198.51.100.13',
        },
        body: JSON.stringify({
          userId: customerUserId,
          amountCents: 1000,
          currency: 'usd',
          status: 'paid',
        }),
      });

      const res = await createInvoice(req);
      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.message).toBe('Invoice log created');
      expect(body.invoice.amount_cents).toBe(1000);

      // Verify audit logging
      expect(mockAuditInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'create_invoice_log',
          target_table: 'billing_invoices',
          target_id: 'inv-new',
        })
      );
    });
  });
});
