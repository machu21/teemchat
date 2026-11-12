// Runs the chess / dama search and AI Coach analysis off the main thread so
// the board and clocks stay smooth while the computer thinks. See botRunner.ts.
import { chessBotMove, damaBotMove, type Difficulty } from './bots';
import { analyzeChessCoach, analyzeDamaCoach } from './coach';
import type { ChessColor, ChessState } from './chess';
import type { DamaColor, DamaState } from './dama';

type Request =
  | { id: number; kind: 'chess'; fen: string; difficulty: Difficulty }
  | { id: number; kind: 'dama'; state: DamaState; difficulty: Difficulty }
  | { id: number; kind: 'coach_chess'; state: ChessState; side: ChessColor; prevState?: ChessState | null }
  | { id: number; kind: 'coach_dama'; state: DamaState; side: DamaColor; prevState?: DamaState | null };

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<Request>) => void) | null;
  postMessage: (msg: unknown) => void;
};

ctx.onmessage = (e) => {
  const req = e.data;
  let result: unknown;
  switch (req.kind) {
    case 'chess':
      result = chessBotMove(req.fen, req.difficulty);
      break;
    case 'dama':
      result = damaBotMove(req.state, req.difficulty);
      break;
    case 'coach_chess':
      result = analyzeChessCoach(req.state, req.side, req.prevState);
      break;
    case 'coach_dama':
      result = analyzeDamaCoach(req.state, req.side, req.prevState);
      break;
  }
  ctx.postMessage({ id: req.id, result });
};
