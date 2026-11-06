import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin/adminAuth';

export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.ok) return auth.response;

  return NextResponse.json({
    verified: true,
    admin: {
      id: auth.admin.id,
      email: auth.admin.email,
      username: auth.admin.username,
      displayName: auth.admin.displayName,
      systemRole: auth.admin.systemRole,
      isMachineKey: Boolean(auth.admin.isMachineKey),
    },
    capabilities: {
      canManageUsers: true,
      canViewPaymentLogs: true,
      canViewSystemLogs: true,
      canExecuteCrud: true,
      canAssignSuperadmin: auth.admin.systemRole === 'superadmin',
    },
  });
}

