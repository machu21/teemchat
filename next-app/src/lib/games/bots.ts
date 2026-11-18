// Computer opponents for solo play. Classic rule-based search and heuristics
// (minimax / alpha-beta / placement scoring); no AI service is involved.
import { Chess, type Move } from 'chess.js';
import { pickOpeningMove } from './chessOpenings';
import { applyTttMove, tttIsDraw, tttNextMark, tttWinner, type TttState } from './tictactoe';
import { damaLegalMoves, isKing, playDamaMove, rc, type DamaMove, type DamaState } from './dama';
import { BlockDrop, COLS, ROWS, fitsGrid, pieceCells, spawnOf, type LockEvent, type PieceKind } from './blockdrop';

export type Difficulty = 'easy' | 'medium' | 'hard';
export const DIFFICULTIES: { id: Difficulty; label: string }[] = [
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
];

type Rng = () => number;
const pick = <T,>(list: T[], rng: Rng): T => list[Math.floor(rng() * list.length)];

// ---------------------------------------------------------------------------
// Tic-Tac-Toe: perfect minimax on hard, mistakes on easier levels.

const tttMemo = new Map<string, number>();

function tttScore(state: TttState, me: 'X' | 'O', depth: number): number {
  const key = `${me}${depth}${state.board.map((c) => c || '-').join('')}`;
  const cached = tttMemo.get(key);
  if (cached !== undefined) return cached;
  const value = tttScoreUncached(state, me, depth);
  tttMemo.set(key, value);
  return value;
}

function tttScoreUncached(state: TttState, me: 'X' | 'O', depth: number): number {
  const w = tttWinner(state);
  if (w) return w.mark === me ? 10 - depth : depth - 10;
  if (tttIsDraw(state)) return 0;
  const toMove = tttNextMark(state);
  let best = toMove === me ? -Infinity : Infinity;
  for (let i = 0; i < 9; i++) {
    const next = applyTttMove(state, i);
    if (!next) continue;
    const s = tttScore(next, me, depth + 1);
    best = toMove === me ? Math.max(best, s) : Math.min(best, s);
  }
  return best;
}

export function tttBotMove(state: TttState, difficulty: Difficulty, rng: Rng = Math.random): number | null {
  const empty = state.board.map((c, i) => (c === '' ? i : -1)).filter((i) => i >= 0);
  if (empty.length === 0 || tttWinner(state)) return null;
  const me = tttNextMark(state);
  const mistake = difficulty === 'easy' ? 0.6 : difficulty === 'medium' ? 0.2 : 0;
  if (rng() < mistake) return pick(empty, rng);
  const scored = empty.map((i) => ({ i, s: tttScore(applyTttMove(state, i)!, me, 1) }));
  const best = Math.max(...scored.map((x) => x.s));
  return pick(scored.filter((x) => x.s === best).map((x) => x.i), rng);
}

// ---------------------------------------------------------------------------
// Chess: Deep-Blue-inspired search (tapered eval, pawn/rook/king heuristics,
// transposition table, quiescence search, LMR, killers/history, opening book).

const VAL: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const PHASE_WEIGHT: Record<string, number> = { p: 0, n: 1, b: 1, r: 2, q: 4, k: 0 };

// Middlegame piece-square tables from white's view, a8..h8 first (same order as board()).
const PST_MG: Record<string, number[]> = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
    5, 5, 10, 27, 27, 10, 5, 5,
    0, 0, 0, 24, 24, 0, 0, 0,
    5, -5, -10, 0, 0, -10, -5, 5,
    5, 10, 10, -22, -22, 10, 10, 5,
    0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20, 0, 5, 5, 0, -20, -40,
    -30, 5, 12, 16, 16, 12, 5, -30,
    -30, 5, 16, 22, 22, 16, 5, -30,
    -30, 0, 16, 22, 22, 16, 0, -30,
    -30, 5, 12, 15, 15, 12, 5, -30,
    -40, -20, 0, 5, 5, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 5, 0, 0, 0, 0, 5, -10,
    -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 0, 10, 14, 14, 10, 0, -10,
    -10, 5, 5, 14, 14, 5, 5, -10,
    -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 10, 0, 0, 0, 0, 10, -10,
    -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  r: [
    0, 0, 0, 5, 5, 0, 0, 0,
    10, 15, 15, 15, 15, 15, 15, 10,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    0, 0, 0, 8, 8, 4, 0, 0,
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 6, 6, 5, 0, -5,
    0, 0, 5, 6, 6, 5, 0, -5,
    -10, 5, 5, 5, 5, 5, 0, -10,
    -10, 0, 5, 0, 0, 0, 0, -10,
    -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20,
    20, 32, 10, 0, 0, 10, 32, 20,
  ],
};

