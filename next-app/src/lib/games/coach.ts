// Pedagogical AI Game Coach & Guide for Solo practice (Chess, Dama, Tic-Tac-Toe, Block Drop).
// Designed as a Socratic teacher — NOT a cheat engine:
// * Teaches principles, phase goals, and board awareness first (no move spoilers upfront).
// * Highlights opponent threats so players learn to spot danger themselves.
// * Uses progressive clues: Concept -> Clue 1 (Which piece?) -> Clue 2 (Strategic idea).
// * Reviews the player's own chosen move afterwards so they learn from mistakes.

import { Chess, type Move, type Square } from 'chess.js';
import { evaluateChess } from './bots';
import { type ChessColor, type ChessPieceType, type ChessState, type PromotionPiece } from './chess';
import { colorOf, damaLegalMoves, isKing, playDamaMove, rc, type DamaColor, type DamaMove, type DamaState } from './dama';
import { applyTttMove, tttIsDraw, tttNextMark, tttWinner, type TttMark, type TttState } from './tictactoe';
import { COLS, ROWS, type PieceKind } from './blockdrop';

export type CoachMode = 'live' | 'hint' | 'off';

export const COACH_MODES: { id: CoachMode; label: string; desc: string }[] = [
  { id: 'live', label: 'Coach On', desc: 'Shows strategic concepts, threat alerts, and move feedback' },
  { id: 'hint', label: 'Quiet Coach', desc: 'Only speaks when you ask for a clue or make a blunder' },
  { id: 'off', label: 'Off', desc: 'Play with no coaching guide' },
];

/** Progressive clue level on the player's turn:
 * 0 = Concept & principles only (no board spoiler)
 * 1 = Piece clue (highlights only WHICH piece to think about, not where it goes)
 * 2 = Idea clue (explains the destination idea if the player is truly stuck)
 */
export type ClueLevel = 0 | 1 | 2;

export type MoveGrade = 'brilliant' | 'best' | 'good' | 'inaccuracy' | 'blunder';

export interface LastMoveReview {
  grade: MoveGrade;
  label: string;
  detail: string;
  /** Socratic question or tip for retrying, without spoiling the exact coordinates. */
  retryPrompt?: string;
}

// ============================================================================
// 1. CHESS COACH (SOCRATIC & PRINCIPLE-BASED)
// ============================================================================

export interface ChessCoachClue {
  from: string;
  to: string;
  promotion?: PromotionPiece;
  /** Concept tag shown at Clue Level 0 (e.g., "Center Control", "Defend Threat", "King Safety"). */
  conceptTag: string;
  /** Guiding principle shown at Clue Level 0 — no square or piece spoilers! */
  conceptPrompt: string;
  /** Clue Level 1: Tells you which piece (`from`) to consider and asks a question. */
  pieceClue: string;
  /** Clue Level 2: Explains the tactical/strategic idea if still stuck. */
  ideaExplanation: string;
}

export interface ChessCoachReport {
  kind: 'chess';
  side: ChessColor;
  turn: ChessColor;
  /** 0..100 balance indicator for White. */
  whiteWinPct: number;
  evalLabel: string;
  phase: 'Opening' | 'Middlegame' | 'Endgame';
  phaseTip: string;
  /** Squares of the player's own pieces that are currently attacked and in danger. */
  threatenedSquares: string[];
  threatSummary: string | null;
  clue: ChessCoachClue | null;
  lastMoveReview: LastMoveReview | null;
}

const PIECE_VALUE_CP: Record<ChessPieceType, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

const PIECE_WORD: Record<ChessPieceType, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

const CENTER_SQUARES = new Set(['d4', 'd5', 'e4', 'e5']);
const EXTENDED_CENTER = new Set(['c3', 'd3', 'e3', 'f3', 'c4', 'c5', 'f4', 'f5', 'c6', 'd6', 'e6', 'f6']);

/** Converts centipawns (White's view) into a 5..95% balance percentage for White. */
export function cpToWhitePct(cp: number): number {
  if (cp >= 50_000) return 98;
  if (cp <= -50_000) return 2;
  const pct = 100 / (1 + Math.pow(10, -cp / 400));
  return Math.max(4, Math.min(96, Math.round(pct)));
}

export function formatCp(cp: number): string {
  if (cp >= 50_000) return 'Winning';
  if (cp <= -50_000) return 'Critical';
  const pawns = cp / 100;
  const sign = pawns > 0.05 ? '+' : '';
  return `${sign}${pawns.toFixed(1)}`;
}

