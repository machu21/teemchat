import { NextRequest } from 'next/server';
import { getSupabaseAdminClient } from './adminAuth';
import { getClientIp } from '../rateLimit';
import { Json } from '../database.types';

export interface LogAdminActionOptions {
  adminId: string | null;
  action: string;
  targetTable?: string;
  targetId?: string;
  changesBefore?: Record<string, unknown> | null;
  changesAfter?: Record<string, unknown> | null;
  req?: NextRequest;
}

/**
 * Asynchronously writes an entry to public.admin_audit_logs.
 * Errors are caught and logged so audit failures do not disrupt the primary transaction.
 */
export async function logAdminAction(options: LogAdminActionOptions): Promise<void> {
  try {
    const supabaseAdmin = getSupabaseAdminClient();
    const ip = options.req ? getClientIp(options.req) : null;
    const userAgent = options.req ? options.req.headers.get('user-agent') : null;

    const { error } = await supabaseAdmin.from('admin_audit_logs').insert({
      admin_id: options.adminId === '00000000-0000-0000-0000-000000000000' ? null : options.adminId,
      action: options.action,
      target_table: options.targetTable || null,
      target_id: options.targetId || null,
      changes_before: (options.changesBefore as Json) || null,
      changes_after: (options.changesAfter as Json) || null,
      ip_address: ip,
      user_agent: userAgent,
    });

    if (error) {
      console.error('[AdminAuditLog] Failed to record admin audit event:', error.message);
    }
  } catch (err) {
    console.error('[AdminAuditLog] Unexpected error during audit log recording:', err);
  }
}

