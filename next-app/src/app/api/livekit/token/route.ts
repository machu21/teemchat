import { NextRequest, NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, getRateLimitHeaders, RATE_LIMITS } from '@/lib/rateLimit';
import { defaultHQ } from '@/lib/models/space';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
const livekitApiKey = process.env.LIVEKIT_API_KEY || '';
const livekitApiSecret = process.env.LIVEKIT_API_SECRET || '';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const SPACE_ROOM = new RegExp(`^space-(${UUID})$`, 'i');
const LOBBY_ROOM = /^space-room-[a-z0-9_-]{1,64}$/;
const CALL_ROOM = new RegExp(`^call-(dm|group)-(${UUID})$`, 'i');

// Client scoped to the caller's JWT so every query runs under their RLS view.
function createScopedClient(token: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type ScopedClient = ReturnType<typeof createScopedClient>;

// Checks the room against the caller's own RLS view: a row is only visible if they may join.
async function canJoinRoom(db: ScopedClient, userId: string, room: string): Promise<boolean> {
  if (LOBBY_ROOM.test(room)) return true;

  const space = room.match(SPACE_ROOM);
  if (space) {
    if (space[1].toLowerCase() === defaultHQ().id) return true;
    const { data } = await db.from('spaces').select('id').eq('id', space[1]).maybeSingle();
    return Boolean(data);
  }

  const call = room.match(CALL_ROOM);
  if (call) {
    const [, kind, conversationId] = call;
    if (kind.toLowerCase() === 'dm') {
      const { data } = await db
        .from('buddy_conversations')
        .select('user_one, user_two')
        .eq('id', conversationId)
        .maybeSingle();
      const row = data as { user_one: string; user_two: string } | null;
      return Boolean(row && (row.user_one === userId || row.user_two === userId));
    }
    const { data } = await db
      .from('group_conversation_members')
      .select('user_id')
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .maybeSingle();
    return Boolean(data);
  }

  return false;
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = createScopedClient(token);

    // Guests are provisioned as real Supabase users, so every caller must present a verified JWT.
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized user token' }, { status: 401 });
    }
    const userId = user.id;
    const userIdentifier = user.email || user.id;

    const userRate = checkRateLimit(`user:livekit:${userId}`, RATE_LIMITS.USER_LIVEKIT_TOKEN);
    if (!userRate.success) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message: `Too many token requests. Please wait ${userRate.retryAfter} seconds before requesting another token.`,
          retryAfter: userRate.retryAfter,
        },
        {
          status: 429,
          headers: getRateLimitHeaders(userRate),
        }
      );
    }

    const body = await req.json();
    const { spaceId, roomName, displayName } = body;
    const targetRoom = roomName || (spaceId ? `space-${spaceId}` : null);

    if (!targetRoom || typeof targetRoom !== 'string') {
      return NextResponse.json({ error: 'Missing roomName or spaceId' }, { status: 400 });
    }

    if (!(await canJoinRoom(supabase, userId, targetRoom))) {
      return NextResponse.json({ error: 'Not allowed to join this room' }, { status: 403 });
    }

    if (!livekitApiKey || !livekitApiSecret) {
      return NextResponse.json({ error: 'LiveKit server credentials unconfigured' }, { status: 500 });
    }

    const at = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity: userId,
      name: (typeof displayName === 'string' && displayName.slice(0, 64)) || userIdentifier || 'Explorer',
      ttl: '2h',
    });

    at.addGrant({
      room: targetRoom,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const jwt = await at.toJwt();
    return NextResponse.json({ token: jwt });
  } catch (err: unknown) {
    console.error('Error generating LiveKit token:', err);
    return NextResponse.json({ error: 'Failed to generate token' }, { status: 500 });
  }
}
