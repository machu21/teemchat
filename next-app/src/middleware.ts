import { NextRequest, NextResponse } from 'next/server';
import {
  checkRateLimit,
  getClientIp,
  getRateLimitHeaders,
  RATE_LIMITS,
  type RateLimitConfig,
} from '@/lib/rateLimit';

// Appended to the WebView UA by capacitor.config.ts. Keep in sync with src/lib/platform/nativeApp.ts.
const NATIVE_APP_UA_TOKEN = 'TeemChatApp';

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // Native app (APK / iOS): skip the marketing landing page and serve the
  // login / guest entry screen. Rewrite keeps the URL at '/' so existing
  // router.push('/') and '/?signup=1' links keep working.
  if (pathname === '/' && req.headers.get('user-agent')?.includes(NATIVE_APP_UA_TOKEN)) {
    const url = req.nextUrl.clone();
    url.pathname = '/app';
    return NextResponse.rewrite(url);
  }

  // Apply rate limiting to all API endpoints
  if (pathname.startsWith('/api/')) {
    const ip = getClientIp(req);

    // Differentiate limits by endpoint sensitivity
    let config: RateLimitConfig = RATE_LIMITS.DEFAULT_API;
    let prefix = 'ip:api';

    if (pathname.startsWith('/api/auth/register')) {
      config = RATE_LIMITS.AUTH_SIGNUP;
      prefix = 'ip:signup';
    } else if (pathname.startsWith('/api/auth/login')) {
      config = RATE_LIMITS.AUTH_LOGIN;
      prefix = 'ip:login';
    } else if (pathname.startsWith('/api/auth/guest-identity')) {
      config = RATE_LIMITS.GUEST_CREATE;
      prefix = 'ip:guest';
    } else if (pathname.startsWith('/api/companion/chat')) {
      config = RATE_LIMITS.AI_CHAT;
      prefix = 'ip:ai_chat';
    } else if (pathname.startsWith('/api/companion/screen-help')) {
      config = RATE_LIMITS.AI_SCREEN_HELP;
      prefix = 'ip:ai_screen_help';
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
  matcher: ['/', '/api/:path*'],
};
