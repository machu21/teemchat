// Computer opponents for solo play. Classic rule-based search and heuristics
// (minimax / alpha-beta / placement scoring); no AI service is involved.
import { Chess, type Move } from 'chess.js';
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
// Chess: alpha-beta negamax with material + piece-square tables.

const VAL: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
// Piece-square tables from white's view, a8..h8 first (same order as board()).
const PST: Record<string, number[]> = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15,
    20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10,
    5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10,
    -10, -10, -10, -10, -10, -20,
  ],
  r: [
    0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0,
    0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0,
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0,
    -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10,
    -10, -20,
  ],
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40,
    -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20,
    -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20,
  ],
};

/** Static evaluation in centipawns, positive when white is better. */
export function evaluateChess(g: Chess): number {
  let score = 0;
  g.board().forEach((rank, r) =>
    rank.forEach((cell, c) => {
      if (!cell) return;
      const idx = cell.color === 'w' ? r * 8 + c : (7 - r) * 8 + c;
      const v = VAL[cell.type] + PST[cell.type][idx];
      score += cell.color === 'w' ? v : -v;
    })
  );
  return score;
}

const MATE = 100_000;

function orderMoves(moves: Move[]): Move[] {
  const key = (m: Move) => (m.captured ? 10 * VAL[m.captured] - VAL[m.piece] : 0) + (m.promotion ? 800 : 0);
  return moves.sort((a, b) => key(b) - key(a));
}

interface Budget {
  nodes: number;
  deadline: number;
  /** Sticky: once set, every node returns its static score straight away. */
  expired?: boolean;
}

function outOfBudget(b: Budget): boolean {
  if (b.expired) return true;
  if (b.nodes <= 0 || (b.nodes % 64 === 0 && Date.now() > b.deadline)) b.expired = true;
  return Boolean(b.expired);
}

function negamax(g: Chess, depth: number, alpha: number, beta: number, sign: 1 | -1, budget: Budget): number {
  budget.nodes--;
  // Leaves are scored statically: generating moves here (to spot mate) costs far more than it saves.
  if (depth === 0 || outOfBudget(budget)) return sign * evaluateChess(g);
  const moves = g.moves({ verbose: true });
  if (moves.length === 0) return g.inCheck() ? -MATE - depth : 0;
  let best = -Infinity;
  for (const m of orderMoves(moves)) {
    g.move({ from: m.from, to: m.to, promotion: m.promotion });
    const s = -negamax(g, depth - 1, -beta, -alpha, sign === 1 ? -1 : 1, budget);
    g.undo();
    if (s > best) best = s;
    if (s > alpha) alpha = s;
    if (alpha >= beta) break;
  }
  return best;
}

export interface ChessBotMove {
  from: string;
  to: string;
  promotion?: 'q' | 'r' | 'b' | 'n';
}

const CHESS_LEVEL: Record<Difficulty, { depth: number; slack: number; blunder: number; ms: number }> = {
  easy: { depth: 1, slack: 120, blunder: 0.25, ms: 300 },
  medium: { depth: 2, slack: 25, blunder: 0.05, ms: 600 },
  hard: { depth: 3, slack: 0, blunder: 0, ms: 1000 },
};

export function chessBotMove(fen: string, difficulty: Difficulty, rng: Rng = Math.random): ChessBotMove | null {
  const g = new Chess(fen);
  const moves = g.moves({ verbose: true });
  if (moves.length === 0) return null;
  const { depth, slack, blunder, ms } = CHESS_LEVEL[difficulty];
  const toMove = (m: Move): ChessBotMove => ({ from: m.from, to: m.to, promotion: m.promotion as ChessBotMove['promotion'] });
  if (rng() < blunder) return toMove(pick(moves, rng));

  // A mate in one is always played.
  for (const m of moves) {
    g.move({ from: m.from, to: m.to, promotion: m.promotion });
    const mate = g.isCheckmate();
    g.undo();
    if (mate) return toMove(m);
  }

  const opp: 1 | -1 = g.turn() === 'w' ? -1 : 1;
  const budget: Budget = { nodes: 200_000, deadline: Date.now() + ms };
  let result: { m: Move; s: number }[] = [];
  // Iterative deepening: keep the deepest search that finished in time.
  for (let d = 1; d <= depth; d++) {
    let best = -Infinity;
    const scored: { m: Move; s: number }[] = [];
    // Search last iteration's best moves first so cut-offs come early.
    const order = result.length ? [...result].sort((a, b) => b.s - a.s).map((x) => x.m) : orderMoves(moves);
    for (const m of order) {
      g.move({ from: m.from, to: m.to, promotion: m.promotion });
      // Moves more than `slack` worse than the best so far can be cut off early.
      const s = -negamax(g, d - 1, -Infinity, -(best - slack - 1), opp, budget);
      g.undo();
      scored.push({ m, s });
      if (s > best) best = s;
    }
    if (budget.expired && d > 1) break;
    result = scored;
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