// Endgame piece-square tables (king centralizes, pawns push forward).
const PST_EG: Record<string, number[]> = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0,
    80, 80, 80, 80, 80, 80, 80, 80,
    50, 50, 50, 50, 50, 50, 50, 50,
    30, 30, 30, 30, 30, 30, 30, 30,
    15, 15, 15, 20, 20, 15, 15, 15,
    5, 5, 5, 5, 5, 5, 5, 5,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: PST_MG.n,
  b: PST_MG.b,
  r: PST_MG.r,
  q: PST_MG.q,
  k: [
    -50, -30, -30, -30, -30, -30, -30, -50,
    -30, -10, 0, 0, 0, 0, -10, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, 0, 20, 30, 30, 20, 0, -30,
    -30, 0, 20, 30, 30, 20, 0, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, -15, 0, 0, 0, 0, -15, -30,
    -50, -40, -30, -20, -20, -30, -40, -50,
  ],
};

const PASSED_BONUS = [0, 10, 15, 25, 45, 75, 110, 0];

/** Static evaluation in centipawns, positive when white is better. */
export function evaluateChess(g: Chess): number {
  const board = g.board();
  let mgScore = 0;
  let egScore = 0;
  let phase = 0;
  let wBishops = 0;
  let bBishops = 0;
  const wPawnsByFile = [0, 0, 0, 0, 0, 0, 0, 0];
  const bPawnsByFile = [0, 0, 0, 0, 0, 0, 0, 0];
  const wPawns: [number, number][] = [];
  const bPawns: [number, number][] = [];
  const wRooks: [number, number][] = [];
  const bRooks: [number, number][] = [];
  let wKing: [number, number] | null = null;
  let bKing: [number, number] | null = null;

  for (let r = 0; r < 8; r++) {
    const rank = board[r];
    for (let c = 0; c < 8; c++) {
      const cell = rank[c];
      if (!cell) continue;
      const idx = cell.color === 'w' ? r * 8 + c : (7 - r) * 8 + c;
      const base = VAL[cell.type];
      const mg = base + PST_MG[cell.type][idx];
      const eg = base + PST_EG[cell.type][idx];
      phase += PHASE_WEIGHT[cell.type];

      if (cell.color === 'w') {
        mgScore += mg;
        egScore += eg;
        if (cell.type === 'b') wBishops++;
        else if (cell.type === 'p') {
          wPawnsByFile[c]++;
          wPawns.push([r, c]);
        } else if (cell.type === 'r') wRooks.push([r, c]);
        else if (cell.type === 'k') wKing = [r, c];
      } else {
        mgScore -= mg;
        egScore -= eg;
        if (cell.type === 'b') bBishops++;
        else if (cell.type === 'p') {
          bPawnsByFile[c]++;
          bPawns.push([r, c]);
        } else if (cell.type === 'r') bRooks.push([r, c]);
        else if (cell.type === 'k') bKing = [r, c];
      }
    }
  }

  // Bishop pair
  if (wBishops >= 2) {
    mgScore += 30;
    egScore += 45;
  }
  if (bBishops >= 2) {
    mgScore -= 30;
    egScore -= 45;
  }

  // Pawn structure: doubled, isolated, passed
  for (let f = 0; f < 8; f++) {
    if (wPawnsByFile[f] > 1) {
      const pen = 15 * (wPawnsByFile[f] - 1);
      mgScore -= pen;
      egScore -= pen;
    }
    if (bPawnsByFile[f] > 1) {
      const pen = 15 * (bPawnsByFile[f] - 1);
      mgScore += pen;
      egScore += pen;
    }
    if (wPawnsByFile[f] > 0) {
      const left = f > 0 ? wPawnsByFile[f - 1] : 0;
      const right = f < 7 ? wPawnsByFile[f + 1] : 0;
      if (left === 0 && right === 0) {
        mgScore -= 14 * wPawnsByFile[f];
        egScore -= 18 * wPawnsByFile[f];
      }
    }
    if (bPawnsByFile[f] > 0) {
      const left = f > 0 ? bPawnsByFile[f - 1] : 0;
      const right = f < 7 ? bPawnsByFile[f + 1] : 0;
      if (left === 0 && right === 0) {
        mgScore += 14 * bPawnsByFile[f];
        egScore += 18 * bPawnsByFile[f];
      }
    }
  }

  for (const [r, c] of wPawns) {
    let passed = true;
    for (const [br, bc] of bPawns) {
      if (Math.abs(bc - c) <= 1 && br < r) {
        passed = false;
        break;
      }
    }
    if (passed) {
      const adv = 7 - r;
      mgScore += Math.round(PASSED_BONUS[adv] * 0.6);
      egScore += PASSED_BONUS[adv];
    }
  }
  for (const [r, c] of bPawns) {
    let passed = true;
    for (const [wr, wc] of wPawns) {
      if (Math.abs(wc - c) <= 1 && wr > r) {
        passed = false;
        break;
      }
    }
    if (passed) {
      const adv = r;
      mgScore -= Math.round(PASSED_BONUS[adv] * 0.6);
      egScore -= PASSED_BONUS[adv];
    }
  }

  // Rooks on open / semi-open files and 7th rank
  for (const [r, c] of wRooks) {
    if (wPawnsByFile[c] === 0) {
      const bonus = bPawnsByFile[c] === 0 ? 24 : 12;
      mgScore += bonus;
      egScore += bonus;
    }
    if (r === 1) {
      mgScore += 18;
      egScore += 24;
    }
  }
  for (const [r, c] of bRooks) {
    if (bPawnsByFile[c] === 0) {
      const bonus = wPawnsByFile[c] === 0 ? 24 : 12;
      mgScore -= bonus;
      egScore -= bonus;
    }
    if (r === 6) {
      mgScore -= 18;
      egScore -= 24;
    }
  }

  // King safety: pawn shield in middlegame
  if (wKing && wKing[0] >= 6) {
    const [, kc] = wKing;
    for (let dc = -1; dc <= 1; dc++) {
      const fc = kc + dc;
      if (fc < 0 || fc > 7) continue;
      if (board[wKing[0] - 1][fc]?.type === 'p' && board[wKing[0] - 1][fc]?.color === 'w') mgScore += 10;
    }
  }
  if (bKing && bKing[0] <= 1) {
    const [, kc] = bKing;
    for (let dc = -1; dc <= 1; dc++) {
      const fc = kc + dc;
      if (fc < 0 || fc > 7) continue;
      if (board[bKing[0] + 1][fc]?.type === 'p' && board[bKing[0] + 1][fc]?.color === 'b') mgScore -= 10;
    }
  }

  const clampedPhase = Math.min(24, phase);
  const tapered = Math.round((mgScore * clampedPhase + egScore * (24 - clampedPhase)) / 24);
  const tempo = g.turn() === 'w' ? 8 : -8;
  return tapered + tempo;
}

