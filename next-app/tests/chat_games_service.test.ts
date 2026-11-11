import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type Handler = (env: Record<string, unknown>) => void;

interface FakeChannel {
  handlers: Record<string, Handler>;
  statusCb?: (s: string) => void;
  sent: { event: string; payload: Record<string, unknown> }[];
  on: (type: string, filter: { event: string }, cb: Handler) => FakeChannel;
  subscribe: (cb: (s: string) => void) => FakeChannel;
  send: (msg: { event: string; payload: Record<string, unknown> }) => Promise<string>;
}

const channels: FakeChannel[] = [];
const rpc = vi.fn();

function makeChannel(): FakeChannel {
  const ch: FakeChannel = {
    handlers: {},
    sent: [],
    on(_type, filter, cb) {
      ch.handlers[filter.event] = cb;
      return ch;
    },
    subscribe(cb) {
      ch.statusCb = cb;
      return ch;
    },
    send(msg) {
      ch.sent.push({ event: msg.event, payload: msg.payload });
      return Promise.resolve('ok');
    },
  };
  return ch;
}

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    channel: vi.fn(() => {
      const ch = makeChannel();
      channels.push(ch);
      return ch;
    }),
    rpc: (...args: unknown[]) => rpc(...args),
  },
  removeRealtimeChannel: vi.fn(),
  cleanupExistingChannel: vi.fn(),
}));

import { BOARD_SEND_INTERVAL_MS, ChatGameService } from '../src/lib/services/chatGames';

const GAME = '0f8fad5b-d9cb-469f-a165-70867728950e';
const CONV = '6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b';

beforeEach(() => {
  channels.length = 0;
  rpc.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ChatGameService live channel', () => {
  it('asks for a refetch on remote moves and ignores its own echoes', () => {
    const onMoved = vi.fn();
    const live = ChatGameService.connect(GAME, 'me', 'tab-1', { onMoved });
    const ch = channels[0];
    ch.statusCb?.('SUBSCRIBED');

    ch.handlers.moved({ payload: { version: 4, client_id: 'tab-2' } });
    ch.handlers.moved({ payload: { version: 5, client_id: 'tab-1' } });
    expect(onMoved).toHaveBeenCalledTimes(1);
    expect(onMoved).toHaveBeenCalledWith(4);

    live.sendMoved(6);
    expect(ch.sent[0]).toEqual({ event: 'moved', payload: { version: 6, client_id: 'tab-1', user_id: 'me' } });
    live.dispose();
  });

  it('does not send before the channel is subscribed', () => {
    const live = ChatGameService.connect(GAME, 'me', 'tab-1', { onMoved: vi.fn() });
    live.sendMoved(2);
    expect(channels[0].sent).toHaveLength(0);
    live.dispose();
  });

  it('throttles board snapshots and drops repeats', () => {
    vi.useFakeTimers();
    const live = ChatGameService.connect(GAME, 'me', 'tab-1', { onMoved: vi.fn() });
    const ch = channels[0];
    ch.statusCb?.('SUBSCRIBED');

    live.sendBoard('a', 1, 0);
    live.sendBoard('b', 2, 0);
    live.sendBoard('c', 3, 0);
    vi.advanceTimersByTime(0);
    expect(ch.sent.map((s) => s.payload.snapshot)).toEqual(['c']);

    live.sendBoard('c', 3, 0); // unchanged board: nothing to send
    live.sendBoard('d', 4, 0);
    vi.advanceTimersByTime(BOARD_SEND_INTERVAL_MS - 1);
    expect(ch.sent).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(ch.sent.map((s) => s.payload.snapshot)).toEqual(['c', 'd']);
    live.dispose();
  });

  it('clamps garbage counts from the wire', () => {
    const onGarbage = vi.fn();
    ChatGameService.connect(GAME, 'me', 'tab-1', { onMoved: vi.fn(), onGarbage });
    const ch = channels[0];
    ch.handlers.garbage({ payload: { to_user_id: 'me', count: 99, client_id: 'tab-2' } });
    ch.handlers.garbage({ payload: { to_user_id: 'me', count: -3, client_id: 'tab-2' } });
    expect(onGarbage).toHaveBeenCalledTimes(1);
    expect(onGarbage).toHaveBeenCalledWith('me', 4);
  });
});

describe('ChatGameService RPCs', () => {
  const row = {
    id: GAME,
    conversation_type: 'dm',
    conversation_id: CONV,
    game: 'tictactoe',
    status: 'active',
    player_one: 'a',
    player_two: 'b',
    current_turn: 'b',
    state: { board: [] },
    version: 3,
  };

  it('returns null on a stale version (empty set)', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    const res = await ChatGameService.submitMove({
      gameId: GAME,
      expectedVersion: 2,
      state: {},
      nextTurn: 'b',
      finished: false,
      winner: null,
    });
    expect(res).toBeNull();
  });

  it('maps the updated row and sends a draw result when finished without a winner', async () => {
    rpc.mockResolvedValueOnce({ data: [row], error: null });
    const res = await ChatGameService.submitMove({
      gameId: GAME,
      expectedVersion: 2,
      state: {},
      nextTurn: null,
      finished: true,
      winner: null,
    });
    expect(res?.version).toBe(3);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_status: 'finished', p_result: 'draw', p_winner: null });
  });

  it('turns server errors into friendly messages', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'not your turn' } });
    await expect(
      ChatGameService.submitMove({ gameId: GAME, expectedVersion: 1, state: {}, nextTurn: 'b', finished: false, winner: null })
    ).rejects.toThrow('It is not your turn.');
  });

  it('refuses to create a game for a non-uuid conversation', async () => {
    await expect(ChatGameService.create('dm', 'local-fallback', 'chess', {})).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
});
