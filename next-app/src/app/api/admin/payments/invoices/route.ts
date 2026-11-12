import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin/adminAuth';
import { logAdminAction } from '@/lib/admin/auditLogger';
import { CreateInvoiceLogSchema, PaginationQuerySchema } from '@/lib/admin/schemas';

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
      .from('billing_invoices')
      .select('*, profiles:user_id(id, username, display_name)', { count: 'exact' });

    if (search) {
      const sanitizedSearch = search.replace(/[,()]/g, ' ').trim();
      if (sanitizedSearch) {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sanitizedSearch);
        if (isUuid) {
          query = query.or(`stripe_invoice_id.ilike.%${sanitizedSearch}%,user_id.eq.${sanitizedSearch},status.ilike.%${sanitizedSearch}%`);
        } else {
          query = query.or(`stripe_invoice_id.ilike.%${sanitizedSearch}%,status.ilike.%${sanitizedSearch}%`);
        }
      }
    }

    if (status) {
      query = query.eq('status', status);
    }

    const allowedSortFields = ['created_at', 'amount_cents', 'paid_at', 'status'];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';

    query = query.order(sortField, { ascending: sortOrder === 'asc' }).range(offset, offset + limit - 1);

    const { data: invoices, error, count } = await query;

    if (error) {
      console.error('[AdminPayments] Error fetching billing invoices:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      invoices: invoices || [],
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

export async function POST(req: NextRequest) {
  const auth = await verifyAdminRequest(req, { mutation: true });
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json().catch(() => null);
    const parsedBody = CreateInvoiceLogSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsedBody.error.format() },
        { status: 400 }
      );
    }

    const { userId, stripeInvoiceId, amountCents, currency, status, invoicePdf, paidAt } = parsedBody.data;

    const { data: newInvoice, error: insertErr } = await auth.supabaseAdmin
      .from('billing_invoices')
      .insert({
        user_id: userId,
        stripe_invoice_id: stripeInvoiceId || null,
        amount_cents: amountCents,
        currency,
        status,
        invoice_pdf: invoicePdf || null,
        paid_at: paidAt || (status === 'paid' ? new Date().toISOString() : null),
      })
      .select()
      .single();

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    await logAdminAction({
      adminId: auth.admin.id,
      action: 'create_invoice_log',
      targetTable: 'billing_invoices',
      targetId: newInvoice.id,
      changesAfter: newInvoice as unknown as Record<string, unknown>,
      req,
    });

    return NextResponse.json({ message: 'Invoice log created', invoice: newInvoice }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: 'Internal server error', message }, { status: 500 });
  }
}

