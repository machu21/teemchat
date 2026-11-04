import { NextRequest, NextResponse } from 'next/server';
import {
  checkRateLimit,
  getClientIp,
  getRateLimitHeaders,
  RATE_LIMITS,
} from '@/lib/rateLimit';
import { generateIpTag, formatGuestHandles } from '@/lib/security/guestIdentity';

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req);

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
      },
      {
        status: 200,
        headers: getRateLimitHeaders(rateResult),
      }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to determine guest identity';
    const fallbackTag = Math.floor(Math.random() * 9000 + 1000).toString(16).toUpperCase();
    const fallback = formatGuestHandles(fallbackTag);

    return NextResponse.json({
      success: true,
      ipTag: fallbackTag,
      username: fallback.username,
      displayName: fallback.displayName,
      warning: msg,
    });
  }
}
