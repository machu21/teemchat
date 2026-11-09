import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateBirthDate } from '@/lib/safety/ageBand';
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
      birthDate,
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

    // Birth date drives Family Mode. Optional here (Google/guest users are asked by the
    // in-app age gate instead); when given it must be valid. Stored as auth metadata and
    // claimed into user_safety by set_my_birth_date() on first load.
    let cleanBirthDate: string | undefined;
    if (birthDate !== undefined && birthDate !== null && birthDate !== '') {
      const birthDateError = typeof birthDate === 'string' ? validateBirthDate(birthDate) : 'Invalid birth date.';
      if (birthDateError) {
        return NextResponse.json({ error: birthDateError, code: 'invalid_birth_date' }, { status: 400 });
      }
      cleanBirthDate = (birthDate as string).trim();
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
    const cleanUsername = username.trim();

    // 7. Username availability (profiles are publicly readable; username is UNIQUE)
    const { data: takenProfile, error: usernameLookupError } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', cleanUsername)
      .maybeSingle();
    if (!usernameLookupError && takenProfile) {
      return NextResponse.json(
        { error: 'That username is already taken. Please choose another.', code: 'username_taken' },
        { status: 409, headers: getRateLimitHeaders(rateResult) }
      );
    }

    // 8. Supabase Auth Registration
    const { data, error: authError } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          username: cleanUsername,
          display_name: cleanDisplayName,
          gender: cleanGender,
          ...(cleanBirthDate ? { birth_date: cleanBirthDate } : {}),
        },
      },
    });

    // Existing email: with email confirmation OFF Supabase returns `user_already_exists`;
    // with confirmation ON it returns an obfuscated user that has no identities.
    const emailAlreadyRegistered =
      authError?.code === 'user_already_exists' ||
      /already (registered|exists)/i.test(authError?.message || '') ||
      (!authError && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0);
    if (emailAlreadyRegistered) {
      return NextResponse.json(
        {
          error: 'An account with this email already exists. Try logging in instead.',
          code: 'email_taken',
        },
        { status: 409, headers: getRateLimitHeaders(rateResult) }
      );
    }

    if (authError || !data.user) {
      return NextResponse.json(
        { error: authError?.message || 'Failed to create user account.' },
        { status: 400 }
      );
    }

    // 9. Provision Secure Profile (Default to Free tier with trial limits)
    try {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        username: cleanUsername,
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
