import { NextRequest, NextResponse } from 'next/server';
import { getClientIp } from '@/lib/rateLimit';
import { generateIpTag, formatGuestHandles } from '@/lib/security/guestIdentity';

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const { searchParams } = new URL(req.url);
    const instanceSeed = searchParams.get('instance') || undefined;

    const ipTag = generateIpTag(ip, instanceSeed);
    const { username, displayName } = formatGuestHandles(ipTag);

    return NextResponse.json({
      success: true,
      ipTag,
      username,
      displayName,
    });
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
