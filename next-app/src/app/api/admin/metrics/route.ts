import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin/adminAuth';

export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.ok) return auth.response;

  try {
    const { data, error } = await auth.supabaseAdmin.rpc('get_admin_overview_metrics');

    if (error) {
      console.error('[AdminMetrics] Error fetching admin overview metrics:', error);
      return NextResponse.json(
        { error: 'Failed to retrieve metrics', message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      metrics: data,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected server error';
    return NextResponse.json({ error: 'Internal server error', message }, { status: 500 });
  }
}

