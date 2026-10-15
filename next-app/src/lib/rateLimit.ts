export interface RateLimitConfig {
  max: number; // Maximum number of requests allowed within the window
  windowMs: number; // Time window in milliseconds
}

export interface RateLimitResult {
  success: boolean; // Whether the request is permitted
  limit: number; // The maximum limit configured
  remaining: number; // Number of remaining requests allowed in the current window
  reset: number; // Unix timestamp (in seconds) when the oldest window request expires
  retryAfter?: number; // Seconds to wait before making another request (if success is false)
}

export const RATE_LIMITS = {
  // Strictest: AI LLM inference calls (protects expensive Gemini API quota)
  AI_CHAT: { max: 10, windowMs: 60 * 1000 } as const,
  // Authenticated user limit for AI chat
  USER_AI_CHAT: { max: 15, windowMs: 60 * 1000 } as const,
  // LiveKit WebRTC access token generation
  LIVEKIT_TOKEN: { max: 20, windowMs: 60 * 1000 } as const,
  // Authenticated user limit for LiveKit token
  USER_LIVEKIT_TOKEN: { max: 25, windowMs: 60 * 1000 } as const,
  // Authentication and Sign-Up velocity limit (prevents bot farm mass account creation)
  AUTH_SIGNUP: { max: 5, windowMs: 15 * 60 * 1000 } as const,
  // Guest session generation limit
  GUEST_CREATE: { max: 10, windowMs: 15 * 60 * 1000 } as const,
  // Standard API routes limit
  DEFAULT_API: { max: 60, windowMs: 60 * 1000 } as const,
};

export class RateLimiter {
  private store: Map<string, number[]>;
  private lastCleanup: number;
  private readonly cleanupIntervalMs: number;

  constructor(cleanupIntervalMs = 60 * 1000) {
    this.store = new Map();
    this.lastCleanup = Date.now();
    this.cleanupIntervalMs = cleanupIntervalMs;
  }

  public check(key: string, config: RateLimitConfig, now = Date.now()): RateLimitResult {
    this.lazyCleanup(now, config.windowMs);

    const windowStart = now - config.windowMs;
    const existing = this.store.get(key) || [];

    // Filter out timestamps outside the sliding window
    const validTimestamps = existing.filter((ts) => ts > windowStart);

    if (validTimestamps.length >= config.max) {
      const oldest = validTimestamps[0] ?? now;
      const resetMs = oldest + config.windowMs;
      const retryAfter = Math.max(1, Math.ceil((resetMs - now) / 1000));
      const reset = Math.ceil(resetMs / 1000);

      this.store.set(key, validTimestamps);
      return {
        success: false,
        limit: config.max,
        remaining: 0,
        reset,
        retryAfter,
      };
    }

    validTimestamps.push(now);
    this.store.set(key, validTimestamps);

    const oldest = validTimestamps[0] ?? now;
    const reset = Math.ceil((oldest + config.windowMs) / 1000);

    return {
      success: true,
      limit: config.max,
      remaining: Math.max(0, config.max - validTimestamps.length),
      reset,
    };
  }

  public reset(): void {
    this.store.clear();
    this.lastCleanup = Date.now();
  }

  public size(): number {
    return this.store.size;
  }

  public manualCleanup(now = Date.now(), maxWindowMs = 60 * 1000): void {
    const oldestAllowed = now - maxWindowMs;
    for (const [key, timestamps] of this.store.entries()) {
      const active = timestamps.filter((ts) => ts > oldestAllowed);
      if (active.length === 0) {
        this.store.delete(key);
      } else {
        this.store.set(key, active);
      }
    }
  }

  private lazyCleanup(now: number, maxWindowMs: number): void {
    if (now - this.lastCleanup < this.cleanupIntervalMs && this.store.size < 5000) {
      return;
    }

    this.lastCleanup = now;
    this.manualCleanup(now, maxWindowMs);
  }
}

// Global default singleton instance
export const defaultRateLimiter = new RateLimiter();

export function checkRateLimit(
  key: string,
  config: RateLimitConfig,
  limiter: RateLimiter = defaultRateLimiter
): RateLimitResult {
  return limiter.check(key, config);
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const ip = forwarded.split(',')[0]?.trim();
    if (ip) return ip;
  }

  const realIp = req.headers.get('x-real-ip');
  if (realIp && realIp.trim()) {
    return realIp.trim();
  }

  const cfConnectingIp = req.headers.get('cf-connecting-ip');
  if (cfConnectingIp && cfConnectingIp.trim()) {
    return cfConnectingIp.trim();
  }

  return '127.0.0.1';
}

export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(result.reset),
  };

  if (result.retryAfter !== undefined) {
    headers['Retry-After'] = String(result.retryAfter);
  }

  return headers;
}
