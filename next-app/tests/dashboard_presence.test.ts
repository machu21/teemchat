import { describe, it, expect, vi, beforeEach } from 'vitest';

type StatusCb = (status: string) => void;
interface FakeChannel {
  state: string;
  presence: Record<string, unknown[]>;
  syncCb: (() => void) | null;
  statusCb: StatusCb | null;
  on: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  track: ReturnType<typeof vi.fn>;
  untrack: ReturnType<typeof vi.fn>;
  presenceState: () => Record<string, unknown[]>;
}

const channels: FakeChannel[] = [];
let connected = true;
const connect = vi.fn();

function makeChannel(): FakeChannel {
  const ch: FakeChannel = {
    state: 'joined',
    presence: {},
    syncCb: null,
    statusCb: null,
    on: vi.fn(),
    subscribe: vi.fn(),
    track: vi.fn().mockResolvedValue('ok'),
    untrack: vi.fn().mockResolvedValue('ok'),
    presenceState: () => ch.presence,
  };
  ch.on.mockImplementation((_t: string, _f: unknown, cb: () => void) => {
    ch.syncCb = cb;
    return ch;
  });
  ch.subscribe.mockImplementation((cb: StatusCb) => {
    ch.statusCb = cb;
    return ch;
  });
  return ch;
}

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    channel: vi.fn(() => {
      const ch = makeChannel();
      channels.push(ch);
      return ch;
    }),
    realtime: { isConnected: () => connected, connect: () => connect() },
  },
  removeRealtimeChannel: vi.fn(),
  cleanupExistingChannel: vi.fn(),
}));

import { DashboardPresenceService, PresenceUser } from '../src/lib/services/dashboardPresence';

// Minimal browser globals (no jsdom in this project): just enough for the window listeners.
const fakeDocument = Object.assign(new EventTarget(), { visibilityState: 'visible' });
vi.stubGlobal('window', new EventTarget());
vi.stubGlobal('document', fakeDocument);

const me = { userId: 'me', displayName: 'Me', avatarConfig: {} as PresenceUser['avatarConfig'] };

function startWithMattOnline() {
  DashboardPresenceService.init(me);
  const ch = channels[channels.length - 1];
  ch.statusCb?.('SUBSCRIBED');
  ch.presence = { matt: [{ userId: 'matt', displayName: 'Matt' }] };
  ch.syncCb?.();
  return ch;
}

const onlineIds = () => DashboardPresenceService.getOnlineUsers().map((u) => u.userId);

describe('DashboardPresenceService', () => {
  beforeEach(() => {
    DashboardPresenceService.cleanup();
    channels.length = 0;
    connected = true;
    connect.mockClear();
  });

  it('clears the online list when the channel errors instead of freezing it', () => {
    const ch = startWithMattOnline();
    expect(onlineIds()).toEqual(['matt']);

    const seen: string[][] = [];
    DashboardPresenceService.subscribe((users) => seen.push(users.map((u) => u.userId)));
    ch.statusCb?.('CHANNEL_ERROR');

    expect(onlineIds()).toEqual([]);
    expect(seen[seen.length - 1]).toEqual([]);
  });

  it('ignores late status callbacks from a replaced channel', () => {
    const old = startWithMattOnline();
    DashboardPresenceService.cleanup();
    const live = startWithMattOnline();

    old.statusCb?.('CLOSED');
    expect(onlineIds()).toEqual(['matt']);
    expect(live).not.toBe(old);
  });

  it('on refocus with a dead socket, shows everyone offline and reconnects', () => {
    startWithMattOnline();
    connected = false;
    document.dispatchEvent(new Event('visibilitychange'));

    expect(onlineIds()).toEqual([]);
    expect(connect).toHaveBeenCalled();
  });

  it('leave() untracks before tearing down', async () => {
    const ch = startWithMattOnline();
    await DashboardPresenceService.leave();
    expect(ch.untrack).toHaveBeenCalled();
    expect(onlineIds()).toEqual([]);
  });
});
