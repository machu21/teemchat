import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { checkRateLimit, getRateLimitHeaders, RateLimitConfig } from '@/lib/rateLimit';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

export type CompanionAuthResult =
  | { ok: true; user: User; supabase: SupabaseClient }
  | { ok: false; response: NextResponse };

/**
 * Shared gate for AI companion routes: valid Supabase user, not a guest, within the
 * per-user rate limit. Returns a ready-to-send error response otherwise.
 */
export async function authenticateCompanionRequest(
  req: NextRequest,
  rateKeyPrefix: string,
  rateConfig: RateLimitConfig
): Promise<CompanionAuthResult> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const token = authHeader.replace('Bearer ', '');
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) {
    return { ok: false, response: NextResponse.json({ error: 'Invalid user token' }, { status: 401 }) };
  }

  // Guest sessions don't get an AI companion. The email domain is set by provision_guest_account
  // and is the authoritative signal; metadata flags are checked as a fallback.
  const isGuest =
    Boolean(user.is_anonymous) ||
    Boolean(user.app_metadata?.is_guest) ||
    Boolean(user.user_metadata?.is_guest) ||
    Boolean(user.email?.endsWith('@guest.teemchat.local'));
  if (isGuest) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Forbidden', message: 'Sign in with an account to chat with your companion.' },
        { status: 403 }
      ),
    };
  }

  const userRate = checkRateLimit(`${rateKeyPrefix}:${user.id}`, rateConfig);
  if (!userRate.success) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message: `You are sending messages too quickly. Please wait ${userRate.retryAfter} seconds before sending another message.`,
          retryAfter: userRate.retryAfter,
        },
        {
          status: 429,
          headers: getRateLimitHeaders(userRate),
        }
      ),
    };
  }

  return { ok: true, user, supabase };
}

export type CompanionQuotaResult =
  | { allowed: true }
  | { allowed: false; isTrial: boolean; limitType?: 'daily' | 'window' | 'trial'; resetsAt?: string };

/**
 * AI message quota (shared across all companion routes). AI add-on holders get a
 * rolling 5-hour window; everyone else gets 5 trial messages in total.
 * Fails open on RPC errors, matching the original chat route behaviour.
 */
export async function checkCompanionQuota(supabase: SupabaseClient): Promise<CompanionQuotaResult> {
  try {
    const { data: usage } = await supabase.rpc('check_and_increment_ai_usage', {
      p_daily_limit: 50,
    });

    if (usage && typeof usage === 'object' && 'allowed' in usage && !usage.allowed) {
      const u = usage as { is_trial?: boolean; limit_type?: string; resets_at?: string | null };
      return {
        allowed: false,
        isTrial: Boolean(u.is_trial),
        limitType:
          u.limit_type === 'window' || u.limit_type === 'daily' || u.limit_type === 'trial'
            ? u.limit_type
            : undefined,
        resetsAt: typeof u.resets_at === 'string' ? u.resets_at : undefined,
      };
    }
  } catch (e) {
    console.warn('Quota check warning:', e);
  }
  return { allowed: true };
}

/** Human-friendly "in 2h 15m" until the AI window resets. */
export function formatWindowReset(resetsAt: string | undefined, now: number = Date.now()): string {
  const ms = resetsAt ? new Date(resetsAt).getTime() - now : NaN;
  if (!Number.isFinite(ms) || ms <= 0) return 'shortly';
  const totalMin = Math.ceil(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `in ${h}h ${m}m` : `in ${m}m`;
}