function detectPhase(g: Chess): 'Opening' | 'Middlegame' | 'Endgame' {
  let nonPawnMaterial = 0;
  let minorMajorCount = 0;
  for (const rank of g.board()) {
    for (const cell of rank) {
      if (!cell || cell.type === 'p' || cell.type === 'k') continue;
      nonPawnMaterial += PIECE_VALUE_CP[cell.type];
      minorMajorCount++;
    }
  }
  if (minorMajorCount <= 6 || nonPawnMaterial <= 2600) return 'Endgame';
  if (g.moveNumber() <= 10) return 'Opening';
  return 'Middlegame';
}

/** Finds the player's own valuable pieces that are currently attacked by the opponent and either undefended or attacked by a lesser piece. */
function findThreatenedPlayerPieces(g: Chess, myColor: ChessColor): { square: string; type: ChessPieceType; undefended: boolean }[] {
  const oppColor: ChessColor = myColor === 'w' ? 'b' : 'w';
  const out: { square: string; type: ChessPieceType; undefended: boolean }[] = [];
  for (const rank of g.board()) {
    for (const cell of rank) {
      if (!cell || cell.color !== myColor || cell.type === 'k') continue;
      const sq = cell.square as Square;
      if (!g.isAttacked(sq, oppColor)) continue;
      const defended = g.isAttacked(sq, myColor);
      if (!defended || PIECE_VALUE_CP[cell.type] >= 320) {
        out.push({ square: cell.square, type: cell.type as ChessPieceType, undefended: !defended });
      }
    }
  }
  out.sort((a, b) => PIECE_VALUE_CP[b.type] - PIECE_VALUE_CP[a.type]);
  return out;
}

/** Evaluates a move with fast 2-ply lookahead (move + opponent's best response) using static leaf evaluation. */
function scoreChessCandidate(g: Chess, m: Move, perspective: ChessColor): { scoreCp: number; replySan?: string } {
  const sign = perspective === 'w' ? 1 : -1;
  g.move({ from: m.from, to: m.to, promotion: m.promotion });

  if (g.isCheckmate()) {
    g.undo();
    return { scoreCp: 90_000 };
  }

  const oppMoves = g.moves({ verbose: true });
  if (oppMoves.length === 0) {
    const score = g.inCheck() ? 90_000 : 0;
    g.undo();
    return { scoreCp: score };
  }

  oppMoves.sort((a, b) => {
    const ka = (a.captured ? 10 * PIECE_VALUE_CP[a.captured as ChessPieceType] : 0) + (a.promotion ? 800 : 0);
    const kb = (b.captured ? 10 * PIECE_VALUE_CP[b.captured as ChessPieceType] : 0) + (b.promotion ? 800 : 0);
    return kb - ka;
  });

  let worstForUs = Infinity;
  let bestOppReplySan: string | undefined;

  for (const opp of oppMoves) {
    g.move({ from: opp.from, to: opp.to, promotion: opp.promotion });
    const evalForUs = sign * evaluateChess(g);
    g.undo();

    if (evalForUs < worstForUs) {
      worstForUs = evalForUs;
      bestOppReplySan = opp.san;
    }
  }

  g.undo();
  return { scoreCp: worstForUs, replySan: bestOppReplySan };
}

function countForkedTargets(afterGame: Chess, myColor: ChessColor): ChessPieceType[] {
  const oppColor: ChessColor = myColor === 'w' ? 'b' : 'w';
  const attacked: ChessPieceType[] = [];
  for (const rank of afterGame.board()) {
    for (const cell of rank) {
      if (!cell || cell.color !== oppColor || cell.type === 'p') continue;
      if (afterGame.isAttacked(cell.square as Square, myColor)) {
        attacked.push(cell.type as ChessPieceType);
      }
    }
  }
  return attacked;
}