const MATE = 100_000;

// Deterministic 2x32-bit Zobrist tables for fast transposition table keys.
const ZOBRIST_A = new Uint32Array(12 * 64 + 1);
const ZOBRIST_B = new Uint32Array(12 * 64 + 1);
(() => {
  let s1 = 0x9e3779b9;
  let s2 = 0x85ebca6b;
  const next = (x: number) => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return x >>> 0;
  };
  for (let i = 0; i < ZOBRIST_A.length; i++) {
    s1 = next(s1);
    s2 = next(s2);
    ZOBRIST_A[i] = s1;
    ZOBRIST_B[i] = s2;
  }
})();

const PIECE_IDX: Record<string, number> = { p: 0, n: 1, b: 2, r: 3, q: 4, k: 5 };

function boardHash(g: Chess): string {
  const b = g.board();
  let h1 = 0;
  let h2 = 0;
  for (let r = 0; r < 8; r++) {
    const rank = b[r];
    for (let c = 0; c < 8; c++) {
      const cell = rank[c];
      if (!cell) continue;
      const pi = PIECE_IDX[cell.type] + (cell.color === 'b' ? 6 : 0);
      const slot = pi * 64 + (r * 8 + c);
      h1 ^= ZOBRIST_A[slot];
      h2 ^= ZOBRIST_B[slot];
    }
  }
  if (g.turn() === 'b') {
    const tSlot = 12 * 64;
    h1 ^= ZOBRIST_A[tSlot];
    h2 ^= ZOBRIST_B[tSlot];
  }
  return `${h1 >>> 0}:${h2 >>> 0}`;
}

