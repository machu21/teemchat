import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  checkRateLimit,
  getClientIp,
  getRateLimitHeaders,
  RATE_LIMITS,
} from '@/lib/rateLimit';
import {
  isDisposableEmail,
  normalizeEmail,
  validateFormTiming,
  validateUsername,
} from '@/lib/security/disposableEmails';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);

    // 1. IP Sign-up Velocity Limit
    const rateResult = checkRateLimit(`ip:signup:${ip}`, RATE_LIMITS.AUTH_SIGNUP);
    if (!rateResult.success) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message: `Too many registration attempts from this network. Please wait ${rateResult.retryAfter} seconds before trying again.`,
          retryAfter: rateResult.retryAfter,
        },
        {
          status: 429,
          headers: getRateLimitHeaders(rateResult),
        }
      );
    }

    const body = await req.json().catch(() => ({}));
    const {
      email,
      password,
      username,
      displayName,
      gender = 'male',
      // Anti-Bot Honeypots: Humans leave these empty; bots fill them
      website_url,
      company_site_field,
      phone_alt,
      // Anti-Bot Form Velocity: Tracks form render duration
      renderedAt,
    } = body;

    // 2. Honeypot Trap Verification
    if (website_url || company_site_field || phone_alt) {
      // Intentionally reject bots with an ambiguous error
      return NextResponse.json(
        { error: 'Security validation failed. Please reload and try again.' },
        { status: 400 }
      );
    }

    // 3. Form Submission Timing Check
    const timingCheck = validateFormTiming(renderedAt);
    if (!timingCheck.valid) {
      return NextResponse.json(
        { error: timingCheck.reason },
        { status: 400 }
      );
    }

    // 4. Email Validation & Disposable Domain Shield
    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'A valid email address is required.' },
        { status: 400 }
      );
    }

    if (isDisposableEmail(email)) {
      return NextResponse.json(
        {
          error: 'Disposable and temporary email addresses are not permitted. Please use a permanent email address.',
        },
        { status: 400 }
      );
    }

    const cleanEmail = normalizeEmail(email);

    // 5. Username Validation
    const userCheck = validateUsername(username);
    if (!userCheck.valid) {
      return NextResponse.json(
        { error: userCheck.reason },
        { status: 400 }
      );
    }

    // 6. Password Quality Check
    if (!password || typeof password !== 'string' || password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters long.' },
        { status: 400 }
      );
    }

    const cleanGender = gender === 'female' ? 'female' : 'male';
    const cleanDisplayName = (displayName && typeof displayName === 'string')
      ? displayName.trim().slice(0, 32)
      : username.trim();

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: 'Server authentication configuration missing.' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // 7. Supabase Auth Registration
    const { data, error: authError } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          username: username.trim(),
          display_name: cleanDisplayName,
          gender: cleanGender,
        },
      },
    });

    if (authError || !data.user) {
      return NextResponse.json(
        { error: authError?.message || 'Failed to create user account.' },
        { status: 400 }
      );
    }

    // 8. Provision Secure Profile (Default to Free tier with trial limits)
    try {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        username: username.trim(),
        display_name: cleanDisplayName,
        gender: cleanGender,
        status: 'available',
        tier: 'free',
        is_paid: false,
        has_ai_companion: false,
      });
    } catch (e) {
      console.warn('Initial profile provisioning warning:', e);
    }

    return NextResponse.json(
      {
        success: true,
        user: data.user,
        session: data.session,
      },
      {
        status: 200,
        headers: getRateLimitHeaders(rateResult),
      }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Registration handler error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