function buildSocraticChessClue(beforeFen: string, m: Move): ChessCoachClue {
  const before = new Chess(beforeFen);
  const wasInCheck = before.inCheck();
  const after = new Chess(beforeFen);
  after.move({ from: m.from, to: m.to, promotion: m.promotion });

  const pieceName = PIECE_WORD[m.piece as ChessPieceType] ?? 'piece';
  const base = {
    from: m.from,
    to: m.to,
    promotion: m.promotion as PromotionPiece | undefined,
  };

  if (after.isCheckmate()) {
    return {
      ...base,
      conceptTag: 'Checkmate Pattern',
      conceptPrompt: 'Look closely at the enemy king — it has no flight squares. Can you find the winning check?',
      pieceClue: `Look at your ${pieceName} on ${m.from}. Which square lets it attack the king with no escape?`,
      ideaExplanation: `Moving your ${pieceName} from ${m.from} to ${m.to} delivers checkmate because the enemy king cannot escape or block.`,
    };
  }

  if (wasInCheck) {
    return {
      ...base,
      conceptTag: 'King Defense',
      conceptPrompt: 'Your king is in check! Decide the safest way: capture the attacker, block the line, or step the king away.',
      pieceClue: `Consider using your ${pieceName} on ${m.from} to resolve the check safely.`,
      ideaExplanation:
        m.piece === 'k'
          ? `Stepping your king to ${m.to} gets out of check onto a sheltered square.`
          : m.captured
            ? `Capturing on ${m.to} with your ${pieceName} removes the checking piece directly.`
            : `Interposing your ${pieceName} on ${m.to} shields your king and keeps your pieces coordinated.`,
    };
  }

  if (m.promotion) {
    return {
      ...base,
      conceptTag: 'Pawn Promotion',
      conceptPrompt: 'You have a pawn on the 7th rank ready to reach the end of the board!',
      pieceClue: `Your advanced pawn on ${m.from} is one step away from promoting.`,
      ideaExplanation: `Advancing from ${m.from} to ${m.to} promotes your pawn into a new queen.`,
    };
  }

  if (m.flags.includes('k') || m.flags.includes('q')) {
    const side = m.flags.includes('k') ? 'kingside' : 'queenside';
    return {
      ...base,
      conceptTag: 'King Safety',
      conceptPrompt: 'Your minor pieces are developed and the path between your king and rook is clear. How can you safeguard your king?',
      pieceClue: `Look at your king on ${m.from} — castling tucked behind your pawns will also activate a rook.`,
      ideaExplanation: `Castling ${side} (${m.san}) shelters your king and brings your rook toward the center files.`,
    };
  }

  if (m.captured) {
    const capName = PIECE_WORD[m.captured as ChessPieceType] ?? 'piece';
    const defended = after.isAttacked(m.to as Square, after.turn());
    if (!defended) {
      return {
        ...base,
        conceptTag: 'Undefended Target',
        conceptPrompt: `Scan your opponent's pieces — one of their pieces is completely undefended! Can you spot it?`,
        pieceClue: `Your ${pieceName} on ${m.from} has a clear line of sight to an unprotected opponent piece.`,
        ideaExplanation: `The opponent's ${capName} on ${m.to} is undefended — capturing it with your ${pieceName} wins free material.`,
      };
    }
    return {
      ...base,
      conceptTag: 'Favorable Trade',
      conceptPrompt: 'Look for a capture that wins material or opens up the position in your favor.',
      pieceClue: `Examine what your ${pieceName} on ${m.from} is currently attacking.`,
      ideaExplanation: `Capturing the ${capName} on ${m.to} with your ${pieceName} comes out ahead in the exchange.`,
    };
  }

  const beforeAttacked = countForkedTargets(before, m.color);
  const afterAttacked = countForkedTargets(after, m.color);
  if (afterAttacked.length >= 2 && afterAttacked.length > beforeAttacked.length) {
    return {
      ...base,
      conceptTag: 'Double Attack',
      conceptPrompt: 'Look for a square where one of your pieces can threaten two opponent targets at the same time.',
      pieceClue: `Consider your ${pieceName} on ${m.from} — can it jump to a square that forks multiple enemy pieces?`,
      ideaExplanation: `Moving your ${pieceName} to ${m.to} creates a double attack, pressuring multiple opponent pieces at once.`,
    };
  }

  const homeRank = m.color === 'w' ? '1' : '8';
  if ((m.piece === 'n' || m.piece === 'b') && m.from[1] === homeRank) {
    return {
      ...base,
      conceptTag: 'Piece Development',
      conceptPrompt: 'Opening principle: Bring your sleeping knights and bishops off the back rank toward the center.',
      pieceClue: `Your ${pieceName} on ${m.from} hasn't entered the game yet. Which active square gives it the most scope?`,
      ideaExplanation: `Developing your ${pieceName} to ${m.to} fights for the central squares and prepares castling.`,
    };
  }

  if (CENTER_SQUARES.has(m.to)) {
    return {
      ...base,
      conceptTag: 'Center Control',
      conceptPrompt: 'Pieces and pawns in the center (d4, d5, e4, e5) control more of the board. How can you stake a claim in the center?',
      pieceClue: `Look at your ${pieceName} on ${m.from} — how can it occupy a central square?`,
      ideaExplanation: `Advancing your ${pieceName} to ${m.to} claims central space and opens diagonals for your other pieces.`,
    };
  }

  if (EXTENDED_CENTER.has(m.to)) {
    return {
      ...base,
      conceptTag: 'Improve Activity',
      conceptPrompt: 'Find your least active piece and move it to a square where it supports the center or guards key squares.',
      pieceClue: `Think about how to improve the position of your ${pieceName} on ${m.from}.`,
      ideaExplanation: `Placing your ${pieceName} on ${m.to} improves coordination and controls important central squares.`,
    };
  }

  return {
    ...base,
    conceptTag: 'Positional Plan',
    conceptPrompt: 'Look to improve piece coordination, open files for your rooks, and keep your pieces defended.',
    pieceClue: `Look at your ${pieceName} on ${m.from} — where can it move to be more effective?`,
    ideaExplanation: `Moving your ${pieceName} from ${m.from} to ${m.to} keeps your position solid and active.`,
  };
}

