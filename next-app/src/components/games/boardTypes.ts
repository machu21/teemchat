/** Which side the viewer plays: player one, player two, or a spectator. */
export type Seat = 'one' | 'two' | null;

/** What a board reports after a legal move. `winner` is a seat, null for a draw. */
export interface BoardMove {
  state: unknown;
  finished: boolean;
  winner: Exclude<Seat, null> | null;
}

export interface ChessCoachHint {
  /** Your own pieces that are currently under attack by the opponent. */
  threatenedSquares?: string[];
  /** Clue 1: highlights only WHICH piece to think about (no destination spoiler). */
  focusSquare?: string | null;
  /** Clue 2: only shown when the learner asks for the full idea after Clue 1. */
  arrow?: { from: string; to: string } | null;
}

export interface DamaCoachHint {
  /** Clue 1: highlights only WHICH piece to think about. */
  focusSquare?: number | null;
  /** Clue 2: only shown when the learner asks for the full idea after Clue 1. */
  arrow?: { from: number; path: number[] } | null;
}

export interface TttCoachHint {
  focusCell?: number | null;
}

export interface TurnBoardProps {
  state: unknown;
  seat: Seat;
  /** True when it is the viewer's turn and the game is live. */
  canMove: boolean;
  onMove: (move: BoardMove) => void;
}
