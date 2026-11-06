import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin/adminAuth';
import { logAdminAction } from '@/lib/admin/auditLogger';
import { UpdateUserSchema } from '@/lib/admin/schemas';
import type { Database } from '@/lib/database.types';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
  const auth = await verifyAdminRequest(req);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await context.params;

    // 1. Fetch Profile
    const { data: profile, error: profileErr } = await auth.supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (profileErr || !profile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // 2-6. Fetch Auth, Subscriptions, AI Usage, Reports, and Memberships in parallel
    const [
      { data: authData },
      { data: subscription },
      { data: aiUsage },
      { data: reports, count: reportCount },
      { data: memberships, count: spaceCount },
    ] = await Promise.all([
      auth.supabaseAdmin.auth.admin.getUserById(id),
      auth.supabaseAdmin.from('user_subscriptions').select('*').eq('user_id', id).maybeSingle(),
      auth.supabaseAdmin
        .from('ai_usage')
        .select('*')
        .eq('user_id', id)
        .order('usage_date', { ascending: false })
        .limit(7),
      auth.supabaseAdmin.from('user_reports').select('*', { count: 'exact' }).eq('reported_user_id', id),
      auth.supabaseAdmin
        .from('space_members')
        .select('space_id, role, joined_at', { count: 'exact' })
        .eq('user_id', id),
    ]);

    return NextResponse.json({
      user: {
        id: profile.id,
        email: authData?.user?.email || null,
        emailConfirmedAt: authData?.user?.email_confirmed_at || null,
        lastSignInAt: authData?.user?.last_sign_in_at || null,
        bannedUntil: (authData?.user as unknown as { banned_until?: string })?.banned_until || null,
        profile,
        subscription: subscription || null,
        aiUsage: aiUsage || [],
        reports: {
          total: reportCount || 0,
          items: reports || [],
        },
        spaces: {
          total: spaceCount || 0,
          memberships: memberships || [],
        },
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: 'Internal server error', message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const auth = await verifyAdminRequest(req, { mutation: true });
  if (!auth.ok) return auth.response;

  try {
    const { id } = await context.params;
    const body = await req.json().catch(() => null);
    const parsedBody = UpdateUserSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsedBody.error.format() },
        { status: 400 }
      );
    }

    const {
      displayName,
      username,
      status,
      statusMessage,
      tier,
      isPaid,
      systemRole,
      password,
      hasAiCompanion,
    } = parsedBody.data;

    // 1. Fetch current profile state
    const { data: currentProfile, error: fetchErr } = await auth.supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !currentProfile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Guard against modifying superadmins
    if (currentProfile.system_role === 'superadmin' && auth.admin.systemRole !== 'superadmin') {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Only a superadmin can modify another superadmin.' },
        { status: 403 }
      );
    }

    // Role guard: Only superadmin can change system_role
    if (systemRole && systemRole !== currentProfile.system_role) {
      if (auth.admin.systemRole !== 'superadmin') {
        return NextResponse.json(
          { error: 'Forbidden', message: 'Only a superadmin can modify system roles.' },
          { status: 403 }
        );
      }
    }

    // Password reset if requested
    let credentialUpdated = false;
    if (password) {
      const { error: pwdErr } = await auth.supabaseAdmin.auth.admin.updateUserById(id, {
        password,
      });
      if (pwdErr) {
        return NextResponse.json({ error: `Password update failed: ${pwdErr.message}` }, { status: 400 });
      }
      credentialUpdated = true;
    }

    // Prepare profile updates
    const updates: Database['public']['Tables']['profiles']['Update'] = {
      updated_at: new Date().toISOString(),
    };
    if (displayName !== undefined) updates.display_name = displayName;
    if (username !== undefined) updates.username = username;
    if (status !== undefined) updates.status = status;
    if (statusMessage !== undefined) updates.status_message = statusMessage;
    if (tier !== undefined) updates.tier = tier;
    if (isPaid !== undefined) updates.is_paid = isPaid;
    if (systemRole !== undefined) updates.system_role = systemRole;
    if (hasAiCompanion !== undefined) updates.has_ai_companion = hasAiCompanion;

    const { data: updatedProfile, error: updateErr } = await auth.supabaseAdmin
      .from('profiles')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // Record audit event
    await logAdminAction({
      adminId: auth.admin.id,
      action: 'update_user',
      targetTable: 'profiles',
      targetId: id,
      changesBefore: currentProfile as unknown as Record<string, unknown>,
      changesAfter: {
        ...(updatedProfile as unknown as Record<string, unknown>),
        ...(credentialUpdated ? { credential_updated: true } : {}),
      },
      req,
    });

    return NextResponse.json({
      message: 'User updated successfully',
      profile: updatedProfile,
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
    const { id } = await context.params;
    const url = new URL(req.url);
    const mode = url.searchParams.get('mode') === 'hard' ? 'hard' : 'soft';

    // Prevent self-deletion
    if (id === auth.admin.id) {
      return NextResponse.json({ error: 'Forbidden', message: 'You cannot delete your own account.' }, { status: 403 });
    }

    // Check target profile
    const { data: targetProfile, error: targetErr } = await auth.supabaseAdmin
      .from('profiles')
      .select('id, username, display_name, system_role')
      .eq('id', id)
      .single();

    if (targetErr || !targetProfile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Guard against deleting superadmins
    if (targetProfile.system_role === 'superadmin' && auth.admin.systemRole !== 'superadmin') {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Only a superadmin can remove another superadmin.' },
        { status: 403 }
      );
    }

    if (mode === 'soft') {
      // Soft ban: change status to banned and ban in auth
      const { error: profileBanErr } = await auth.supabaseAdmin
        .from('profiles')
        .update({ status: 'banned', status_message: 'Account suspended by administrator' })
        .eq('id', id);

      if (profileBanErr) {
        return NextResponse.json({ error: profileBanErr.message }, { status: 500 });
      }

      const { error: authBanErr } = await auth.supabaseAdmin.auth.admin.updateUserById(id, {
        ban_duration: '876000h', // ~100 years
      });

      if (authBanErr) {
        return NextResponse.json({ error: authBanErr.message }, { status: 500 });
      }

      await logAdminAction({
        adminId: auth.admin.id,
        action: 'suspend_user',
        targetTable: 'profiles',
        targetId: id,
        changesBefore: targetProfile as unknown as Record<string, unknown>,
        changesAfter: { status: 'banned' },
        req,
      });

      return NextResponse.json({ message: 'User suspended successfully (soft ban).' });
    } else {
      // Hard delete: permanently remove user from auth which cascades through foreign keys
      const { error: delErr } = await auth.supabaseAdmin.auth.admin.deleteUser(id);
      if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 500 });
      }

      await logAdminAction({
        adminId: auth.admin.id,
        action: 'delete_user_hard',
        targetTable: 'profiles',
        targetId: id,
        changesBefore: targetProfile as unknown as Record<string, unknown>,
        changesAfter: null,
        req,
      });

      return NextResponse.json({ message: 'User permanently deleted.' });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: 'Internal server error', message }, { status: 500 });
  }
}