export function analyzeChessCoach(
  state: ChessState,
  side: ChessColor,
  prevState?: ChessState | null
): ChessCoachReport {
  const g = new Chess(state.fen);
  const turn = g.turn();
  const phase = detectPhase(g);
  const rawEvalWhite = g.isCheckmate()
    ? turn === 'w'
      ? -90_000
      : 90_000
    : g.isDraw() || g.isStalemate()
      ? 0
      : evaluateChess(g);

  const legalMoves = g.moves({ verbose: true });
  const scored = legalMoves.map((m) => {
    const { scoreCp, replySan } = scoreChessCandidate(g, m, turn);
    return { m, scoreCp, replySan };
  });
  scored.sort((a, b) => b.scoreCp - a.scoreCp);

  const bestScoreWhite =
    scored.length > 0 ? (turn === 'w' ? scored[0].scoreCp : -scored[0].scoreCp) : rawEvalWhite;
  const whiteWinPct = cpToWhitePct(bestScoreWhite);

  const evalLabel = (() => {
    if (g.isCheckmate()) return turn === side ? 'Checkmated' : 'Checkmate!';
    if (g.isDraw() || g.isStalemate()) return 'Draw position';
    const myCp = side === 'w' ? bestScoreWhite : -bestScoreWhite;
    if (myCp > 250) return 'Strong advantage';
    if (myCp > 65) return 'Slight advantage';
    if (myCp < -250) return 'Defending';
    if (myCp < -65) return 'Under pressure';
    return 'Even position';
  })();

  const threats = turn === side ? findThreatenedPlayerPieces(g, side) : [];
  const threatenedSquares = threats.map((t) => t.square);
  const threatSummary =
    threats.length > 0
      ? threats[0].undefended
        ? `Alert: Your ${PIECE_WORD[threats[0].type]} on ${threats[0].square} is attacked and undefended!`
        : `Heads up: Opponent is pressuring your ${PIECE_WORD[threats[0].type]} on ${threats[0].square}.`
      : null;

  const clue: ChessCoachClue | null =
    turn === side && scored.length > 0 ? buildSocraticChessClue(state.fen, scored[0].m) : null;

  // Grade the player's last move if we have the previous state where it was their turn
  let lastMoveReview: LastMoveReview | null = null;
  if (prevState && state.lastMove) {
    const prevG = new Chess(prevState.fen);
    if (prevG.turn() === side) {
      const prevMoves = prevG.moves({ verbose: true });
      const prevScored = prevMoves
        .map((m) => ({ m, ...scoreChessCandidate(prevG, m, side) }))
        .sort((a, b) => b.scoreCp - a.scoreCp);
      const bestPrev = prevScored[0];
      const played = prevScored.find(
        (x) => x.m.from === state.lastMove?.from && x.m.to === state.lastMove?.to
      );
      if (bestPrev && played) {
        const diff = bestPrev.scoreCp - played.scoreCp;
        const playedSan = played.m.san;
        const betterClue = buildSocraticChessClue(prevState.fen, bestPrev.m);
        if (played.scoreCp >= 80_000 || (diff <= 10 && played.m.captured)) {
          lastMoveReview = {
            grade: 'brilliant',
            label: `Great tactical eye (${playedSan})`,
            detail: 'You spotted the strongest tactical continuation on your own!',
          };
        } else if (diff <= 25) {
          lastMoveReview = {
            grade: 'best',
            label: `Strong move (${playedSan})`,
            detail: 'Follows sound chess principles and keeps your pieces coordinated.',
          };
        } else if (diff <= 80) {
          lastMoveReview = {
            grade: 'good',
            label: `Solid move (${playedSan})`,
            detail: 'Playable and safe. Keep watching for ways to improve piece activity.',
          };
        } else if (diff <= 190) {
          lastMoveReview = {
            grade: 'inaccuracy',
            label: `Inaccuracy (${playedSan})`,
            detail: `Missed a stronger idea (${betterClue.conceptTag.toLowerCase()}).`,
            retryPrompt: betterClue.pieceClue,
          };
        } else {
          lastMoveReview = {
            grade: 'blunder',
            label: `Blunder (${playedSan})`,
            detail: 'Careful — that move loses material or leaves a key square unguarded!',
            retryPrompt: betterClue.pieceClue,
          };
        }
      }
    }
  }

  const phaseTip =
    phase === 'Opening'
      ? 'Opening principle: Control the center, develop knights and bishops before moving the same piece twice, and castle early.'
      : phase === 'Middlegame'
        ? 'Middlegame principle: Before moving, always ask "What did my opponent\'s last move threaten?" and look for undefended pieces.'
        : 'Endgame principle: Bring your king toward the center to help escort your pawns to the promotion rank.';

  return {
    kind: 'chess',
    side,
    turn,
    whiteWinPct,
    evalLabel,
    phase,
    phaseTip,
    threatenedSquares,
    threatSummary,
    clue,
    lastMoveReview,
  };
}