const enum TTFlag {
  EXACT = 0,
  LOWER = 1,
  UPPER = 2,
}

interface TTEntry {
  depth: number;
  score: number;
  flag: TTFlag;
  bestFrom?: string;
  bestTo?: string;
  bestPromo?: string;
}

interface SearchCtx {
  nodes: number;
  deadline: number;
  expired: boolean;
  useQuiesce: boolean;
  tt: Map<string, TTEntry>;
  killers: [string | null, string | null][];
  history: Map<string, number>;
}

function outOfBudget(b: SearchCtx): boolean {
  if (b.expired) return true;
  if (b.nodes <= 0 || (b.nodes % 64 === 0 && Date.now() > b.deadline)) b.expired = true;
  return b.expired;
}

function moveKey(m: Move): string {
  return `${m.from}${m.to}${m.promotion ?? ''}`;
}

function orderMoves(moves: Move[], ttEntry?: TTEntry, killers?: [string | null, string | null], history?: Map<string, number>): Move[] {
  const score = (m: Move): number => {
    if (ttEntry && ttEntry.bestFrom === m.from && ttEntry.bestTo === m.to && ttEntry.bestPromo === m.promotion) {
      return 10_000_000;
    }
    if (m.captured || m.promotion) {
      return 1_000_000 + (m.captured ? 10 * VAL[m.captured] - VAL[m.piece] : 0) + (m.promotion ? 8000 : 0);
    }
    if (m.san.endsWith('+') || m.san.endsWith('#')) {
      return 800_000;
    }
    const mk = moveKey(m);
    if (killers) {
      if (killers[0] === mk) return 500_000;
      if (killers[1] === mk) return 400_000;
    }
    return history?.get(mk) ?? 0;
  };
  return moves.sort((a, b) => score(b) - score(a));
}

