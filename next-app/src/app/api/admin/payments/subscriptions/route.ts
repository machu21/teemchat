import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin/adminAuth';
import { logAdminAction } from '@/lib/admin/auditLogger';
import { PaginationQuerySchema, SubscriptionOverrideSchema } from '@/lib/admin/schemas';
import type { Database } from '@/lib/database.types';

export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(req.url);
    const parsedQuery = PaginationQuerySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parsedQuery.error.format() },
        { status: 400 }
      );
    }

    const { page, limit, status, sortBy, sortOrder, search } = parsedQuery.data;
    const offset = (page - 1) * limit;

    let query = auth.supabaseAdmin
      .from('user_subscriptions')
      .select('*, profiles:user_id(id, username, display_name, tier, system_role)', { count: 'exact' });

    if (search) {
      const sanitizedSearch = search.replace(/[,()]/g, ' ').trim();
      if (sanitizedSearch) {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sanitizedSearch);
        if (isUuid) {
          query = query.or(`stripe_customer_id.ilike.%${sanitizedSearch}%,user_id.eq.${sanitizedSearch},status.ilike.%${sanitizedSearch}%`);
        } else {
          query = query.or(`stripe_customer_id.ilike.%${sanitizedSearch}%,status.ilike.%${sanitizedSearch}%`);
        }
      }
    }

    if (status) {
      query = query.eq('status', status);
    }

    const allowedSortFields = ['created_at', 'updated_at', 'status', 'current_period_end'];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';

    query = query.order(sortField, { ascending: sortOrder === 'asc' }).range(offset, offset + limit - 1);

    const { data: subscriptions, error, count } = await query;

    if (error) {
      console.error('[AdminPayments] Error fetching subscriptions:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      subscriptions: subscriptions || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: 'Internal server error', message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await verifyAdminRequest(req, { mutation: true });
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json().catch(() => null);
    const { id, userId, ...overrideData } = body || {};

    if (!id && !userId) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Either subscription id or userId is required.' },
        { status: 400 }
      );
    }

    const parsedOverride = SubscriptionOverrideSchema.safeParse(overrideData);
    if (!parsedOverride.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsedOverride.error.format() },
        { status: 400 }
      );
    }

    // 1. Fetch existing record
    let query = auth.supabaseAdmin.from('user_subscriptions').select('*');
    if (id) query = query.eq('id', id);
    else if (userId) query = query.eq('user_id', userId);

    const { data: existingSub, error: fetchErr } = await query.single();
    if (fetchErr || !existingSub) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    // 2. Perform update
    const updates: Database['public']['Tables']['user_subscriptions']['Update'] = {
      status: parsedOverride.data.status,
      updated_at: new Date().toISOString(),
    };
    if (parsedOverride.data.planId !== undefined) updates.plan_id = parsedOverride.data.planId;
    if (parsedOverride.data.hasAiUnlimited !== undefined) updates.has_ai_unlimited = parsedOverride.data.hasAiUnlimited;
    if (parsedOverride.data.currentPeriodEnd !== undefined) updates.current_period_end = parsedOverride.data.currentPeriodEnd;
    if (parsedOverride.data.cancelAtPeriodEnd !== undefined) updates.cancel_at_period_end = parsedOverride.data.cancelAtPeriodEnd;

    const { data: updatedSub, error: updateErr } = await auth.supabaseAdmin
      .from('user_subscriptions')
      .update(updates)
      .eq('id', existingSub.id)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // Also synchronize profile is_paid and tier if subscription is active
    if (parsedOverride.data.status === 'active') {
      await auth.supabaseAdmin
        .from('profiles')
        .update({ is_paid: true, tier: 'pro', has_ai_companion: true })
        .eq('id', existingSub.user_id);
    } else if (parsedOverride.data.status === 'canceled') {
      await auth.supabaseAdmin
        .from('profiles')
        .update({ is_paid: false, tier: 'free' })
        .eq('id', existingSub.user_id);
    }

    // 3. Log administrative action
    await logAdminAction({
      adminId: auth.admin.id,
      action: 'subscription_override',
      targetTable: 'user_subscriptions',
      targetId: existingSub.id,
      changesBefore: existingSub as unknown as Record<string, unknown>,
      changesAfter: updatedSub as unknown as Record<string, unknown>,
      req,
    });

    return NextResponse.json({
      message: 'Subscription updated successfully',
      subscription: updatedSub,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: 'Internal server error', message }, { status: 500 });
  }
}