// ============================================================================
// 2. DAMA (FILIPINO CHECKERS) COACH
// ============================================================================

export interface DamaCoachClue {
  from: number;
  path: number[];
  captures: number[];
  conceptTag: string;
  conceptPrompt: string;
  pieceClue: string;
  ideaExplanation: string;
}

export interface DamaCoachReport {
  kind: 'dama';
  side: DamaColor;
  turn: DamaColor;
  whiteWinPct: number;
  evalLabel: string;
  phaseTip: string;
  clue: DamaCoachClue | null;
  lastMoveReview: LastMoveReview | null;
}

function damaCoord(i: number): string {
  const [r, c] = rc(i);
  return `${'abcdefgh'[c]}${8 - r}`;
}

function evaluateDamaStatic(state: DamaState, perspective: DamaColor): number {
  let score = 0;
  state.board.forEach((cell, i) => {
    if (!cell) return;
    const own = colorOf(cell) === perspective;
    const [r, c] = rc(i);
    const advance = cell === 'w' ? 7 - r : cell === 'b' ? r : 0;
    const centerBonus = r >= 2 && r <= 5 && c >= 2 && c <= 5 ? 12 : 0;
    const backRankGuard = (cell === 'w' && r === 7) || (cell === 'b' && r === 0) ? 10 : 0;
    const val = isKing(cell) ? 310 + centerBonus : 100 + advance * 6 + centerBonus + backRankGuard;
    score += own ? val : -val;
  });
  return score;
}

function damaMinimax(state: DamaState, depth: number, alpha: number, beta: number, perspective: DamaColor): number {
  const moves = damaLegalMoves(state);
  if (moves.length === 0) {
    return state.turn === perspective ? -10_000 - depth : 10_000 + depth;
  }
  if (depth === 0) return evaluateDamaStatic(state, perspective);
  const maximizing = state.turn === perspective;
  let best = maximizing ? -Infinity : Infinity;
  for (const m of moves) {
    const next = playDamaMove(state, m);
    const s = damaMinimax(next, depth - 1, alpha, beta, perspective);
    if (maximizing) {
      if (s > best) best = s;
      if (s > alpha) alpha = s;
    } else {
      if (s < best) best = s;
      if (s < beta) beta = s;
    }
    if (alpha >= beta) break;
  }
  return best;
}

function buildSocraticDamaClue(state: DamaState, m: DamaMove): DamaCoachClue {
  const to = m.path[m.path.length - 1];
  const piece = state.board[m.from];
  const [toR, toC] = rc(to);
  const promotes = !isKing(piece) && ((piece === 'w' && toR === 0) || (piece === 'b' && toR === 7));

  if (m.captures.length >= 2) {
    return {
      from: m.from,
      path: m.path,
      captures: m.captures,
      conceptTag: `Multi-Jump (${m.captures.length}x)`,
      conceptPrompt: 'In Filipino Dama, captures are mandatory! Look for a piece that can chain multiple jumps in one turn.',
      pieceClue: `Check your piece on ${damaCoord(m.from)} — trace the diagonal jump sequence it can make.`,
      ideaExplanation: `Jumping from ${damaCoord(m.from)} to ${damaCoord(to)} captures ${m.captures.length} opponent pieces in a single chain!`,
    };
  }
  if (m.captures.length === 1) {
    return {
      from: m.from,
      path: m.path,
      captures: m.captures,
      conceptTag: 'Mandatory Capture',
      conceptPrompt: 'A capture is available on the board! Remember: in Dama, you must jump when a capture exists.',
      pieceClue: `Look at your piece on ${damaCoord(m.from)} — it has a diagonal jump available.`,
      ideaExplanation: `Jumping from ${damaCoord(m.from)} to ${damaCoord(to)} removes the opponent's piece on ${damaCoord(m.captures[0])}.`,
    };
  }
  if (promotes) {
    return {
      from: m.from,
      path: m.path,
      captures: m.captures,
      conceptTag: 'Crown Flying King',
      conceptPrompt: 'One of your pieces can reach the opponent\'s back rank this turn to crown a Flying King!',
      pieceClue: `Look at your advanced piece on ${damaCoord(m.from)} near the back rank.`,
      ideaExplanation: `Moving from ${damaCoord(m.from)} to ${damaCoord(to)} crowns a Dama (Flying King) that moves any distance diagonally.`,
    };
  }

  const next = playDamaMove(state, m);
  const oppCaptures = damaLegalMoves(next).filter((om) => om.captures.length > 0);
  if (oppCaptures.length === 0 && toC >= 2 && toC <= 5) {
    return {
      from: m.from,
      path: m.path,
      captures: m.captures,
      conceptTag: 'Safe Center Advance',
      conceptPrompt: 'Advance toward the center dark squares while making sure you don\'t step into an immediate jump.',
      pieceClue: `Consider advancing your piece on ${damaCoord(m.from)} — check if its landing squares are safe.`,
      ideaExplanation: `Advancing from ${damaCoord(m.from)} to ${damaCoord(to)} controls the center without giving away a capture.`,
    };
  }

  return {
    from: m.from,
    path: m.path,
    captures: m.captures,
    conceptTag: 'Formation Play',
    conceptPrompt: 'Keep your pieces supporting each other diagonally and avoid leaving single pieces exposed with empty squares behind them.',
    pieceClue: `Look at your piece on ${damaCoord(m.from)} for a safe diagonal step.`,
    ideaExplanation: `Moving ${damaCoord(m.from)} to ${damaCoord(to)} maintains a solid diagonal structure.`,
  };
}

