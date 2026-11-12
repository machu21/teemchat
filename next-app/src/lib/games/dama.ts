// Filipino Dama (checkers), 8 x 8.
// * 12 men each on the dark squares. Player one is white, at the bottom, and moves first.
// * Men move one step diagonally forward, and capture forward and backward.
// * Capturing is mandatory, and a multi-jump must be completed.
// * Kings fly: they move and capture any distance along a diagonal.
// * Captured pieces come off at the end of the move and cannot be jumped twice.
// * A side with no legal move loses. 80 plies of quiet king moves is a draw.

export type DamaColor = 'w' | 'b';
export type DamaCell = '' | 'w' | 'W' | 'b' | 'B';

export interface DamaState {
  board: DamaCell[];
  turn: DamaColor;
  lastMove: { from: number; to: number; captures: number[] } | null;
  /** Plies since the last capture or man move. */
  quiet: number;
}

export interface DamaMove {
  from: number;
  /** Landing squares in order; the last one is the destination. */
  path: number[];
  captures: number[];
}

export const DAMA_DRAW_PLIES = 80;
const DIRS: [number, number][] = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

export const rc = (i: number): [number, number] => [Math.floor(i / 8), i % 8];
export const idx = (r: number, c: number) => r * 8 + c;
const onBoard = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;
export const isDark = (i: number) => {
  const [r, c] = rc(i);
  return (r + c) % 2 === 1;
};

export const colorOf = (cell: DamaCell): DamaColor | null => (cell === '' ? null : (cell.toLowerCase() as DamaColor));
export const isKing = (cell: DamaCell) => cell === 'W' || cell === 'B';
/** White men move up the board (towards row 0). */
const forward = (color: DamaColor) => (color === 'w' ? -1 : 1);

export function initialDama(): DamaState {
  const board: DamaCell[] = Array<DamaCell>(64).fill('');
  for (let i = 0; i < 64; i++) {
    if (!isDark(i)) continue;
    const [r] = rc(i);
    if (r <= 2) board[i] = 'b';
    else if (r >= 5) board[i] = 'w';
  }
  return { board, turn: 'w', lastMove: null, quiet: 0 };
}

const CELLS: DamaCell[] = ['', 'w', 'W', 'b', 'B'];

export function parseDama(raw: unknown): DamaState {
  const r = (raw ?? {}) as Partial<Record<keyof DamaState, unknown>>;
  if (!Array.isArray(r.board) || r.board.length !== 64) return initialDama();
  const board = r.board.map((c) => (CELLS.includes(c as DamaCell) ? (c as DamaCell) : ''));
  const lm = r.lastMove as { from?: unknown; to?: unknown; captures?: unknown } | null;
  const okIdx = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < 64;
  return {
    board,
    turn: r.turn === 'b' ? 'b' : 'w',
    lastMove:
      lm && okIdx(lm.from) && okIdx(lm.to)
        ? { from: lm.from, to: lm.to, captures: Array.isArray(lm.captures) ? lm.captures.filter(okIdx) : [] }
        : null,
    quiet: Number.isInteger(r.quiet) ? Math.max(0, r.quiet as number) : 0,
  };
}

function captureSequences(
  board: DamaCell[],
  at: number,
  piece: DamaCell,
  captured: number[],
  path: number[],
  out: { path: number[]; captures: number[] }[]
) {
  const color = colorOf(piece)!;
  const king = isKing(piece);
  const [r, c] = rc(at);
  let extended = false;

  for (const [dr, dc] of DIRS) {
    if (king) {
      let rr = r + dr;
      let cc = c + dc;
      while (onBoard(rr, cc) && board[idx(rr, cc)] === '') {
        rr += dr;
        cc += dc;
      }
      if (!onBoard(rr, cc)) continue;
      const victim = idx(rr, cc);
      if (colorOf(board[victim]) === color || captured.includes(victim)) continue;
      let lr = rr + dr;
      let lc = cc + dc;
      while (onBoard(lr, lc) && board[idx(lr, lc)] === '') {
        extended = true;
        const land = idx(lr, lc);
        captureSequences(board, land, piece, [...captured, victim], [...path, land], out);
        lr += dr;
        lc += dc;
      }
    } else {
      const vr = r + dr;
      const vc = c + dc;
      const lr = r + 2 * dr;
      const lc = c + 2 * dc;
      if (!onBoard(lr, lc)) continue;
      const victim = idx(vr, vc);
      const land = idx(lr, lc);
      if (board[victim] === '' || colorOf(board[victim]) === color || captured.includes(victim)) continue;
      if (board[land] !== '') continue;
      extended = true;
      captureSequences(board, land, piece, [...captured, victim], [...path, land], out);
    }
  }

  if (!extended && captured.length > 0) out.push({ path, captures: captured });
}

