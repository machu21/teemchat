import { NextRequest, NextResponse } from 'next/server';
import { AccessToken, TrackSource } from 'livekit-server-sdk';
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

interface RoomSafety {
  /** Refuse the token outright (banned from the space, or a blocked DM partner). */
  denied: boolean;
  /** Join and listen, but publish nothing (host voice-mute). */
  listenOnly: boolean;
}

// Space bans / voice mutes and DM blocks. Fails open if the safety RPCs are not
// deployed yet: the RLS checks in canJoinRoom still apply.
async function roomSafety(db: ScopedClient, userId: string, room: string): Promise<RoomSafety> {
  try {
    const space = room.match(SPACE_ROOM);
    if (space) {
      const { data, error } = await db.rpc('my_space_restrictions', { p_space: space[1] });
      if (error || !data) return { denied: false, listenOnly: false };
      const r = data as { banned?: boolean; voice_muted?: boolean };
      return { denied: r.banned === true, listenOnly: r.voice_muted === true };
    }
    const call = room.match(CALL_ROOM);
    if (call && call[1].toLowerCase() === 'dm') {
      const { data: convo } = await db
        .from('buddy_conversations')
        .select('user_one, user_two')
        .eq('id', call[2])
        .maybeSingle();
      const row = convo as { user_one: string; user_two: string } | null;
      if (!row) return { denied: false, listenOnly: false };
      const other = row.user_one === userId ? row.user_two : row.user_one;
      const { data, error } = await db.rpc('contact_permissions', { p_other: other });
      if (error || !data) return { denied: false, listenOnly: false };
      return { denied: (data as { can_message?: boolean }).can_message === false, listenOnly: false };
    }
  } catch {
    // Safety RPCs unavailable
  }
  return { denied: false, listenOnly: false };
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

    const safety = await roomSafety(supabase, userId, targetRoom);
    if (safety.denied) {
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

    // Spaces never publish cameras; camera is reserved for DM/group calls.
    const isCallRoom = CALL_ROOM.test(targetRoom);
    at.addGrant({
      room: targetRoom,
      roomJoin: true,
      canPublish: !safety.listenOnly,
      canSubscribe: true,
      canPublishData: true,
      // Spaces: voice plus screen share (shown only inside private rooms by the client).
      ...(isCallRoom
        ? {}
        : {
            canPublishSources: [TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO],
          }),
    });

    const jwt = await at.toJwt();
    return NextResponse.json({ token: jwt });
  } catch (err: unknown) {
    console.error('Error generating LiveKit token:', err);
    return NextResponse.json({ error: 'Failed to generate token' }, { status: 500 });
  }
}