export function analyzeDamaCoach(
  state: DamaState,
  side: DamaColor,
  prevState?: DamaState | null
): DamaCoachReport {
  const legal = damaLegalMoves(state);
  const scored = legal
    .map((m) => {
      const next = playDamaMove(state, m);
      const score = damaMinimax(next, 3, -Infinity, Infinity, state.turn);
      return { m, score };
    })
    .sort((a, b) => b.score - a.score);

  const whiteScore = evaluateDamaStatic(state, 'w');
  const whiteWinPct = cpToWhitePct(whiteScore * 1.4);
  const myScore = side === 'w' ? whiteScore : -whiteScore;
  const evalLabel =
    myScore > 150
      ? 'Material lead'
      : myScore > 40
        ? 'Slight edge'
        : myScore < -150
          ? 'Defending'
          : myScore < -40
            ? 'Under pressure'
            : 'Even board';

  const clue: DamaCoachClue | null =
    state.turn === side && scored.length > 0 ? buildSocraticDamaClue(state, scored[0].m) : null;

  let lastMoveReview: LastMoveReview | null = null;
  if (prevState && prevState.turn === side && state.lastMove) {
    const prevLegal = damaLegalMoves(prevState);
    const prevScored = prevLegal
      .map((m) => ({
        m,
        score: damaMinimax(playDamaMove(prevState, m), 2, -Infinity, Infinity, side),
      }))
      .sort((a, b) => b.score - a.score);
    const best = prevScored[0];
    const played = prevScored.find(
      (x) => x.m.from === state.lastMove?.from && x.m.path[x.m.path.length - 1] === state.lastMove?.to
    );
    if (best && played) {
      const diff = best.score - played.score;
      const betterClue = buildSocraticDamaClue(prevState, best.m);
      if (diff <= 15) {
        lastMoveReview = {
          grade: 'best',
          label: 'Strong move',
          detail: 'Keeps your diagonal formation protected.',
        };
      } else if (diff <= 80) {
        lastMoveReview = {
          grade: 'good',
          label: 'Safe move',
          detail: 'Maintains a playable structure.',
        };
      } else {
        lastMoveReview = {
          grade: 'blunder',
          label: 'Careful — exposed piece!',
          detail: 'That move lets your opponent jump one of your pieces.',
          retryPrompt: betterClue.pieceClue,
        };
      }
    }
  }

  return {
    kind: 'dama',
    side,
    turn: state.turn,
    whiteWinPct,
    evalLabel,
    phaseTip: 'Dama principle: A piece can only be jumped if there is an empty dark square directly behind it!',
    clue,
    lastMoveReview,
  };
}

// ============================================================================
// 3. TIC-TAC-TOE COACH
// ============================================================================

export interface TttCoachClue {
  cell: number;
  conceptTag: string;
  conceptPrompt: string;
  ideaExplanation: string;
}

export interface TttCoachReport {
  kind: 'tictactoe';
  mark: 'X' | 'O';
  turn: 'X' | 'O';
  whiteWinPct: number;
  evalLabel: string;
  phaseTip: string;
  clue: TttCoachClue | null;
  lastMoveReview: LastMoveReview | null;
}

const TTT_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

