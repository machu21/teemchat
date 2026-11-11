import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, removeRealtimeChannel, cleanupExistingChannel } from '../supabase';
import { rowFromDb, type ChatGameRow, type ChatKind, type GameKind } from '../games/types';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Block Drop board broadcasts: at most one per this many ms (realtime spec: >= 100ms). */
export const BOARD_SEND_INTERVAL_MS = 250;

export interface GameLiveHandlers {
  /** A turn-based move landed (or the game status changed): re-fetch the row. */
  onMoved: (version: number) => void;
  /** Block Drop: the opponent's board (200-digit snapshot) and score. */
  onBoard?: (userId: string, snapshot: string, score: number, lines: number) => void;
  /** Block Drop: garbage lines sent to `toUserId`. */
  onGarbage?: (toUserId: string, count: number) => void;
}

export interface GameLive {
  sendMoved: (version: number) => void;
  /** Throttled to BOARD_SEND_INTERVAL_MS; repeats of the same board are dropped. */
  sendBoard: (snapshot: string, score: number, lines: number) => void;
  sendGarbage: (toUserId: string, count: number) => void;
  dispose: () => void;
}

export class ChatGameError extends Error {}

function firstRow(data: unknown): ChatGameRow | null {
  return rowFromDb(Array.isArray(data) ? data[0] : data);
}

function friendly(message: string | undefined): string {
  const m = (message || '').toLowerCase();
  if (m.includes('cannot play with this user')) return 'This game is unavailable.';
  if (m.includes('not your turn')) return 'It is not your turn.';
  if (m.includes('game is not open') || m.includes('game is not active')) return 'This game has already ended.';
  if (m.includes('not invited') || m.includes('own game')) return 'You cannot accept this invite.';
  if (m.includes('not a member')) return 'You are not in this chat.';
  return 'Something went wrong. Try again.';
}

export class ChatGameService {
  static async create(
    conversationType: ChatKind,
    conversationId: string,
    game: GameKind,
    initialState: Record<string, unknown>
  ): Promise<ChatGameRow> {
    if (!UUID_REGEX.test(conversationId)) throw new ChatGameError('Games are not available in this chat yet.');
    const { data, error } = await supabase.rpc('create_chat_game', {
      p_conversation_type: conversationType,
      p_conversation_id: conversationId,
      p_game: game,
      p_state: initialState,
    });
    const row = firstRow(data);
    if (error || !row) throw new ChatGameError(friendly(error?.message));
    return row;
  }

  static async load(gameId: string): Promise<ChatGameRow | null> {
    if (!UUID_REGEX.test(gameId)) return null;
    const { data, error } = await supabase.from('chat_games').select('*').eq('id', gameId).maybeSingle();
    if (error) return null;
    return rowFromDb(data);
  }

  /** Several games at once (for the invite cards in a chat). */
  static async loadMany(gameIds: string[]): Promise<ChatGameRow[]> {
    const ids = [...new Set(gameIds.filter((id) => UUID_REGEX.test(id)))];
    if (ids.length === 0) return [];
    const { data, error } = await supabase.from('chat_games').select('*').in('id', ids);
    if (error || !Array.isArray(data)) return [];
    return data.map(rowFromDb).filter((r): r is ChatGameRow => r !== null);
  }

  static async accept(gameId: string): Promise<ChatGameRow> {
    const { data, error } = await supabase.rpc('accept_chat_game', { p_game_id: gameId });
    const row = firstRow(data);
    if (error || !row) throw new ChatGameError(friendly(error?.message));
    return row;
  }

  static async decline(gameId: string): Promise<ChatGameRow> {
    const { data, error } = await supabase.rpc('decline_chat_game', { p_game_id: gameId });
    const row = firstRow(data);
    if (error || !row) throw new ChatGameError(friendly(error?.message));
    return row;
  }

  static async resign(gameId: string): Promise<ChatGameRow> {
    const { data, error } = await supabase.rpc('resign_chat_game', { p_game_id: gameId });
    const row = firstRow(data);
    if (error || !row) throw new ChatGameError(friendly(error?.message));
    return row;
  }

