import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

import {
  DashboardPresenceService,
  PresenceUser,
  TRACK_BUDGET,
  TRACK_DEBOUNCE_MS,
  TRACK_WINDOW_MS,
} from '../src/lib/services/dashboardPresence';

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

describe('DashboardPresenceService presence rate limit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    DashboardPresenceService.cleanup();
    channels.length = 0;
    connected = true;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const trackedStatuses = (ch: FakeChannel) => ch.track.mock.calls.map((c) => (c[0] as PresenceUser).status);

  it('does not re-send an unchanged payload (session refreshes re-run init)', () => {
    const ch = startWithMattOnline();
    expect(ch.track).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 10; i++) {
      DashboardPresenceService.init(me);
      DashboardPresenceService.updatePresence({ displayName: 'Me' });
      vi.advanceTimersByTime(TRACK_DEBOUNCE_MS + 10);
    }
    expect(ch.track).toHaveBeenCalledTimes(1);
  });

  it('collapses quick status clicks into one send of the latest status', () => {
    const ch = startWithMattOnline();
    DashboardPresenceService.updatePresence({ status: 'busy' });
    DashboardPresenceService.updatePresence({ status: 'focus' });
    DashboardPresenceService.updatePresence({ status: 'away' });
    vi.advanceTimersByTime(TRACK_DEBOUNCE_MS + 10);
    expect(trackedStatuses(ch)).toEqual(['available', 'away']);
  });

  it('never exceeds the per-window budget, and still delivers the final status', () => {
    const ch = startWithMattOnline();
    const statuses = ['busy', 'focus', 'away', 'available', 'busy', 'focus', 'away', 'busy'] as const;
    for (const status of statuses) {
      DashboardPresenceService.updatePresence({ status });
      vi.advanceTimersByTime(TRACK_DEBOUNCE_MS + 100);
    }
    expect(ch.track.mock.calls.length).toBeLessThanOrEqual(TRACK_BUDGET);

    vi.advanceTimersByTime(TRACK_WINDOW_MS);
    expect(trackedStatuses(ch).at(-1)).toBe('busy');
  });

  it('rebuilds the channel when the server closes it, and re-announces the current status', () => {
    const ch = startWithMattOnline();
    DashboardPresenceService.updatePresence({ status: 'busy' });
    ch.statusCb?.('CLOSED'); // e.g. "Client presence rate limit exceeded"
    expect(onlineIds()).toEqual([]);

    vi.advanceTimersByTime(2_000);
    expect(channels).toHaveLength(2);
    const fresh = channels[1];
    fresh.statusCb?.('SUBSCRIBED');
    expect(trackedStatuses(fresh)).toEqual(['busy']);
  });

  it('rebuilds a server-closed channel right away when the tab is refocused', () => {
    const ch = startWithMattOnline();
    ch.statusCb?.('CLOSED');
    ch.state = 'closed';
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(0);
    expect(channels).toHaveLength(2);
  });

  it('does not rejoin after cleanup', () => {
    const ch = startWithMattOnline();
    DashboardPresenceService.cleanup();
    ch.statusCb?.('CLOSED');
    vi.advanceTimersByTime(60_000);
    expect(channels).toHaveLength(1);
  });
});