const TTT_CELL_NAMES = [
  'Top-Left Corner (R1·C1)',
  'Top Edge (R1·C2)',
  'Top-Right Corner (R1·C3)',
  'Left Edge (R2·C1)',
  'Center (R2·C2)',
  'Right Edge (R2·C3)',
  'Bottom-Left Corner (R3·C1)',
  'Bottom Edge (R3·C2)',
  'Bottom-Right Corner (R3·C3)',
];

function tttExactScore(state: TttState, me: 'X' | 'O', depth = 0): number {
  const w = tttWinner(state);
  if (w) return w.mark === me ? 10 - depth : depth - 10;
  if (tttIsDraw(state)) return 0;
  const toMove = tttNextMark(state);
  let best = toMove === me ? -Infinity : Infinity;
  for (let i = 0; i < 9; i++) {
    const next = applyTttMove(state, i);
    if (!next) continue;
    const s = tttExactScore(next, me, depth + 1);
    best = toMove === me ? Math.max(best, s) : Math.min(best, s);
  }
  return best;
}

function countWinningThreats(board: TttMark[], mark: 'X' | 'O'): number {
  let threats = 0;
  for (const [a, b, c] of TTT_LINES) {
    const cells = [board[a], board[b], board[c]];
    const mine = cells.filter((x) => x === mark).length;
    const empty = cells.filter((x) => x === '').length;
    if (mine === 2 && empty === 1) threats++;
  }
  return threats;
}

function buildSocraticTttClue(state: TttState, cell: number, me: 'X' | 'O'): TttCoachClue {
  const opp: 'X' | 'O' = me === 'X' ? 'O' : 'X';
  const next = applyTttMove(state, cell)!;
  const label = TTT_CELL_NAMES[cell];

  if (tttWinner(next)?.mark === me) {
    return {
      cell,
      conceptTag: 'Winning Line',
      conceptPrompt: 'You already have two in a row with an open third square! Scan your rows, columns, and diagonals.',
      ideaExplanation: `${label} completes your three-in-a-row line.`,
    };
  }

  const oppTestBoard = state.board.slice();
  oppTestBoard[cell] = opp;
  if (tttWinner({ board: oppTestBoard })?.mark === opp) {
    return {
      cell,
      conceptTag: 'Defensive Block',
      conceptPrompt: `Watch out! ${opp} has two in a row and threatens to win on the next turn. Find the blocking square!`,
      ideaExplanation: `Playing ${label} blocks ${opp}'s winning line.`,
    };
  }

  const myThreats = countWinningThreats(next.board, me);
  if (myThreats >= 2) {
    return {
      cell,
      conceptTag: 'Create a Fork',
      conceptPrompt: 'Look for a square that creates TWO separate two-in-a-row threats at the same time!',
      ideaExplanation: `${label} sets up a double threat (fork) that your opponent cannot block at once.`,
    };
  }

  if (cell === 4) {
    return {
      cell,
      conceptTag: 'Center Control',
      conceptPrompt: 'Which single square on a 3x3 grid belongs to the most winning lines (4 lines total)?',
      ideaExplanation: `The ${label} intersects 4 winning lines — more than any other square.`,
    };
  }

  return {
    cell,
    conceptTag: 'Corner Strategy',
    conceptPrompt: 'When the center is taken or balanced, corners participate in 3 winning lines each (vs only 2 for edges).',
    ideaExplanation: `${label} controls a corner and prevents opponent forks.`,
  };
}

