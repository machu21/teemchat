import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin/adminAuth';
import { logAdminAction } from '@/lib/admin/auditLogger';
import { isValidCrudEntity, WHITELISTED_CRUD_ENTITIES } from '@/lib/admin/schemas';

interface RouteContext {
  params: Promise<{ entity: string }>;
}

interface DynamicQueryBuilder {
  select(cols?: string, opts?: { count?: 'exact' }): DynamicQueryBuilder;
  insert(values: unknown): DynamicQueryBuilder;
  eq(column: string, value: unknown): DynamicQueryBuilder;
  order(column: string, options?: { ascending?: boolean }): DynamicQueryBuilder;
  range(from: number, to: number): DynamicQueryBuilder;
  single(): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: { data: Record<string, unknown>[] | null; count: number | null; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2>;
}

interface DynamicTableClient {
  from(table: string): DynamicQueryBuilder;
}

export async function GET(req: NextRequest, context: RouteContext) {
  const auth = await verifyAdminRequest(req);
  if (!auth.ok) return auth.response;

  try {
    const { entity } = await context.params;

    if (!isValidCrudEntity(entity)) {
      return NextResponse.json(
        {
          error: 'Invalid or forbidden entity for CRUD access.',
          allowedEntities: WHITELISTED_CRUD_ENTITIES,
        },
        { status: 400 }
      );
    }

    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
    const offset = (page - 1) * limit;

    let defaultSort = 'created_at';
    if (entity === 'space_settings') defaultSort = 'updated_at';
    else if (entity === 'space_members') defaultSort = 'joined_at';
    else if (entity === 'space_roles') defaultSort = 'priority';

    const sortBy = url.searchParams.get('sortBy') || defaultSort;
    const sortOrder = url.searchParams.get('sortOrder') === 'asc' ? true : false;

    const client = auth.supabaseAdmin as unknown as DynamicTableClient;
    let query = client.from(entity).select('*', { count: 'exact' });

    // Apply simple equality filters from query params
    url.searchParams.forEach((value, key) => {
      if (!['page', 'limit', 'sortBy', 'sortOrder', 'search'].includes(key)) {
        query = query.eq(key, value);
      }
    });

    query = query.order(sortBy, { ascending: sortOrder }).range(offset, offset + limit - 1);

    const { data: records, error, count } = await query;

    if (error) {
      console.error(`[AdminCRUD] Error querying entity ${entity}:`, error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      entity,
      records: records || [],
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

export async function POST(req: NextRequest, context: RouteContext) {
  const auth = await verifyAdminRequest(req, { mutation: true });
  if (!auth.ok) return auth.response;

  try {
    const { entity } = await context.params;

    if (!isValidCrudEntity(entity)) {
      return NextResponse.json(
        {
          error: 'Invalid or forbidden entity for CRUD access.',
          allowedEntities: WHITELISTED_CRUD_ENTITIES,
        },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Payload must be a valid JSON object.' }, { status: 400 });
    }

    const client = auth.supabaseAdmin as unknown as DynamicTableClient;
    const { data: createdRecord, error: insertErr } = await client
      .from(entity)
      .insert(body)
      .select()
      .single();

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 400 });
    }

    await logAdminAction({
      adminId: auth.admin.id,
      action: `crud_create_${entity}`,
      targetTable: entity,
      targetId: (createdRecord as { id?: string })?.id,
      changesAfter: createdRecord,
      req,
    });

    return NextResponse.json(
      {
        message: `Record created in ${entity}`,
        record: createdRecord,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: 'Internal server error', message }, { status: 500 });
  }
}

