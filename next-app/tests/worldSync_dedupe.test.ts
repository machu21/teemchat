import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defaultMaleAvatarConfig } from '../src/lib/models/avatar';

type Handler = (payload: unknown) => void;

const mockState = vi.hoisted(() => ({
  handlers: new Map<string, (payload: unknown) => void>(),
  presence: {} as Record<string, Array<Record<string, unknown>>>,
}));

vi.mock('../src/lib/supabase', () => {
  const channel = {
    on: (_type: string, filter: { event: string }, handler: Handler) => {
      mockState.handlers.set(filter.event, handler);
      return channel;
    },
    subscribe: (callback?: (status: string) => void) => {
      if (callback) callback('SUBSCRIBED');
      return channel;
    },
    track: () => Promise.resolve('ok'),
    send: () => Promise.resolve(),
    presenceState: () => mockState.presence,
  };
  return {
    supabase: { channel: () => channel },
    removeRealtimeChannel: vi.fn(),
    cleanupExistingChannel: vi.fn(),
  };
});

import { WorldSyncService } from '../src/lib/services/worldSync';

const presenceEntry = (userId: string, clientId: string, name = 'popoy123') => ({
  user_id: userId,
  client_id: clientId,
  display_name: name,
  avatar_config: defaultMaleAvatarConfig,
  x: 100,
  y: 100,
});

function createSync() {
  return new WorldSyncService({
    spaceId: 'room-dedupe',
    currentUserId: 'me',
    displayName: 'popoy123',
    avatarConfig: defaultMaleAvatarConfig,
    clientInstanceId: 'me_client_current',
  });
}

describe('WorldSyncService remote player de-duplication', () => {
  beforeEach(() => {
    mockState.handlers.clear();
    mockState.presence = {};
  });

  it('never renders our own user from another or stale connection', async () => {
    mockState.presence = {
      me_client_current: [presenceEntry('me', 'me_client_current')],
      me_client_stale: [presenceEntry('me', 'me_client_stale')],
    };
    const sync = createSync();
    await sync.connect();
    mockState.handlers.get('sync')?.({});

    expect(sync.getRemotePlayers().size).toBe(0);
  });

  it('ignores movement broadcasts from our own user on another client', async () => {
    const sync = createSync();
    await sync.connect();
    mockState.handlers.get('movement')?.({
      payload: { user_id: 'me', client_id: 'me_client_stale', x: 50, y: 60, display_name: 'popoy123' },
    });

    expect(sync.getRemotePlayers().size).toBe(0);
  });

  it('collapses several connections of one remote user into a single avatar keyed by user id', async () => {
    mockState.presence = {
      friend_tab_a: [presenceEntry('friend', 'friend_tab_a', 'Friend')],
      friend_tab_b: [presenceEntry('friend', 'friend_tab_b', 'Friend')],
    };
    const sync = createSync();
    await sync.connect();
    mockState.handlers.get('sync')?.({});

    const players = sync.getRemotePlayers();
    expect(players.size).toBe(1);
    expect(players.has('friend')).toBe(true);
  });
});