export function analyzeTttCoach(
  state: TttState,
  mark: 'X' | 'O',
  prevState?: TttState | null
): TttCoachReport {
  const turn = tttNextMark(state);
  // A won board has no moves left to score, even with empty squares.
  const empty = tttWinner(state) ? [] : state.board.map((c, i) => (c === '' ? i : -1)).filter((i) => i >= 0);

  const scored = empty
    .map((cell) => {
      const next = applyTttMove(state, cell)!;
      const exact = tttExactScore(next, turn, 1);
      const positional = cell === 4 ? 0.3 : cell % 2 === 0 ? 0.2 : 0.1;
      return { cell, exact, total: exact + positional };
    })
    .sort((a, b) => b.total - a.total);

  const xScore = turn === 'X' ? (scored[0]?.exact ?? 0) : -(scored[0]?.exact ?? 0);
  const whiteWinPct = xScore > 0 ? 85 : xScore < 0 ? 15 : 50;
  const myExact = mark === 'X' ? xScore : -xScore;
  const evalLabel =
    myExact > 0 ? 'Winning opportunity' : myExact < 0 ? 'Must defend' : 'Balanced';

  const clue: TttCoachClue | null =
    turn === mark && !tttWinner(state) && scored.length > 0
      ? buildSocraticTttClue(state, scored[0].cell, mark)
      : null;

  let lastMoveReview: LastMoveReview | null = null;
  if (prevState && tttNextMark(prevState) === mark) {
    const playedCell = state.board.findIndex((c, i) => c !== prevState.board[i]);
    if (playedCell >= 0) {
      const prevEmpty = prevState.board.map((c, i) => (c === '' ? i : -1)).filter((i) => i >= 0);
      const prevScored = prevEmpty
        .map((c) => ({ c, s: tttExactScore(applyTttMove(prevState, c)!, mark, 1) }))
        .sort((a, b) => b.s - a.s);
      const best = prevScored[0];
      const played = prevScored.find((x) => x.c === playedCell);
      if (best && played) {
        if (played.s === best.s) {
          lastMoveReview = {
            grade: 'best',
            label: 'Optimal choice',
            detail: 'Keeps maximum control of the grid.',
          };
        } else {
          const betterClue = buildSocraticTttClue(prevState, best.c, mark);
          lastMoveReview = {
            grade: 'blunder',
            label: 'Missed key square',
            detail: `That square gives your opponent an opening (${betterClue.conceptTag.toLowerCase()}).`,
            retryPrompt: betterClue.conceptPrompt,
          };
        }
      }
    }
  }

  return {
    kind: 'tictactoe',
    mark,
    turn,
    whiteWinPct,
    evalLabel,
    phaseTip: 'Tic-Tac-Toe principle: Center (4 lines) > Corners (3 lines) > Edges (2 lines).',
    clue,
    lastMoveReview,
  };
}

// ============================================================================
// 4. BLOCK DROP STACK HEALTH COACH (NO CHEAT TARGETS OR AUTO-PLAY)
// ============================================================================

export interface BlockDropCoachReport {
  kind: 'blockdrop';
  piece: PieceKind;
  holes: number;
  maxHeight: number;
  tag: string;
  headline: string;
  reason: string;
}

export function analyzeBlockDropCoach(
  grid: number[],
  active: { kind: PieceKind; rot: number; x: number; y: number } | null
): BlockDropCoachReport | null {
  if (!active) return null;

  const heights = Array<number>(COLS).fill(0);
  let holes = 0;
  for (let x = 0; x < COLS; x++) {
    let seenBlock = false;
    for (let y = 0; y < ROWS; y++) {
      if (grid[y * COLS + x] !== 0) {
        if (!seenBlock) heights[x] = ROWS - y;
        seenBlock = true;
      } else if (seenBlock) {
        holes++;
      }
    }
  }

  const maxHeight = Math.max(...heights);
  const leftAvg = heights.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
  const rightAvg = heights.slice(5).reduce((a, b) => a + b, 0) / 5;

  let bumpiness = 0;
  for (let x = 0; x < COLS - 1; x++) bumpiness += Math.abs(heights[x] - heights[x + 1]);

  if (maxHeight >= 14) {
    return {
      kind: 'blockdrop',
      piece: active.kind,
      holes,
      maxHeight,
      tag: 'Danger High Stack',
      headline: 'Priority: Skim horizontal lines now',
      reason: 'Your stack is near the top — focus on completing any single row to lower the well before stacking higher.',
    };
  }

  if (holes > 0) {
    return {
      kind: 'blockdrop',
      piece: active.kind,
      holes,
      maxHeight,
      tag: `${holes} Trapped ${holes === 1 ? 'Hole' : 'Holes'}`,
      headline: 'Avoid covering empty spaces',
      reason: 'Place pieces flush against the surface and clear rows above the trapped holes to uncover them.',
    };
  }

  if (Math.abs(leftAvg - rightAvg) >= 3) {
    const lowerSide = leftAvg < rightAvg ? 'left side' : 'right side';
    return {
      kind: 'blockdrop',
      piece: active.kind,
      holes,
      maxHeight,
      tag: 'Balance Stack',
      headline: `Build toward the ${lowerSide}`,
      reason: `Your stack is uneven — steers pieces toward the ${lowerSide} to keep the surface flat and flexible.`,
    };
  }

  if (bumpiness >= 10) {
    return {
      kind: 'blockdrop',
      piece: active.kind,
      holes,
      maxHeight,
      tag: 'Jagged Surface',
      headline: 'Smooth out deep gaps',
      reason: 'Rotate pieces so their flat edge fills narrow valleys — jagged stacks make O and S/Z pieces hard to place.',
    };
  }

  return {
    kind: 'blockdrop',
    piece: active.kind,
    holes: 0,
    maxHeight,
    tag: 'Clean Stack (0 Holes)',
    headline: 'Great flat foundation!',
    reason: 'Keep building level across the center and leave one side column open for vertical I-piece clears.',
  };
}