  /**
   * Submits a move with optimistic locking. Returns the new row, or `null`
   * when `expectedVersion` is stale (the caller reloads).
   */
  static async submitMove(params: {
    gameId: string;
    expectedVersion: number;
    state: unknown;
    nextTurn: string | null;
    finished: boolean;
    winner: string | null;
  }): Promise<ChatGameRow | null> {
    const { data, error } = await supabase.rpc('submit_chat_game_move', {
      p_game_id: params.gameId,
      p_expected_version: params.expectedVersion,
      p_state: params.state,
      p_next_turn: params.nextTurn,
      p_status: params.finished ? 'finished' : 'active',
      p_winner: params.winner,
      p_result: params.finished ? (params.winner ? 'win' : 'draw') : null,
    });
    if (error) throw new ChatGameError(friendly(error.message));
    return firstRow(data);
  }

  /** Live channel for one game. Always call dispose() when the game closes. */
  static connect(gameId: string, userId: string, clientInstanceId: string, handlers: GameLiveHandlers): GameLive {
    const topic = `chatgame:${gameId}`;
    cleanupExistingChannel(topic);
    const channel: RealtimeChannel = supabase.channel(topic, { config: { broadcast: { self: false, ack: false } } });
    let ready = false;
    let lastBoardAt = 0;
    let lastBoard = '';
    let pendingBoard: { snapshot: string; score: number; lines: number } | null = null;
    let boardTimer: ReturnType<typeof setTimeout> | null = null;

    const payloadOf = (envelope: { [key: string]: unknown }) =>
      ((envelope.payload ?? envelope) as Record<string, unknown>) || {};
    const fromSelf = (d: Record<string, unknown>) => d.client_id === clientInstanceId;

    channel
      .on('broadcast', { event: 'moved' }, (env) => {
        const d = payloadOf(env);
        if (fromSelf(d)) return;
        handlers.onMoved(Number(d.version) || 0);
      })
      .on('broadcast', { event: 'board' }, (env) => {
        const d = payloadOf(env);
        if (fromSelf(d) || typeof d.user_id !== 'string' || typeof d.snapshot !== 'string') return;
        handlers.onBoard?.(d.user_id, d.snapshot, Number(d.score) || 0, Number(d.lines) || 0);
      })
      .on('broadcast', { event: 'garbage' }, (env) => {
        const d = payloadOf(env);
        if (fromSelf(d) || typeof d.to_user_id !== 'string') return;
        const count = Math.min(4, Math.max(0, Math.floor(Number(d.count) || 0)));
        if (count > 0) handlers.onGarbage?.(d.to_user_id, count);
      })
      .subscribe((status) => {
        ready = status === 'SUBSCRIBED';
      });

    const send = (event: string, payload: Record<string, unknown>) => {
      if (!ready) return;
      channel
        .send({ type: 'broadcast', event, payload: { ...payload, client_id: clientInstanceId, user_id: userId } })
        .catch(() => {});
    };

    const flushBoard = () => {
      boardTimer = null;
      if (!pendingBoard) return;
      const b = pendingBoard;
      pendingBoard = null;
      lastBoardAt = Date.now();
      lastBoard = b.snapshot;
      send('board', b);
    };

    return {
      sendMoved: (version) => send('moved', { version }),
      sendBoard: (snapshot, score, lines) => {
        if (snapshot === lastBoard && !pendingBoard) return;
        pendingBoard = { snapshot, score, lines };
        if (boardTimer) return;
        const wait = Math.max(0, BOARD_SEND_INTERVAL_MS - (Date.now() - lastBoardAt));
        boardTimer = setTimeout(flushBoard, wait);
      },
      sendGarbage: (toUserId, count) => send('garbage', { to_user_id: toUserId, count }),
      dispose: () => {
        ready = false;
        if (boardTimer) clearTimeout(boardTimer);
        boardTimer = null;
        pendingBoard = null;
        removeRealtimeChannel(channel);
      },
    };
  }
}
