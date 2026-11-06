import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin/adminAuth';
import { logAdminAction } from '@/lib/admin/auditLogger';
import { CreateUserSchema, PaginationQuerySchema } from '@/lib/admin/schemas';
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

    const { page, limit, search, sortBy, sortOrder, status, role, tier } = parsedQuery.data;
    const offset = (page - 1) * limit;

    let query = auth.supabaseAdmin
      .from('profiles')
      .select('id, username, display_name, status, status_message, gender, tier, is_paid, system_role, has_ai_companion, created_at, updated_at', {
        count: 'exact',
      });

    if (search) {
      const sanitizedSearch = search.replace(/[,()]/g, ' ').trim();
      if (sanitizedSearch) {
        query = query.or(`username.ilike.%${sanitizedSearch}%,display_name.ilike.%${sanitizedSearch}%`);
      }
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (role) {
      query = query.eq('system_role', role);
    }

    if (tier) {
      query = query.eq('tier', tier);
    }

    const allowedSortFields = ['created_at', 'username', 'display_name', 'status', 'tier', 'system_role'];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';

    query = query.order(sortField, { ascending: sortOrder === 'asc' }).range(offset, offset + limit - 1);

    const { data: profiles, error, count } = await query;

    if (error) {
      console.error('[AdminUsers] Error listing users:', error);
      return NextResponse.json({ error: 'Failed to fetch users', message: error.message }, { status: 500 });
    }

    const total = count || 0;
    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      users: profiles || [],
      pagination: {
        page,
        limit,
        total,
        totalPages,
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
    const parsedBody = CreateUserSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsedBody.error.format() },
        { status: 400 }
      );
    }

    const {
      email,
      password,
      username,
      displayName,
      gender,
      tier,
      systemRole,
      autoConfirm,
      hasAiCompanion,
    } = parsedBody.data;

    // Only superadmin can create another admin or superadmin
    if ((systemRole === 'admin' || systemRole === 'superadmin') && auth.admin.systemRole !== 'superadmin') {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Only a superadmin can provision accounts with admin privileges.' },
        { status: 403 }
      );
    }

    // 1. Create the user in Supabase Auth via admin privileges
    const { data: newUserData, error: createError } = await auth.supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: autoConfirm,
      user_metadata: {
        username: username || email.split('@')[0],
        display_name: displayName,
        gender,
      },
    });

    if (createError || !newUserData?.user) {
      console.error('[AdminUsers] Failed to create user in auth:', createError);
      return NextResponse.json(
        { error: createError?.message || 'Failed to create user.' },
        { status: 400 }
      );
    }

    const createdUser = newUserData.user;

    // 2. Provision / Update the profile record
    const isPaid = tier !== 'free';
    const profileInsert: Database['public']['Tables']['profiles']['Insert'] = {
      id: createdUser.id,
      username: username || email.split('@')[0],
      display_name: displayName,
      gender,
      tier,
      is_paid: isPaid,
      system_role: systemRole,
      has_ai_companion: hasAiCompanion,
      status: 'available',
    };
    const { data: updatedProfile, error: profileError } = await auth.supabaseAdmin
      .from('profiles')
      .upsert(
        profileInsert,
        { onConflict: 'id' }
      )
      .select()
      .single();

    if (profileError) {
      console.error('[AdminUsers] Profile upsert failed, rolling back auth user:', profileError);
      await auth.supabaseAdmin.auth.admin.deleteUser(createdUser.id);
      return NextResponse.json(
        { error: `Failed to provision user profile: ${profileError.message}` },
        { status: 400 }
      );
    }

    // 3. Log the administrative user creation
    await logAdminAction({
      adminId: auth.admin.id,
      action: 'create_user',
      targetTable: 'profiles',
      targetId: createdUser.id,
      changesAfter: {
        id: createdUser.id,
        email,
        username: username || email.split('@')[0],
        displayName,
        tier,
        systemRole,
        autoConfirm,
      },
      req,
    });

    return NextResponse.json(
      {
        message: 'User created successfully',
        user: {
          id: createdUser.id,
          email: createdUser.email,
          profile: updatedProfile || {
            id: createdUser.id,
            username: username || email.split('@')[0],
            display_name: displayName,
            tier,
            system_role: systemRole,
          },
        },
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: 'Internal server error', message }, { status: 500 });
  }
}

