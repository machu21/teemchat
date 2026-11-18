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

  it('a survivor look goes out in one presence re-track, and only when it changed', async () => {
    vi.useFakeTimers();
    try {
      const sync = await connected();
      vi.advanceTimersByTime(1500);
      mocks.channel.track.mockClear();
      const look = { gender: 'female', skinColor: '#c68642', shirtColor: '#16a34a', hairColor: '#2b2530', hairStyle: 'bun', accessory: 'none' } as const;
      sync.setAvatarConfig({ ...look });
      vi.advanceTimersByTime(1500);
      expect(mocks.channel.track).toHaveBeenCalledTimes(1);
      expect(mocks.channel.track.mock.calls[0][0]).toMatchObject({ avatar_config: look });
      sync.setAvatarConfig({ ...look }); // same look again
      vi.advanceTimersByTime(1500);
      expect(mocks.channel.track).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('WorldSync presence rate limit', () => {
  // Supabase closes the channel on the 6th track inside its window (see presenceBudget.ts).
  /** Most track() calls that fell inside any window of `windowMs`. */
  const tracksWithin = (windowMs: number) =>
    Math.max(0, ...trackTimes.map((t) => trackTimes.filter((u) => u >= t && u - t < windowMs).length));
  let trackTimes: number[] = [];

  beforeEach(() => {
    trackTimes = [];
    mocks.channel.track.mockImplementation(() => {
      trackTimes.push(Date.now());
      return Promise.resolve('ok');
    });
  });

  it('walking and stopping repeatedly never exceeds the server presence budget', async () => {
    vi.useFakeTimers();
    try {
      const sync = await connected();
      for (let i = 0; i < 20; i++) {
        sync.broadcastMovement(500 + i * 10, 300, 'right', true);
        vi.advanceTimersByTime(150);
        sync.broadcastMovement(510 + i * 10, 300, 'right', false, true);
        vi.advanceTimersByTime(1200);
      }
      vi.advanceTimersByTime(60_000);
      expect(tracksWithin(30_000)).toBeLessThanOrEqual(4);
      // The final resting position still reaches presence for late joiners.
      expect(mocks.channel.track.mock.calls.at(-1)?.[0]).toMatchObject({ x: 700, y: 300 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('a status change goes out promptly even after position updates used their share', async () => {
    vi.useFakeTimers();
    try {
      const sync = await connected();
      for (let i = 0; i < 5; i++) {
        sync.broadcastMovement(600 + i * 40, 300, 'right', false, true);
        vi.advanceTimersByTime(1100);
      }
      const before = mocks.channel.track.mock.calls.length;
      sync.updatePresenceState({ status: 'busy' });
      vi.advanceTimersByTime(300);
      expect(mocks.channel.track.mock.calls.length).toBe(before + 1);
      expect(mocks.channel.track.mock.calls.at(-1)?.[0]).toMatchObject({ status: 'busy' });
      expect(tracksWithin(30_000)).toBeLessThanOrEqual(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('peers joining the space do not make us re-track an unchanged presence', async () => {
    vi.useFakeTimers();
    try {
      await connected();
      vi.advanceTimersByTime(2000);
      mocks.channel.track.mockClear();
      for (let i = 0; i < 10; i++) {
        mocks.handlers.get('presence:join')?.({});
        vi.advanceTimersByTime(500);
      }
      vi.advanceTimersByTime(5000);
      expect(mocks.channel.track).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
