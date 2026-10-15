import { NextRequest, NextResponse } from 'next/server';
import {
  checkRateLimit,
  getClientIp,
  getRateLimitHeaders,
  RATE_LIMITS,
  type RateLimitConfig,
} from '@/lib/rateLimit';

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // Apply rate limiting to all API endpoints
  if (pathname.startsWith('/api/')) {
    const ip = getClientIp(req);

    // Differentiate limits by endpoint sensitivity
    let config: RateLimitConfig = RATE_LIMITS.DEFAULT_API;
    let prefix = 'ip:api';

    if (pathname.startsWith('/api/auth/register')) {
      config = RATE_LIMITS.AUTH_SIGNUP;
      prefix = 'ip:signup';
    } else if (pathname.startsWith('/api/companion/chat')) {
      config = RATE_LIMITS.AI_CHAT;
      prefix = 'ip:ai_chat';
    } else if (pathname.startsWith('/api/livekit/token')) {
      config = RATE_LIMITS.LIVEKIT_TOKEN;
      prefix = 'ip:livekit';
    }

    const rateResult = checkRateLimit(`${prefix}:${ip}`, config);

    if (!rateResult.success) {
      return NextResponse.json(
        {
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Please wait ${rateResult.retryAfter} seconds before trying again.`,
          retryAfter: rateResult.retryAfter,
        },
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            ...getRateLimitHeaders(rateResult),
          },
        }
      );
    }

    const response = NextResponse.next();
    const headers = getRateLimitHeaders(rateResult);
    for (const [key, value] of Object.entries(headers)) {
      response.headers.set(key, value);
    }
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
