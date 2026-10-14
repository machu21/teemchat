import { NextRequest, NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const livekitApiKey = process.env.LIVEKIT_API_KEY || '';
const livekitApiSecret = process.env.LIVEKIT_API_SECRET || '';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);

    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized user token' }, { status: 401 });
    }

    const body = await req.json();
    const { spaceId, displayName } = body;

    if (!spaceId) {
      return NextResponse.json({ error: 'Missing spaceId' }, { status: 400 });
    }

    if (!livekitApiKey || !livekitApiSecret) {
      return NextResponse.json({ error: 'LiveKit server credentials unconfigured' }, { status: 500 });
    }

    const at = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity: user.id,
      name: displayName || user.email || 'Explorer',
      ttl: '2h',
    });

    at.addGrant({
      room: `space-${spaceId}`,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    });

    const jwt = await at.toJwt();
    return NextResponse.json({ token: jwt });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Error generating LiveKit token:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
