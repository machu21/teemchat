/**
 * Site configuration constants for SEO, metadata, and canonical URLs.
 */
export const SITE_NAME = 'TeemChat';
export const SITE_TITLE = 'TeemChat - 16-Bit Proximity Virtual Space';
export const SITE_DESCRIPTION =
  'A collaborative 16-bit virtual space with spatial proximity voice, Supabase Realtime, customizable pixel avatars, and an interactive AI Companion.';

export const SITE_KEYWORDS = [
  'TeemChat',
  '16-bit virtual space',
  'spatial audio',
  'proximity voice chat',
  'retro virtual office',
  'gather town alternative',
  'pixel art chat',
  'web gaming hangout',
  'AI companion chat',
  'collaborative virtual space',
];

/**
 * Returns the canonical base URL for the site.
 * Prioritizes NEXT_PUBLIC_SITE_URL, then falls back to Vercel production or localhost.
 */
export function getSiteUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (envUrl && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '');
  }
  return 'https://teemchat.vercel.app';
}

