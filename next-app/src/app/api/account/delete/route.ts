import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, getClientIp, getRateLimitHeaders, RATE_LIMITS } from '@/lib/rateLimit';
import { AdminConfigError, getSupabaseAdminClient } from '@/lib/admin/adminAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

/** Space playlist audio lives at `<spaceId>/<trackId>.mp3` (see services/playlist.ts). */
const AUDIO_BUCKET = 'space-audio';
const LIVE_SUBSCRIPTION = ['active', 'trialing', 'past_due', 'unpaid'];
const CONFIRM_PHRASE = 'DELETE';

const json = (body: Record<string, unknown>, status: number, headers?: Record<string, string>) =>
  NextResponse.json(body, { status, headers });

/** Cancels a Stripe subscription right away so a deleted account is never billed again. */
async function cancelStripeSubscription(subscriptionId: string, secretKey: string): Promise<boolean> {
  const res = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  // 404: already gone on Stripe's side, which is what we want
  return res.ok || res.status === 404;
}

/**
 * Self-service account deletion (App Store guideline 5.1.1(v), Google Play
 * account deletion policy). Permanently deletes the signed-in user: their
 * auth row (profile, spaces, messages, friends, companion… cascade from it),
 * their spaces' uploaded audio, and any live paid subscription.
 */
export async function POST(req: NextRequest) {
  const rate = checkRateLimit(`ip:account-delete:${getClientIp(req)}`, RATE_LIMITS.ACCOUNT_DELETE);
  if (!rate.success) {
    return json(
      { error: 'Too many requests', message: `Please wait ${rate.retryAfter} seconds and try again.` },
      429,
      getRateLimitHeaders(rate)
    );
  }

  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Unauthorized' }, 401);

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  if (!body || typeof body !== 'object' || (body as { confirm?: unknown }).confirm !== CONFIRM_PHRASE) {
    return json({ error: 'Confirmation required', message: `Type ${CONFIRM_PHRASE} to confirm.` }, 400);
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser(token);
  if (authErr || !user) return json({ error: 'Invalid user token' }, 401);

  let admin;
  try {
    admin = getSupabaseAdminClient();
  } catch (e) {
    const message = e instanceof AdminConfigError ? e.message : 'Account deletion is unavailable right now.';
    console.error('Account deletion unavailable:', message);
    return json({ error: 'Unavailable', message: 'Account deletion is unavailable right now. Please contact support.' }, 503);
  }

  try {
    // Staff accounts are removed by another admin, so the team never loses its last superadmin by accident
    const { data: profile } = await admin.from('profiles').select('system_role').eq('id', user.id).maybeSingle();
    const role = (profile as { system_role?: string | null } | null)?.system_role;
    if (role === 'admin' || role === 'superadmin') {
      return json(
        { error: 'Forbidden', message: 'Admin accounts must be removed by another admin from the admin panel.' },
        403
      );
    }

    // 1. Stop billing first: never delete an account that would keep being charged
    const { data: subs } = await admin
      .from('user_subscriptions')
      .select('stripe_subscription_id, status')
      .eq('user_id', user.id);
    const live = ((subs ?? []) as { stripe_subscription_id: string | null; status: string | null }[]).filter(
      (s) => s.stripe_subscription_id && LIVE_SUBSCRIPTION.includes(String(s.status))
    );
    if (live.length) {
      const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
      if (!stripeKey) {
        return json(
          {
            error: 'Subscription active',
            message:
              'You have an active paid plan. Cancel it on teemchat.chat (Account > Manage billing), then delete your account.',
          },
          409
        );
      }
      for (const s of live) {
        if (!(await cancelStripeSubscription(s.stripe_subscription_id as string, stripeKey))) {
          return json(
            { error: 'Billing error', message: 'We could not cancel your paid plan. Please try again or contact support.' },
            502
          );
        }
      }
    }

    // 2. Uploaded audio in the user's own spaces (storage files don't cascade with rows)
    const { data: spaces } = await admin.from('spaces').select('id').eq('owner_id', user.id);
    for (const space of (spaces ?? []) as { id: string }[]) {
      const { data: files } = await admin.storage.from(AUDIO_BUCKET).list(space.id, { limit: 1000 });
      const paths = (files ?? []).map((f) => `${space.id}/${f.name}`);
      if (paths.length) await admin.storage.from(AUDIO_BUCKET).remove(paths);
    }

    // 3. The account itself; everything keyed to the user cascades from auth.users
    const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
    if (delErr) {
      console.error('Account deletion failed:', delErr.message);
      return json({ error: 'Delete failed', message: 'We could not delete your account. Please contact support.' }, 500);
    }

    return json({ message: 'Your account has been deleted.' }, 200);
  } catch (err) {
    console.error('Account deletion error:', err);
    return json({ error: 'Delete failed', message: 'We could not delete your account. Please contact support.' }, 500);
  }
}
