import { ADSENSE_CLIENT } from '@/lib/ads/adSettings';

/**
 * /ads.txt — authorizes Google to sell ads on this domain.
 * Built from NEXT_PUBLIC_ADSENSE_CLIENT (ca-pub-…); 404 until it is set.
 */
export function GET() {
  const match = /^ca-(pub-\d{6,})$/.exec(ADSENSE_CLIENT);
  if (!match) return new Response('Not found', { status: 404 });
  return new Response(`google.com, ${match[1]}, DIRECT, f08c47fec0942fa0\n`, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
