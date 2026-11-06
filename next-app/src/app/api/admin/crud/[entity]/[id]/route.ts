import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin/adminAuth';
import { logAdminAction } from '@/lib/admin/auditLogger';
import { isValidCrudEntity, WHITELISTED_CRUD_ENTITIES } from '@/lib/admin/schemas';

interface RouteContext {
  params: Promise<{ entity: string; id: string }>;
}

interface DynamicQueryBuilder {
  select(cols?: string, opts?: { count?: 'exact' }): DynamicQueryBuilder;
  insert(values: unknown): DynamicQueryBuilder;
  update(values: unknown): DynamicQueryBuilder;
  delete(): DynamicQueryBuilder;
  eq(column: string, value: unknown): DynamicQueryBuilder;
  single(): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: { data: Record<string, unknown> | null; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
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
    const { entity, id } = await context.params;

    if (!isValidCrudEntity(entity)) {
      return NextResponse.json(
        {
          error: 'Invalid or forbidden entity for CRUD access.',
          allowedEntities: WHITELISTED_CRUD_ENTITIES,
        },
        { status: 400 }
      );
    }

    const pkColumn = entity === 'space_settings' ? 'space_id' : 'id';
    const client = auth.supabaseAdmin as unknown as DynamicTableClient;
    const { data: record, error } = await client
      .from(entity)
      .select('*')
      .eq(pkColumn, id)
      .single();

    if (error || !record) {
      return NextResponse.json({ error: `Record with id ${id} not found in ${entity}` }, { status: 404 });
    }

    return NextResponse.json({ entity, record });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: 'Internal server error', message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const auth = await verifyAdminRequest(req, { mutation: true });
  if (!auth.ok) return auth.response;

  try {
    const { entity, id } = await context.params;

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

    const pkColumn = entity === 'space_settings' ? 'space_id' : 'id';
    const client = auth.supabaseAdmin as unknown as DynamicTableClient;

    // 1. Fetch current state for audit diff
    const { data: currentRecord, error: fetchErr } = await client
      .from(entity)
      .select('*')
      .eq(pkColumn, id)
      .single();

    if (fetchErr || !currentRecord) {
      return NextResponse.json({ error: `Record with id ${id} not found in ${entity}` }, { status: 404 });
    }

    // 2. Perform update with safe updated_at injection
    const hasUpdatedAt = ['spaces', 'space_settings', 'user_reports', 'ai_companions', 'user_subscriptions'].includes(entity);
    const updates = hasUpdatedAt
      ? { ...(body as Record<string, unknown>), updated_at: new Date().toISOString() }
      : (body as Record<string, unknown>);

    const { data: updatedRecord, error: updateErr } = await client
      .from(entity)
      .update(updates)
      .eq(pkColumn, id)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 400 });
    }

    // 3. Log mutation
    await logAdminAction({
      adminId: auth.admin.id,
      action: `crud_update_${entity}`,
      targetTable: entity,
      targetId: id,
      changesBefore: currentRecord,
      changesAfter: updatedRecord,
      req,
    });

    return NextResponse.json({
      message: `Record in ${entity} updated successfully.`,
      record: updatedRecord,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: 'Internal server error', message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const auth = await verifyAdminRequest(req, { mutation: true });
  if (!auth.ok) return auth.response;

  try {
    const { entity, id } = await context.params;

    if (!isValidCrudEntity(entity)) {
      return NextResponse.json(
        {
          error: 'Invalid or forbidden entity for CRUD access.',
          allowedEntities: WHITELISTED_CRUD_ENTITIES,
        },
        { status: 400 }
      );
    }

    const pkColumn = entity === 'space_settings' ? 'space_id' : 'id';
    const client = auth.supabaseAdmin as unknown as DynamicTableClient;

    // 1. Fetch current state for audit diff
    const { data: currentRecord, error: fetchErr } = await client
      .from(entity)
      .select('*')
      .eq(pkColumn, id)
      .single();

    if (fetchErr || !currentRecord) {
      return NextResponse.json({ error: `Record with id ${id} not found in ${entity}` }, { status: 404 });
    }

    // 2. Perform deletion
    const { error: deleteErr } = await client.from(entity).delete().eq(pkColumn, id);

    if (deleteErr) {
      return NextResponse.json({ error: deleteErr.message }, { status: 500 });
    }

    // 3. Log deletion
    await logAdminAction({
      adminId: auth.admin.id,
      action: `crud_delete_${entity}`,
      targetTable: entity,
      targetId: id,
      changesBefore: currentRecord,
      changesAfter: null,
      req,
    });

    return NextResponse.json({
      message: `Record ${id} in ${entity} deleted successfully.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: 'Internal server error', message }, { status: 500 });
  }
}

