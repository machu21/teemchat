import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { getUser, deleteUser, adminTables, storageList, storageRemove } = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key';
  return {
    getUser: vi.fn(),
    deleteUser: vi.fn(),
    adminTables: {} as Record<string, unknown>,
    storageList: vi.fn(),
    storageRemove: vi.fn(),
  };
});

vi.mock('@/lib/rateLimit', () => import('../../src/lib/rateLimit'));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser } }),
}));

// Chainable, awaitable query builder that resolves to adminTables[table]
function query(table: string) {
  const result = { data: adminTables[table] ?? null, error: null };
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq']) builder[m] = () => builder;
  builder.maybeSingle = async () => ({ data: Array.isArray(result.data) ? result.data[0] : result.data, error: null });
  builder.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return builder;
}

vi.mock('@/lib/admin/adminAuth', () => ({
  AdminConfigError: class extends Error {},
  getSupabaseAdminClient: () => ({
    from: (table: string) => query(table),
    storage: { from: () => ({ list: storageList, remove: storageRemove }) },
    auth: { admin: { deleteUser } },
  }),
}));

import { POST } from '../../src/app/api/account/delete/route';

let ip = 0;
function request(body: unknown, token: string | null = 'user-token') {
  ip += 1; // fresh IP per test so the per-IP rate limit never interferes
  return new NextRequest('http://localhost/api/account/delete', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `10.0.0.${ip}`,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/account/delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const k of Object.keys(adminTables)) delete adminTables[k];
    delete process.env.STRIPE_SECRET_KEY;
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    deleteUser.mockResolvedValue({ error: null });
    storageList.mockResolvedValue({ data: [{ name: 'track.mp3' }] });
    storageRemove.mockResolvedValue({ error: null });
  });

  it('requires a signed-in user', async () => {
    const res = await POST(request({ confirm: 'DELETE' }, null));
    expect(res.status).toBe(401);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('requires the typed confirmation', async () => {
    const res = await POST(request({ confirm: 'yes' }));
    expect(res.status).toBe(400);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('refuses admin accounts', async () => {
    adminTables.profiles = { system_role: 'superadmin' };
    const res = await POST(request({ confirm: 'DELETE' }));
    expect(res.status).toBe(403);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('never deletes an account that would keep being billed', async () => {
    adminTables.user_subscriptions = [{ stripe_subscription_id: 'sub_123', status: 'active' }];
    const res = await POST(request({ confirm: 'DELETE' }));
    expect(res.status).toBe(409);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('cancels a live subscription on Stripe, then deletes', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    adminTables.user_subscriptions = [{ stripe_subscription_id: 'sub_123', status: 'trialing' }];
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    const res = await POST(request({ confirm: 'DELETE' }));

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.stripe.com/v1/subscriptions/sub_123',
      expect.objectContaining({ method: 'DELETE' })
    );
    expect(res.status).toBe(200);
    expect(deleteUser).toHaveBeenCalledWith('user-1');
    vi.unstubAllGlobals();
  });

  it('removes uploaded audio from the user\'s spaces and deletes the account', async () => {
    adminTables.spaces = [{ id: 'space-a' }];
    const res = await POST(request({ confirm: 'DELETE' }));
    expect(res.status).toBe(200);
    expect(storageRemove).toHaveBeenCalledWith(['space-a/track.mp3']);
    expect(deleteUser).toHaveBeenCalledWith('user-1');
  });
});
