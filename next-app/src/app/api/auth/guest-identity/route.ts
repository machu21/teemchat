import { NextRequest, NextResponse } from 'next/server';
import {
  checkRateLimit,
  getClientIp,
  getClientCountry,
  getRateLimitHeaders,
  RATE_LIMITS,
} from '@/lib/rateLimit';
import { generateIpTag, formatGuestHandles } from '@/lib/security/guestIdentity';

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const country = getClientCountry(req);

    // Enforce in-handler rate limiting on guest creation
    const rateResult = checkRateLimit(`ip:guest:${ip}`, RATE_LIMITS.GUEST_CREATE);
    if (!rateResult.success) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message: `Too many guest sessions requested from this network. Please wait ${rateResult.retryAfter} seconds before trying again.`,
          retryAfter: rateResult.retryAfter,
        },
        {
          status: 429,
          headers: getRateLimitHeaders(rateResult),
        }
      );
    }

    const { searchParams } = new URL(req.url);
    const instanceSeed = searchParams.get('instance') || undefined;

    const ipTag = generateIpTag(ip, instanceSeed);
    const { username, displayName } = formatGuestHandles(ipTag);

    return NextResponse.json(
      {
        success: true,
        ipTag,
        username,
        displayName,
        country,
      },
      {
        status: 200,
        headers: getRateLimitHeaders(rateResult),
      }
    );
  } catch (err: unknown) {
    // The internal error stays in the server log; the client only learns a fallback was used (OWASP A10).
    console.warn('Guest identity fallback:', err);
    const msg = 'Failed to determine guest identity';
    const fallbackTag = Math.floor(Math.random() * 9000 + 1000).toString(16).toUpperCase();
    const fallback = formatGuestHandles(fallbackTag);

    return NextResponse.json({
      success: true,
      ipTag: fallbackTag,
      username: fallback.username,
      displayName: fallback.displayName,
      country: 'XX',
      warning: msg,
    });
  }
}
