import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin/adminAuth';
import { PaginationQuerySchema } from '@/lib/admin/schemas';

export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(req.url);
    const category = url.searchParams.get('category') || url.searchParams.get('type') || 'admin_audit';
    const parsedQuery = PaginationQuerySchema.safeParse(Object.fromEntries(url.searchParams.entries()));

    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parsedQuery.error.format() },
        { status: 400 }
      );
    }

    const { page, limit, startDate, endDate, search } = parsedQuery.data;
    const offset = (page - 1) * limit;
    const sanitizedSearch = search ? search.replace(/[,()]/g, ' ').trim() : '';

    let items: unknown[] = [];
    let total = 0;

    switch (category) {
      case 'payments': {
        let query = auth.supabaseAdmin
          .from('billing_invoices')
          .select('*, profiles:user_id(username, display_name)', { count: 'exact' });

        if (startDate) query = query.gte('created_at', startDate);
        if (endDate) query = query.lte('created_at', endDate);
        if (sanitizedSearch) query = query.or(`stripe_invoice_id.ilike.%${sanitizedSearch}%,status.ilike.%${sanitizedSearch}%`);

        const { data, count, error } = await query
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) throw error;
        items = data || [];
        total = count || 0;
        break;
      }

      case 'admin_audit': {
        let query = auth.supabaseAdmin
          .from('admin_audit_logs')
          .select('*, admin:admin_id(username, display_name)', { count: 'exact' });

        if (startDate) query = query.gte('created_at', startDate);
        if (endDate) query = query.lte('created_at', endDate);
        if (sanitizedSearch) query = query.or(`action.ilike.%${sanitizedSearch}%,target_table.ilike.%${sanitizedSearch}%,target_id.ilike.%${sanitizedSearch}%`);

        const { data, count, error } = await query
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) throw error;
        items = data || [];
        total = count || 0;
        break;
      }

      case 'space_audit': {
        let query = auth.supabaseAdmin
          .from('space_audit_logs')
          .select('*, actor:actor_id(username, display_name), space:space_id(name)', { count: 'exact' });

        if (startDate) query = query.gte('created_at', startDate);
        if (endDate) query = query.lte('created_at', endDate);
        if (sanitizedSearch) query = query.or(`action.ilike.%${sanitizedSearch}%,target_type.ilike.%${sanitizedSearch}%`);

        const { data, count, error } = await query
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) throw error;
        items = data || [];
        total = count || 0;
        break;
      }

      case 'ai_usage': {
        let query = auth.supabaseAdmin
          .from('ai_usage')
          .select('*, profiles:user_id(username, display_name, tier)', { count: 'exact' });

        if (startDate) query = query.gte('usage_date', startDate);
        if (endDate) query = query.lte('usage_date', endDate);
        if (sanitizedSearch) query = query.ilike('user_id', `%${sanitizedSearch}%`);

        const { data, count, error } = await query
          .order('usage_date', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) throw error;
        items = data || [];
        total = count || 0;
        break;
      }

      case 'guest_security': {
        let query = auth.supabaseAdmin
          .from('guest_provision_log')
          .select('*', { count: 'exact' });

        if (startDate) query = query.gte('created_at', startDate);
        if (endDate) query = query.lte('created_at', endDate);
        if (sanitizedSearch) query = query.ilike('client_ip', `%${sanitizedSearch}%`);

        const { data, count, error } = await query
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) throw error;
        items = data || [];
        total = count || 0;
        break;
      }

      case 'reports': {
        let query = auth.supabaseAdmin
          .from('user_reports')
          .select('*, reporter:reporter_id(username, display_name), reported:reported_user_id(username, display_name)', { count: 'exact' });

        if (startDate) query = query.gte('created_at', startDate);
        if (endDate) query = query.lte('created_at', endDate);
        if (sanitizedSearch) query = query.or(`reason.ilike.%${sanitizedSearch}%,status.ilike.%${sanitizedSearch}%`);

        const { data, count, error } = await query
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) throw error;
        items = data || [];
        total = count || 0;
        break;
      }

      default:
        return NextResponse.json(
          {
            error: 'Invalid log category',
            validCategories: ['payments', 'admin_audit', 'space_audit', 'ai_usage', 'guest_security', 'reports'],
          },
          { status: 400 }
        );
    }

    return NextResponse.json({
      category,
      logs: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: 'Internal server error', message }, { status: 500 });
  }
}

