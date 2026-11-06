import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../database.types';
import {
  checkRateLimit,
  getClientIp,
  getRateLimitHeaders,
  RATE_LIMITS,
} from '../rateLimit';
import { SystemRole } from './schemas';

function safeCompareKeys(a: string, b: string): boolean {
  const bufA = Buffer.from(a.trim());
  const bufB = Buffer.from(b.trim());
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export interface AdminUserContext {
  id: string;
  email: string;
  username: string;
  displayName: string;
  systemRole: SystemRole;
  isMachineKey?: boolean;
}

export type AdminAuthResult =
  | { ok: true; admin: AdminUserContext; supabaseAdmin: SupabaseClient<Database> }
  | { ok: false; response: NextResponse };

let cachedAdminClient: SupabaseClient<Database> | null = null;

/**
 * Returns a privileged Supabase client powered by the service role key.
 * This client bypasses PostgreSQL Row Level Security (RLS) and is strictly reserved
 * for verified server-side administrative handlers.
 */
export function getSupabaseAdminClient(): SupabaseClient<Database> {
  if (cachedAdminClient) return cachedAdminClient;

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://pirpqkbdayorovfzczpq.supabase.co';
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    '';

  cachedAdminClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return cachedAdminClient;
}

/**
 * Validates whether the incoming Next.js API request is authorized for administrative actions.
 * Enforces rate limiting, token extraction, identity verification, and role guard checks.
 */
export async function verifyAdminRequest(
  req: NextRequest,
  options: { requireSuperadmin?: boolean; mutation?: boolean } = {}
): Promise<AdminAuthResult> {
  const ip = getClientIp(req);
  const rateConfig = options.mutation ? RATE_LIMITS.ADMIN_MUTATION : RATE_LIMITS.ADMIN_API;
  const rateResult = checkRateLimit(`ip:admin:${ip}`, rateConfig);

  if (!rateResult.success) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message: `Too many requests to admin interface. Please wait ${rateResult.retryAfter} seconds.`,
          retryAfter: rateResult.retryAfter,
        },
        {
          status: 429,
          headers: getRateLimitHeaders(rateResult),
        }
      ),
    };
  }

  const supabaseAdmin = getSupabaseAdminClient();

  // 1. Check for Machine API Key authorization (X-Admin-Api-Key)
  const apiKeyHeader = req.headers.get('x-admin-api-key');
  const serverApiKey = process.env.ADMIN_SECRET_KEY;

  if (apiKeyHeader) {
    if (serverApiKey && safeCompareKeys(apiKeyHeader, serverApiKey)) {
      return {
        ok: true,
        admin: {
          id: '00000000-0000-0000-0000-000000000000',
          email: 'system-machine@teemchat.internal',
          username: 'system_admin_key',
          displayName: 'System Admin API Key',
          systemRole: 'superadmin',
          isMachineKey: true,
        },
        supabaseAdmin,
      };
    }
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Unauthorized', message: 'Invalid administrative API key.' },
        { status: 401, headers: getRateLimitHeaders(rateResult) }
      ),
    };
  }

  // 2. Check for User Bearer JWT Token
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Unauthorized', message: 'Missing or malformed Authorization header.' },
        { status: 401, headers: getRateLimitHeaders(rateResult) }
      ),
    };
  }

  const token = authHeader.substring(7).trim();
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);

  if (userError || !userData?.user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Unauthorized', message: 'Invalid or expired administrative session token.' },
        { status: 401, headers: getRateLimitHeaders(rateResult) }
      ),
    };
  }

  const user = userData.user;

  // 3. Query caller's profile to verify system administrative role and active status
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, username, display_name, system_role, status')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Forbidden', message: 'Admin profile record not found.' },
        { status: 403, headers: getRateLimitHeaders(rateResult) }
      ),
    };
  }

  if (profile.status === 'banned' || profile.status === 'suspended') {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Forbidden',
          message: 'Administrative account is suspended or banned. Access denied.',
        },
        { status: 403, headers: getRateLimitHeaders(rateResult) }
      ),
    };
  }

  const systemRole = (profile.system_role as SystemRole) || 'user';
  const isAllowed = options.requireSuperadmin
    ? systemRole === 'superadmin'
    : systemRole === 'admin' || systemRole === 'superadmin';

  if (!isAllowed) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Forbidden',
          message: 'Insufficient administrative privileges. Access denied.',
        },
        { status: 403, headers: getRateLimitHeaders(rateResult) }
      ),
    };
  }

  return {
    ok: true,
    admin: {
      id: profile.id,
      email: user.email || '',
      username: profile.username || 'admin',
      displayName: profile.display_name,
      systemRole,
    },
    supabaseAdmin,
  };
}

