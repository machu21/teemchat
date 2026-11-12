import type { IconName } from '@/lib/icons';

export type GameKind = 'chess' | 'dama' | 'tictactoe' | 'blockdrop';
export type GameStatus = 'invited' | 'active' | 'finished' | 'declined' | 'abandoned';
export type GameResult = 'win' | 'draw' | 'resign' | 'timeout';
export type ChatKind = 'dm' | 'group';

export const GAME_KINDS: GameKind[] = ['chess', 'dama', 'tictactoe', 'blockdrop'];

export const GAME_INFO: Record<GameKind, { title: string; icon: IconName; blurb: string; realtime: boolean }> = {
  chess: { title: 'Chess', icon: 'chessKnight', blurb: 'Classic chess. Take turns any time.', realtime: false },
  dama: { title: 'Dama', icon: 'crown', blurb: 'Filipino checkers with flying kings.', realtime: false },
  tictactoe: { title: 'Tic-Tac-Toe', icon: 'grid3x3', blurb: 'Three in a row wins.', realtime: false },
  blockdrop: { title: 'Block Drop', icon: 'blocks', blurb: 'Live versus. Clear lines to send garbage.', realtime: true },
};

export interface ChatGameRow {
  id: string;
  conversationType: ChatKind;
  conversationId: string;
  game: GameKind;
  status: GameStatus;
  playerOne: string;
  playerTwo: string | null;
  currentTurn: string | null;
  state: unknown;
  version: number;
  winner: string | null;
  result: GameResult | null;
  createdAt: string;
  updatedAt: string;
  /** Chess clock: 0 = untimed. */
  timeBaseMs: number;
  timeIncMs: number;
  clockOneMs: number | null;
  clockTwoMs: number | null;
  /** When the side to move's clock started (ISO), or null when not running. */
  turnStartedAt: string | null;
}

const STATUSES: GameStatus[] = ['invited', 'active', 'finished', 'declined', 'abandoned'];
const RESULTS: GameResult[] = ['win', 'draw', 'resign', 'timeout'];

export function isGameKind(v: unknown): v is GameKind {
  return typeof v === 'string' && (GAME_KINDS as string[]).includes(v);
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Maps a `chat_games` row from the database; null when it is malformed. */
export function rowFromDb(raw: unknown): ChatGameRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id);
  const conversationId = str(r.conversation_id);
  const playerOne = str(r.player_one);
  if (!id || !conversationId || !playerOne || !isGameKind(r.game)) return null;
  if (r.conversation_type !== 'dm' && r.conversation_type !== 'group') return null;
  const status = STATUSES.includes(r.status as GameStatus) ? (r.status as GameStatus) : null;
  if (!status) return null;
  return {
    id,
    conversationType: r.conversation_type,
    conversationId,
    game: r.game,
    status,
    playerOne,
    playerTwo: str(r.player_two),
    currentTurn: str(r.current_turn),
    state: r.state ?? {},
    version: Number(r.version) || 1,
    winner: str(r.winner),
    result: RESULTS.includes(r.result as GameResult) ? (r.result as GameResult) : null,
    createdAt: str(r.created_at) ?? new Date(0).toISOString(),
    updatedAt: str(r.updated_at) ?? new Date(0).toISOString(),
    timeBaseMs: num(r.time_base_ms) ?? 0,
    timeIncMs: num(r.time_increment_ms) ?? 0,
    clockOneMs: num(r.clock_one_ms),
    clockTwoMs: num(r.clock_two_ms),
    turnStartedAt: str(r.turn_started_at),
  };
}

// ---- Chat invite message ---------------------------------------------------
// A game invite is an ordinary chat message with this exact content, so it is
// delivered and stored by the existing DM / group pipelines.

const INVITE_RE = /^\[\[game:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):([a-z]+)\]\]$/i;

export function encodeInvite(gameId: string, kind: GameKind): string {
  return `[[game:${gameId}:${kind}]]`;
}

export function parseInvite(content: string): { gameId: string; kind: GameKind } | null {
  const m = INVITE_RE.exec(content.trim());
  if (!m || !isGameKind(m[2])) return null;
  return { gameId: m[1].toLowerCase(), kind: m[2] };
}

/** Text for chat-list previews: invites read as a sentence, not the raw marker. */
export function messagePreview(content: string): string {
  const invite = parseInvite(content);
  return invite ? `Started a game of ${GAME_INFO[invite.kind].title}` : content;
}

/** Invites nobody answered within this window are shown as expired. */
export const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

/** What the next move submits to `submit_chat_game_move`. */
export interface MoveOutcome<S> {
  state: S;
  /** Game over? Then `winner` is the winning user id, or null for a draw. */
  finished: boolean;
  winner: string | null;
}