function quiesce(g: Chess, alpha: number, beta: number, sign: 1 | -1, ctx: SearchCtx, qDepth: number): number {
  ctx.nodes--;
  if (outOfBudget(ctx)) return sign * evaluateChess(g);
  const standPat = sign * evaluateChess(g);
  if (standPat >= beta) return beta;
  if (standPat > alpha) alpha = standPat;
  if (qDepth <= 0) return alpha;

  const captures = g.moves({ verbose: true }).filter((m) => m.captured || m.promotion);
  orderMoves(captures);
  const opp: 1 | -1 = sign === 1 ? -1 : 1;

  for (const m of captures) {
    if (!m.promotion && m.captured && standPat + VAL[m.captured] + 200 < alpha) continue;
    g.move({ from: m.from, to: m.to, promotion: m.promotion });
    const score = -quiesce(g, -beta, -alpha, opp, ctx, qDepth - 1);
    g.undo();
    if (ctx.expired) return alpha;
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function negamax(g: Chess, depth: number, ply: number, alpha: number, beta: number, sign: 1 | -1, ctx: SearchCtx): number {
  ctx.nodes--;
  if (outOfBudget(ctx)) return sign * evaluateChess(g);

  if (ply === 1 && g.isThreefoldRepetition()) {
    return 0;
  }

  const key = boardHash(g);
  const ttEntry = ctx.tt.get(key);
  if (ttEntry && ttEntry.depth >= depth && ply > 0) {
    if (ttEntry.flag === TTFlag.EXACT) return ttEntry.score;
    if (ttEntry.flag === TTFlag.LOWER && ttEntry.score > alpha) alpha = ttEntry.score;
    else if (ttEntry.flag === TTFlag.UPPER && ttEntry.score < beta) beta = ttEntry.score;
    if (alpha >= beta) return ttEntry.score;
  }

  const inCheck = g.inCheck();
  const ext = inCheck && ply < 8 ? 1 : 0;
  const effDepth = depth + ext;

  if (effDepth <= 0) {
    return ctx.useQuiesce ? quiesce(g, alpha, beta, sign, ctx, 4) : sign * evaluateChess(g);
  }

  const moves = g.moves({ verbose: true });
  if (moves.length === 0) return inCheck ? -MATE + ply : 0;

  const origAlpha = alpha;
  const killers = ctx.killers[ply];
  const ordered = orderMoves(moves, ttEntry, killers, ctx.history);
  const opp: 1 | -1 = sign === 1 ? -1 : 1;
  let best = -Infinity;
  let bestMove: Move | undefined;

  for (let i = 0; i < ordered.length; i++) {
    const m = ordered[i];
    const isQuiet = !m.captured && !m.promotion;
    g.move({ from: m.from, to: m.to, promotion: m.promotion });

    let score: number;
    if (i >= 4 && effDepth >= 3 && !inCheck && isQuiet) {
      // Late Move Reduction (LMR): search late quiet moves at reduced depth first.
      score = -negamax(g, effDepth - 2, ply + 1, -alpha - 1, -alpha, opp, ctx);
      if (score > alpha && !ctx.expired) {
        score = -negamax(g, effDepth - 1, ply + 1, -beta, -alpha, opp, ctx);
      }
    } else if (i > 0 && effDepth >= 2) {
      // Principal Variation Search (PVS)
      score = -negamax(g, effDepth - 1, ply + 1, -alpha - 1, -alpha, opp, ctx);
      if (score > alpha && score < beta && !ctx.expired) {
        score = -negamax(g, effDepth - 1, ply + 1, -beta, -alpha, opp, ctx);
      }
    } else {
      score = -negamax(g, effDepth - 1, ply + 1, -beta, -alpha, opp, ctx);
    }

    g.undo();
    if (ctx.expired) return best === -Infinity ? alpha : best;

    if (score > best) {
      best = score;
      bestMove = m;
    }
    if (score > alpha) alpha = score;
    if (alpha >= beta) {
      if (isQuiet) {
        const mk = moveKey(m);
        if (!ctx.killers[ply]) ctx.killers[ply] = [null, null];
        if (ctx.killers[ply][0] !== mk) {
          ctx.killers[ply][1] = ctx.killers[ply][0];
          ctx.killers[ply][0] = mk;
        }
        ctx.history.set(mk, (ctx.history.get(mk) ?? 0) + effDepth * effDepth);
      }
      break;
    }
  }

  if (ctx.tt.size < 100_000) {
    const flag = best <= origAlpha ? TTFlag.UPPER : best >= beta ? TTFlag.LOWER : TTFlag.EXACT;
    ctx.tt.set(key, {
      depth: effDepth,
      score: best,
      flag,
      bestFrom: bestMove?.from,
      bestTo: bestMove?.to,
      bestPromo: bestMove?.promotion,
    });
  }

  return best;
}

export interface ChessBotMove {
  from: string;
  to: string;
  promotion?: 'q' | 'r' | 'b' | 'n';
}

const CHESS_LEVEL: Record<Difficulty, { depth: number; slack: number; blunder: number; ms: number; nodes: number; useQuiesce: boolean; bookProb: number }> = {
  easy: { depth: 1, slack: 120, blunder: 0.25, ms: 200, nodes: 50_000, useQuiesce: false, bookProb: 0 },
  medium: { depth: 3, slack: 20, blunder: 0.04, ms: 600, nodes: 250_000, useQuiesce: true, bookProb: 0.75 },
  hard: { depth: 6, slack: 0, blunder: 0, ms: 1500, nodes: 800_000, useQuiesce: true, bookProb: 1.0 },
};

export function chessBotMove(fen: string, difficulty: Difficulty, rng: Rng = Math.random): ChessBotMove | null {
  const g = new Chess(fen);
  const moves = g.moves({ verbose: true });
  if (moves.length === 0) return null;
  const { depth, slack, blunder, ms, nodes, useQuiesce, bookProb } = CHESS_LEVEL[difficulty];
  const toMove = (m: Move): ChessBotMove => ({ from: m.from, to: m.to, promotion: m.promotion as ChessBotMove['promotion'] });
  if (rng() < blunder) return toMove(pick(moves, rng));

  // A mate in one is always played.
  for (const m of moves) {
    g.move({ from: m.from, to: m.to, promotion: m.promotion });
    const mate = g.isCheckmate();
    g.undo();
    if (mate) return toMove(m);
  }

  // Randomized opening book lookup for varied, theory-backed openings.
  if (bookProb > 0 && rng() < bookProb) {
    const bookMove = pickOpeningMove(fen, rng);
    if (bookMove) return bookMove;
  }

  const opp: 1 | -1 = g.turn() === 'w' ? -1 : 1;
  const ctx: SearchCtx = {
    nodes,
    deadline: Date.now() + ms,
    expired: false,
    useQuiesce,
    tt: new Map(),
    killers: [],
    history: new Map(),
  };

  let result: { m: Move; s: number }[] = [];
  // Iterative deepening: keep the deepest search that finished in time.
  for (let d = 1; d <= depth; d++) {
    let best = -Infinity;
    const scored: { m: Move; s: number }[] = [];
    // Search last iteration's best moves first so cut-offs come early.
    const order = result.length ? [...result].sort((a, b) => b.s - a.s).map((x) => x.m) : orderMoves(moves);
    for (const m of order) {
      g.move({ from: m.from, to: m.to, promotion: m.promotion });
      const s = -negamax(g, d - 1, 1, -Infinity, -(best - slack - 1), opp, ctx);
      g.undo();
      if (ctx.expired && d > 1) break;
      scored.push({ m, s });
      if (s > best) best = s;
    }
    if (ctx.expired && d > 1) break;
    result = scored;
    if (best >= MATE - 50) break; // Found forced mate
  }

  const best = Math.max(...result.map((x) => x.s));
  return toMove(pick(result.filter((x) => x.s >= best - slack).map((x) => x.m), rng));
}

// ---------------------------------------------------------------------------
// Dama: alpha-beta on material (kings worth 3 men) and advancement.

function evaluateDama(state: DamaState, color: 'w' | 'b'): number {
  let score = 0;
  state.board.forEach((cell, i) => {
    if (!cell) return;
    const own = cell.toLowerCase() === color;
    const [r] = rc(i);
    const advance = cell === 'w' ? 7 - r : cell === 'b' ? r : 0;
    const v = isKing(cell) ? 300 : 100 + advance * 4;
    score += own ? v : -v;
  });
  return score;
}

function damaSearch(state: DamaState, depth: number, alpha: number, beta: number, budget: { nodes: number }): number {
  budget.nodes--;
  const moves = damaLegalMoves(state);
  if (moves.length === 0) return -MATE - depth;
  if (depth === 0 || budget.nodes <= 0) return evaluateDama(state, state.turn);
  let best = -Infinity;
  for (const m of moves) {
    const s = -damaSearch(playDamaMove(state, m), depth - 1, -beta, -alpha, budget);
    if (s > best) best = s;
    if (s > alpha) alpha = s;
    if (alpha >= beta) break;
  }
  return best;
}

const DAMA_LEVEL: Record<Difficulty, { depth: number; slack: number; blunder: number }> = {
  easy: { depth: 1, slack: 60, blunder: 0.3 },
  medium: { depth: 3, slack: 10, blunder: 0.05 },
  hard: { depth: 5, slack: 0, blunder: 0 },
};

export function damaBotMove(state: DamaState, difficulty: Difficulty, rng: Rng = Math.random): DamaMove | null {
  const moves = damaLegalMoves(state);
  if (moves.length === 0) return null;
  const { depth, slack, blunder } = DAMA_LEVEL[difficulty];
  if (rng() < blunder) return pick(moves, rng);
  const budget = { nodes: 40_000 };
  const scored = moves.map((m) => ({ m, s: -damaSearch(playDamaMove(state, m), depth - 1, -Infinity, Infinity, budget) }));
  const best = Math.max(...scored.map((x) => x.s));
  return pick(scored.filter((x) => x.s >= best - slack).map((x) => x.m), rng);
}

// ---------------------------------------------------------------------------
// Block Drop: score every rotation and column, then steer the piece there.

export interface Placement {
  rot: number;
  x: number;
  score: number;
}

function heights(grid: number[]): number[] {
  const h = Array(COLS).fill(0);
  for (let x = 0; x < COLS; x++) {
    for (let y = 0; y < ROWS; y++) {
      if (grid[y * COLS + x] !== 0) {
        h[x] = ROWS - y;
        break;
      }
    }
  }
  return h;
}

/** Board quality after a placement (higher is better). */
export function scoreGrid(grid: number[], linesCleared: number): number {
  const h = heights(grid);
  const aggregate = h.reduce((a, b) => a + b, 0);
  let holes = 0;
  for (let x = 0; x < COLS; x++) {
    let seen = false;
    for (let y = 0; y < ROWS; y++) {
      if (grid[y * COLS + x] !== 0) seen = true;
      else if (seen) holes++;
    }
  }
  let bump = 0;
  for (let x = 0; x < COLS - 1; x++) bump += Math.abs(h[x] - h[x + 1]);
  return -0.51 * aggregate + 0.76 * linesCleared - 0.36 * holes - 0.18 * bump;
}

/** Every reachable resting placement for `kind`, best first. */
export function rankPlacements(grid: number[], kind: PieceKind): Placement[] {
  const out: Placement[] = [];
  const rots = kind === 'O' ? [0] : kind === 'I' || kind === 'S' || kind === 'Z' ? [0, 1] : [0, 1, 2, 3];
  const spawn = spawnOf(kind);
  for (const rot of rots) {
    for (let x = -3; x < COLS; x++) {
      let y = spawn.y;
      if (!fitsGrid(grid, { kind, rot, x, y })) continue;
      while (fitsGrid(grid, { kind, rot, x, y: y + 1 })) y++;
      const g = grid.slice();
      let overTop = false;
      for (const [cx, cy] of pieceCells(kind, rot)) {
        if (y + cy < 0) overTop = true;
        else g[(y + cy) * COLS + x + cx] = 1;
      }
      let lines = 0;
      for (let row = ROWS - 1; row >= 0; row--) {
        if (g.slice(row * COLS, row * COLS + COLS).every((v) => v !== 0)) {
          g.splice(row * COLS, COLS);
          g.unshift(...Array(COLS).fill(0));
          lines++;
          row++;
        }
      }
      out.push({ rot, x, score: overTop ? -1e9 : scoreGrid(g, lines) });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

const DROP_LEVEL: Record<Difficulty, { stepMs: number; error: number; hardDrop: boolean }> = {
  easy: { stepMs: 320, error: 0.35, hardDrop: false },
  medium: { stepMs: 200, error: 0.12, hardDrop: true },
  hard: { stepMs: 80, error: 0.03, hardDrop: true },
};

/** A computer Block Drop player. Call tick() from the same loop as the human game. */
export class BlockDropCpu {
  readonly game: BlockDrop;
  private target: Placement | null = null;
  /** `pieceId` the current target was planned for. */
  private plannedFor = -1;
  private stepMs = 0;
  private readonly level: (typeof DROP_LEVEL)[Difficulty];
  private readonly rng: Rng;

  constructor(seed: number, difficulty: Difficulty, rng: Rng = Math.random) {
    this.game = new BlockDrop(seed);
    this.level = DROP_LEVEL[difficulty];
    this.rng = rng;
  }

  /** Advances the CPU by `dt` ms; returns any lock events this produced. */
  tick(dt: number): LockEvent[] {
    const g = this.game;
    const events: LockEvent[] = [];
    if (g.over || !g.active) return events;

    if (this.plannedFor !== g.pieceId) {
      // New piece: choose where it goes (sometimes not the best spot on easier levels).
      const ranked = rankPlacements(g.grid, g.active.kind);
      const idx = this.rng() < this.level.error ? Math.min(ranked.length - 1, 1 + Math.floor(this.rng() * 4)) : 0;
      this.target = ranked[idx] ?? null;
      this.plannedFor = g.pieceId;
    }

    this.stepMs += dt;
    while (this.stepMs >= this.level.stepMs && g.active && !g.over && this.plannedFor === g.pieceId) {
      this.stepMs -= this.level.stepMs;
      const a = g.active;
      const t = this.target;
      let moved = false;
      if (t && a.rot !== t.rot) moved = g.rotate(1);
      else if (t && a.x !== t.x) moved = g.move(t.x > a.x ? 1 : -1);
      if (!moved) {
        if (this.level.hardDrop) {
          const ev = g.hardDrop();
          if (ev) events.push(ev);
        } else {
          // Easier levels ride the piece down and let the lock delay place it.
          g.softDrop();
        }
      }
    }

    const gravity = g.tick(dt);
    if (gravity) events.push(gravity);
    return events;
  }
}
