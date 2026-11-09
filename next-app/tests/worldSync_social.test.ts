import { describe, it, expect, vi, beforeEach } from 'vitest';

type Handler = (envelope: Record<string, unknown>) => void;

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, Handler>();
  let subscribeCb: ((status: string) => void) | null = null;
  const channel = {
    on: vi.fn((type: string, filter: { event: string }, cb: Handler) => {
      handlers.set(`${type}:${filter.event}`, cb);
      return channel;
    }),
    subscribe: vi.fn((cb: (status: string) => void) => {
      subscribeCb = cb;
      return channel;
    }),
    track: vi.fn().mockResolvedValue('ok'),
    send: vi.fn().mockResolvedValue('ok'),
    presenceState: vi.fn(() => ({})),
  };
  return {
    handlers,
    channel,
    fireSubscribed: () => subscribeCb?.('SUBSCRIBED'),
  };
});

vi.mock('../src/lib/supabase', () => ({
  supabase: { channel: vi.fn(() => mocks.channel) },
  removeRealtimeChannel: vi.fn(),
  cleanupExistingChannel: vi.fn(),
}));

import { WorldSyncService } from '../src/lib/services/worldSync';

const ME = '11111111-1111-4111-8111-111111111111';
const PEER = '22222222-2222-4222-8222-222222222222';

function emit(event: string, payload: Record<string, unknown>) {
  mocks.handlers.get(`broadcast:${event}`)?.({ payload });
}

async function connected() {
  const sync = new WorldSyncService({ spaceId: 'space-1', currentUserId: ME, displayName: 'Me', avatarConfig: {} as never });
  await sync.connect();
  mocks.fireSubscribed();
  await Promise.resolve();
  return sync;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.handlers.clear();
});

describe('WorldSync social events', () => {
  it('routes valid room events and drops ones not meant for us', async () => {
    const sync = await connected();
    const events: unknown[] = [];
    const cleanup = sync.setRoomHandlers({ onRoomEvent: (e) => events.push(e) });

    emit('room_lock', { room_id: 'office-boardroom', actor_id: PEER, locked: true });
    emit('knock_reply', { room_id: 'office-boardroom', actor_id: PEER, target_id: 'someone-else', allow: true });
    emit('knock', { room_id: 'office-boardroom', actor_id: ME, actor_name: 'Me' }); // our own
    emit('room_lock', { room_id: 'office-boardroom', actor_id: PEER, locked: 'maybe' });

    expect(events).toEqual([{ type: 'room_lock', roomId: 'office-boardroom', locked: true, actorId: PEER }]);

    cleanup();
    emit('room_lock', { room_id: 'office-boardroom', actor_id: PEER, locked: false });
    expect(events).toHaveLength(1);
  });

  it('applies valid emotes to known players only', async () => {
    const sync = await connected();
    // Unknown player: ignored
    emit('emote', { user_id: PEER, client_id: 'peer-tab', emote: 'wave' });
    expect(sync.getRemotePlayers().size).toBe(0);

    // Player appears via movement, then emotes
    emit('movement', { user_id: PEER, client_id: 'peer-tab', display_name: 'Peer', x: 100, y: 100, direction: 'down', is_moving: false });
    emit('emote', { user_id: PEER, client_id: 'peer-tab', emote: 'explode' });
    expect(sync.getRemotePlayers().get(PEER)?.emote).toBeUndefined();
    emit('emote', { user_id: PEER, client_id: 'peer-tab', emote: 'wave' });
    const peer = sync.getRemotePlayers().get(PEER);
    expect(peer?.emote).toBe('wave');
    expect(peer?.emoteExpiresAt).toBeGreaterThan(Date.now());
  });

  it('throttles outgoing emotes and knocks', async () => {
    const sync = await connected();
    mocks.channel.send.mockClear();
    expect(sync.broadcastEmote('wave')).toBe(true);
    expect(sync.broadcastEmote('clap')).toBe(false);
    expect(sync.broadcastRoomEvent('knock', { roomId: 'office-boardroom' })).toBe(true);
    expect(sync.broadcastRoomEvent('knock', { roomId: 'office-boardroom' })).toBe(false);
    const events = mocks.channel.send.mock.calls.map((c) => (c[0] as { event: string }).event);
    expect(events).toEqual(['emote', 'knock']);
  });

  it('re-tracks presence only when hand / sit / status actually change', async () => {
    vi.useFakeTimers();
    try {
      const sync = await connected();
      // Connecting schedules one re-track for the resting position; let it settle.
      vi.advanceTimersByTime(1500);
      mocks.channel.track.mockClear();
      sync.updatePresenceState({ status: 'available' }); // no change
      vi.advanceTimersByTime(1500);
      expect(mocks.channel.track).not.toHaveBeenCalled();

      sync.updatePresenceState({ handRaised: true, status: 'focus' });
      vi.advanceTimersByTime(1500);
      expect(mocks.channel.track).toHaveBeenCalledTimes(1);
      expect(mocks.channel.track.mock.calls[0][0]).toMatchObject({ hand_raised: true, status: 'focus', sitting: false });
    } finally {
      vi.useRealTimers();
    }
  });
});
