import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  checkRateLimit,
  defaultRateLimiter,
  getClientIp,
  getRateLimitHeaders,
  RATE_LIMITS,
} from '@/lib/rateLimit';
import { normalizeEmail } from '@/lib/security/disposableEmails';

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);

    // 1. IP-Level Velocity Limit (prevents bot-net credential stuffing across accounts)
    const ipRateResult = checkRateLimit(`ip:login:${ip}`, RATE_LIMITS.AUTH_LOGIN);
    if (!ipRateResult.success) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message: `Too many login attempts from this network. Please wait ${ipRateResult.retryAfter} seconds before trying again.`,
          retryAfter: ipRateResult.retryAfter,
        },
        {
          status: 429,
          headers: getRateLimitHeaders(ipRateResult),
        }
      );
    }

    // 2. Request Body Validation
    const body = await req.json().catch(() => ({}));
    const { email, password } = body || {};

    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'Email and password are required.' },
        {
          status: 400,
          headers: getRateLimitHeaders(ipRateResult),
        }
      );
    }

    const cleanEmail = normalizeEmail(email);

    // 3. Account-Level Velocity Limit (prevents targeted brute-force attacks against a single user)
    const accountRateResult = checkRateLimit(
      `account:login:${cleanEmail}`,
      RATE_LIMITS.AUTH_LOGIN_ACCOUNT
    );
    if (!accountRateResult.success) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message: `Too many failed login attempts for this account. Please wait ${accountRateResult.retryAfter} seconds before trying again.`,
          retryAfter: accountRateResult.retryAfter,
        },
        {
          status: 429,
          headers: getRateLimitHeaders(accountRateResult),
        }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: 'Server authentication configuration missing.' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // 4. Authenticate via Supabase Auth
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (authError || !data.user) {
      return NextResponse.json(
        {
          error: authError?.message || 'Invalid email or password.',
          remainingAttempts: accountRateResult.remaining,
        },
        {
          status: 401,
          headers: getRateLimitHeaders(accountRateResult),
        }
      );
    }

    // 5. On successful login, reset account failure window so legitimate users are not penalized
    defaultRateLimiter.resetKey(`account:login:${cleanEmail}`);

    return NextResponse.json(
      {
        success: true,
        user: data.user,
        session: data.session,
      },
      {
        status: 200,
        headers: getRateLimitHeaders(accountRateResult),
      }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Login handler error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
