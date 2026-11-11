// Chess rules via chess.js. Player one is white and moves first.
import { Chess, type Square } from 'chess.js';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export type ChessColor = 'w' | 'b';
export type ChessPieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type PromotionPiece = 'q' | 'r' | 'b' | 'n';

export interface ChessState {
  fen: string;
  lastMove: { from: string; to: string } | null;
}

export interface ChessSquare {
  square: string;
  piece: { type: ChessPieceType; color: ChessColor } | null;
}

export function initialChess(): ChessState {
  return { fen: START_FEN, lastMove: null };
}

const SQUARE_RE = /^[a-h][1-8]$/;

export function parseChess(raw: unknown): ChessState {
  const r = (raw ?? {}) as { fen?: unknown; lastMove?: unknown };
  let fen = START_FEN;
  if (typeof r.fen === 'string' && r.fen.length < 120) {
    try {
      new Chess(r.fen);
      fen = r.fen;
    } catch {
      fen = START_FEN;
    }
  }
  const lm = r.lastMove as { from?: unknown; to?: unknown } | null | undefined;
  const lastMove =
    lm && typeof lm.from === 'string' && typeof lm.to === 'string' && SQUARE_RE.test(lm.from) && SQUARE_RE.test(lm.to)
      ? { from: lm.from, to: lm.to }
      : null;
  return { fen, lastMove };
}

export function chessTurn(state: ChessState): ChessColor {
  return new Chess(state.fen).turn();
}

/** 64 squares, a8 first (rank 8 down to rank 1, files a to h). */
export function chessBoard(state: ChessState): ChessSquare[] {
  const board = new Chess(state.fen).board();
  const out: ChessSquare[] = [];
  board.forEach((rank, r) =>
    rank.forEach((cell, f) => {
      const square = `${'abcdefgh'[f]}${8 - r}`;
      out.push({ square, piece: cell ? { type: cell.type as ChessPieceType, color: cell.color as ChessColor } : null });
    })
  );
  return out;
}

export interface ChessTarget {
  to: string;
  promotion: boolean;
}

export function chessTargetsFrom(state: ChessState, from: string): ChessTarget[] {
  if (!SQUARE_RE.test(from)) return [];
  const moves = new Chess(state.fen).moves({ square: from as Square, verbose: true });
  const seen = new Map<string, ChessTarget>();
  for (const m of moves) {
    const prev = seen.get(m.to);
    seen.set(m.to, { to: m.to, promotion: Boolean(prev?.promotion || m.promotion) });
  }
  return [...seen.values()];
}

export type ChessOutcome =
  | { over: false; check: boolean }
  | { over: true; winner: ChessColor | null; reason: 'checkmate' | 'stalemate' | 'draw' };

export function chessOutcome(state: ChessState): ChessOutcome {
  const g = new Chess(state.fen);
  if (g.isCheckmate()) return { over: true, winner: g.turn() === 'w' ? 'b' : 'w', reason: 'checkmate' };
  if (g.isStalemate()) return { over: true, winner: null, reason: 'stalemate' };
  // Insufficient material, 50-move rule. Threefold repetition needs the move
  // history, which we do not store, so it is not detected.
  if (g.isDraw()) return { over: true, winner: null, reason: 'draw' };
  return { over: false, check: g.inCheck() };
}

/** Plays a move; null when illegal. */
export function applyChessMove(
  state: ChessState,
  from: string,
  to: string,
  promotion: PromotionPiece = 'q'
): ChessState | null {
  if (!SQUARE_RE.test(from) || !SQUARE_RE.test(to)) return null;
  const g = new Chess(state.fen);
  try {
    const m = g.move({ from, to, promotion });
    if (!m) return null;
  } catch {
    return null;
  }
  return { fen: g.fen(), lastMove: { from, to } };
}
