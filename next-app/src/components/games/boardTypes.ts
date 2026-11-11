/** Which side the viewer plays: player one, player two, or a spectator. */
export type Seat = 'one' | 'two' | null;

/** What a board reports after a legal move. `winner` is a seat, null for a draw. */
export interface BoardMove {
  state: unknown;
  finished: boolean;
  winner: Exclude<Seat, null> | null;
}

export interface TurnBoardProps {
  state: unknown;
  seat: Seat;
  /** True when it is the viewer's turn and the game is live. */
  canMove: boolean;
  onMove: (move: BoardMove) => void;
}
