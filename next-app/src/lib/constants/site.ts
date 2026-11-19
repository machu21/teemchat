/**
 * Site configuration constants for SEO, metadata, and canonical URLs.
 */
export const SITE_NAME = 'TeemChat';
export const SITE_TITLE = 'TeemChat - Free Pixel Hangout with Proximity Voice & Games';
export const SITE_DESCRIPTION =
  'Free pixel hangout in your browser. Walk up to friends to talk, play chess or zombie survival together, and meet your AI companion. Join as a guest in seconds.';

/**
 * lastmod for the static pages in sitemap.xml. Bump it when the landing or
 * legal pages change meaningfully; a value that changes on every build
 * teaches search engines to ignore lastmod.
 */
export const SITE_CONTENT_UPDATED = '2026-11-20';

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
  return 'https://www.teemchat.chat';
}

