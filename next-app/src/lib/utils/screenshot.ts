// Shared (client + server) helpers for Companion Screen Help screenshots.
// Kept free of browser/Node APIs so both the capture service and the API route can use them.

export const SCREENSHOT_MAX_WIDTH = 1280;
export const SCREENSHOT_JPEG_QUALITY = 0.7;
// ~1.5MB of binary data once base64-decoded (base64 inflates by 4/3)
export const SCREENSHOT_MAX_BASE64_LENGTH = 2_000_000;

export const SCREEN_HELP_PLATFORMS = ['Windows', 'macOS', 'Linux', 'ChromeOS', 'Unknown'] as const;
export type ScreenHelpPlatform = (typeof SCREEN_HELP_PLATFORMS)[number];

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png'] as const;
type ScreenshotMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/**
 * Scales a frame down (never up) so its width fits `maxWidth`, preserving aspect ratio.
 */
export function computeScaledSize(
  width: number,
  height: number,
  maxWidth: number = SCREENSHOT_MAX_WIDTH
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  if (width <= maxWidth) return { width: Math.round(width), height: Math.round(height) };
  const scale = maxWidth / width;
  return { width: Math.round(maxWidth), height: Math.max(1, Math.round(height * scale)) };
}

export type ScreenshotParseResult =
  | { ok: true; mimeType: ScreenshotMimeType; base64: string }
  | { ok: false; error: string };

/**
 * Validates a `data:image/...;base64,...` URL and splits it into mime type + payload.
 */
export function parseScreenshotDataUrl(input: unknown): ScreenshotParseResult {
  if (typeof input !== 'string' || input.length === 0) {
    return { ok: false, error: 'Missing screenshot' };
  }

  const match = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(input);
  if (!match) {
    return { ok: false, error: 'Screenshot must be a base64 image data URL' };
  }

  const mimeType = match[1] as ScreenshotMimeType;
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return { ok: false, error: 'Screenshot must be a JPEG or PNG image' };
  }

  const base64 = match[2];
  if (base64.length > SCREENSHOT_MAX_BASE64_LENGTH) {
    return { ok: false, error: 'Screenshot is too large' };
  }

  return { ok: true, mimeType, base64 };
}

/**
 * Best-effort desktop OS detection from a user agent string, used to tailor instructions.
 */
export function detectPlatform(userAgent: string): ScreenHelpPlatform {
  if (/CrOS/i.test(userAgent)) return 'ChromeOS';
  if (/Windows/i.test(userAgent)) return 'Windows';
  if (/Mac OS X|Macintosh/i.test(userAgent)) return 'macOS';
  if (/Linux/i.test(userAgent)) return 'Linux';
  return 'Unknown';
}

export function normalizePlatform(input: unknown): ScreenHelpPlatform {
  return SCREEN_HELP_PLATFORMS.includes(input as ScreenHelpPlatform)
    ? (input as ScreenHelpPlatform)
    : 'Unknown';
}
