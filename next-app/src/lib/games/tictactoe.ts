// Tic-Tac-Toe. Player one is X and moves first.

export type TttMark = 'X' | 'O' | '';
export interface TttState {
  board: TttMark[];
}

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export function initialTtt(): TttState {
  return { board: Array<TttMark>(9).fill('') };
}

export function parseTtt(raw: unknown): TttState {
  const b = (raw as { board?: unknown } | null)?.board;
  if (!Array.isArray(b) || b.length !== 9) return initialTtt();
  return { board: b.map((c) => (c === 'X' || c === 'O' ? c : '')) };
}

/** Whose mark is next, from the board alone (X always starts). */
export function tttNextMark(state: TttState): 'X' | 'O' {
  const xs = state.board.filter((c) => c === 'X').length;
  const os = state.board.filter((c) => c === 'O').length;
  return xs > os ? 'O' : 'X';
}

export function tttWinner(state: TttState): { mark: 'X' | 'O'; line: number[] } | null {
  for (const line of LINES) {
    const [a, b, c] = line;
    const m = state.board[a];
    if (m && m === state.board[b] && m === state.board[c]) return { mark: m, line };
  }
  return null;
}

export function tttIsDraw(state: TttState): boolean {
  return !tttWinner(state) && state.board.every((c) => c !== '');
}

/** Places the next mark; null when the move is illegal. */
export function applyTttMove(state: TttState, cell: number): TttState | null {
  if (!Number.isInteger(cell) || cell < 0 || cell > 8) return null;
  if (state.board[cell] !== '' || tttWinner(state)) return null;
  const board = state.board.slice();
  board[cell] = tttNextMark(state);
  return { board };
}
