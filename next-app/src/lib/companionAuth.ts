import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { checkRateLimit, getRateLimitHeaders, RateLimitConfig } from '@/lib/rateLimit';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

export type CompanionAuthResult =
  | { ok: true; user: User; supabase: SupabaseClient }
  | { ok: false; response: NextResponse };

/**
 * Shared gate for every AI route: valid Supabase user, not a guest, within the
 * per-user rate limit, and holding a paid AI add-on (402 otherwise).
 * Returns a ready-to-send error response when any check fails.
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

  // AI is a paid product: only accounts holding an active AI add-on get past this point.
  if (!(await hasPaidAiAddon(supabase, user.id))) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: AI_ADDON_REQUIRED_MESSAGE, message: AI_ADDON_REQUIRED_MESSAGE, upgradeRequired: true },
        { status: 402 }
      ),
    };
  }

  return { ok: true, user, supabase };
}

export const AI_ADDON_REQUIRED_MESSAGE =
  'AI features are part of the paid AI Companion add-on. Get the add-on to use them.';

export const AI_UNAVAILABLE_MESSAGE = 'AI is unavailable right now. Please try again shortly.';

type AiSubscriptionRow = {
  status?: string | null;
  has_ai_addon?: boolean | null;
  current_period_end?: string | null;
};

/** Mirrors the SQL helper has_active_ai_addon(): a paid add-on on a live, unexpired subscription. */
export function isAiAddonActive(row: AiSubscriptionRow | null | undefined, now: number = Date.now()): boolean {
  if (!row || row.has_ai_addon !== true) return false;
  if (row.status !== 'active' && row.status !== 'trialing') return false;
  if (row.current_period_end == null) return true;
  const end = new Date(row.current_period_end).getTime();
  return Number.isFinite(end) && end > now;
}

/**
 * Does this user hold a paid AI add-on? Reads their own subscription row (RLS lets a
 * user SELECT only their row, and only the service role can write it). Fails closed:
 * any error or missing row means no access.
 */
export async function hasPaidAiAddon(supabase: SupabaseClient, userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('user_subscriptions')
      .select('status, has_ai_addon, current_period_end')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      console.warn('AI add-on check warning:', error);
      return false;
    }
    return isAiAddonActive(data as AiSubscriptionRow | null);
  } catch (e) {
    console.warn('AI add-on check warning:', e);
    return false;
  }
}

export type CompanionQuotaResult =
  | { allowed: true }
  | {
      allowed: false;
      /** True when the account has no paid AI add-on (show the purchase buttons). */
      isTrial: boolean;
      limitType?: 'daily' | 'window' | 'trial' | 'addon_required' | 'unavailable';
      resetsAt?: string;
    };

/**
 * AI message quota (shared across all AI routes). AI add-on holders get a rolling
 * 5-hour window; accounts without the add-on get nothing.
 * Fails closed: the message is only allowed when the RPC explicitly says so.
 */
export async function checkCompanionQuota(supabase: SupabaseClient): Promise<CompanionQuotaResult> {
  try {
    const { data: usage, error } = await supabase.rpc('check_and_increment_ai_usage', {
      p_daily_limit: 50,
    });
    if (error) console.warn('Quota check warning:', error);

    if (!error && usage && typeof usage === 'object') {
      const u = usage as { allowed?: unknown; is_trial?: boolean; limit_type?: string; resets_at?: string | null };
      if (u.allowed === true) return { allowed: true };
      return {
        allowed: false,
        isTrial: Boolean(u.is_trial) || u.limit_type === 'addon_required',
        limitType:
          u.limit_type === 'window' ||
          u.limit_type === 'daily' ||
          u.limit_type === 'trial' ||
          u.limit_type === 'addon_required'
            ? u.limit_type
            : undefined,
        resetsAt: typeof u.resets_at === 'string' ? u.resets_at : undefined,
      };
    }
  } catch (e) {
    console.warn('Quota check warning:', e);
  }
  return { allowed: false, isTrial: false, limitType: 'unavailable' };
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