function quietMovesFrom(board: DamaCell[], from: number): DamaMove[] {
  const piece = board[from];
  const color = colorOf(piece)!;
  const [r, c] = rc(from);
  const moves: DamaMove[] = [];
  for (const [dr, dc] of DIRS) {
    if (isKing(piece)) {
      let rr = r + dr;
      let cc = c + dc;
      while (onBoard(rr, cc) && board[idx(rr, cc)] === '') {
        moves.push({ from, path: [idx(rr, cc)], captures: [] });
        rr += dr;
        cc += dc;
      }
    } else if (dr === forward(color)) {
      const rr = r + dr;
      const cc = c + dc;
      if (onBoard(rr, cc) && board[idx(rr, cc)] === '') moves.push({ from, path: [idx(rr, cc)], captures: [] });
    }
  }
  return moves;
}

/** Every legal move for the side to move (captures only, when any exist). */
export function damaLegalMoves(state: DamaState): DamaMove[] {
  const captures: DamaMove[] = [];
  const quiet: DamaMove[] = [];
  for (let i = 0; i < 64; i++) {
    const piece = state.board[i];
    if (colorOf(piece) !== state.turn) continue;
    const board = state.board.slice();
    board[i] = ''; // the moving piece leaves its square
    const seqs: { path: number[]; captures: number[] }[] = [];
    captureSequences(board, i, piece, [], [], seqs);
    for (const s of seqs) captures.push({ from: i, ...s });
    if (captures.length === 0) quiet.push(...quietMovesFrom(state.board, i));
  }
  return captures.length > 0 ? captures : quiet;
}

export function damaMovesFrom(state: DamaState, from: number): DamaMove[] {
  return damaLegalMoves(state).filter((m) => m.from === from);
}

/** Plays the legal move from `from` ending at `to`; null when there is none. */
export function applyDamaMove(state: DamaState, from: number, to: number): DamaState | null {
  const move = damaMovesFrom(state, from).find((m) => m.path[m.path.length - 1] === to);
  return move ? playDamaMove(state, move) : null;
}

/** Plays a move taken from `damaLegalMoves(state)` (not re-validated). */
export function playDamaMove(state: DamaState, move: DamaMove): DamaState {
  const { from } = move;
  const to = move.path[move.path.length - 1];
  const board = state.board.slice();
  const piece = board[from];
  board[from] = '';
  for (const c of move.captures) board[c] = '';
  const [toRow] = rc(to);
  const promotes = !isKing(piece) && ((piece === 'w' && toRow === 0) || (piece === 'b' && toRow === 7));
  board[to] = promotes ? (piece.toUpperCase() as DamaCell) : piece;
  const quiet = move.captures.length === 0 && isKing(piece) ? state.quiet + 1 : 0;
  return {
    board,
    turn: state.turn === 'w' ? 'b' : 'w',
    lastMove: { from, to, captures: move.captures },
    quiet,
  };
}

export type DamaOutcome = { over: false } | { over: true; winner: DamaColor | null };

export function damaOutcome(state: DamaState): DamaOutcome {
  if (state.quiet >= DAMA_DRAW_PLIES) return { over: true, winner: null };
  if (damaLegalMoves(state).length === 0) return { over: true, winner: state.turn === 'w' ? 'b' : 'w' };
  return { over: false };
}
