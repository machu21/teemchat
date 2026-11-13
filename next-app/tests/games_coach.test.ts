import { describe, expect, it } from 'vitest';
import {
  analyzeBlockDropCoach,
  analyzeChessCoach,
  analyzeDamaCoach,
  analyzeTttCoach,
  cpToWhitePct,
} from '../src/lib/games/coach';
import { applyChessMove, initialChess } from '../src/lib/games/chess';
import { idx, initialDama, type DamaCell, type DamaState } from '../src/lib/games/dama';
import { applyTttMove, initialTtt, type TttState } from '../src/lib/games/tictactoe';
import { COLS, ROWS } from '../src/lib/games/blockdrop';

const ttt = (cells: number[]): TttState => cells.reduce<TttState>((s, c) => applyTttMove(s, c)!, initialTtt());

const dama = (pieces: Record<number, DamaCell>, turn: 'w' | 'b' = 'w'): DamaState => {
  const board: DamaCell[] = Array<DamaCell>(64).fill('');
  for (const [k, v] of Object.entries(pieces)) board[Number(k)] = v;
  return { board, turn, lastMove: null, quiet: 0 };
};

describe('AI Game Coach — Socratic Chess Guide', () => {
  it('provides non-spoiling opening concept prompts and progressive clues for White', () => {
    const report = analyzeChessCoach(initialChess(), 'w');
    expect(report.phase).toBe('Opening');
    expect(report.clue).not.toBeNull();
    expect(report.clue?.conceptPrompt.length).toBeGreaterThan(10);
    expect(report.clue?.pieceClue.length).toBeGreaterThan(10);
    expect(report.clue?.ideaExplanation.length).toBeGreaterThan(10);
    expect(report.whiteWinPct).toBeGreaterThanOrEqual(45);
    expect(report.whiteWinPct).toBeLessThan(60);
  });

  it('identifies checkmate in one with Checkmate concept and progressive focus square', () => {
    const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4';
    const report = analyzeChessCoach({ fen, lastMove: null, history: [] }, 'w');
    expect(report.clue).toMatchObject({
      from: 'h5',
      to: 'f7',
      conceptTag: 'Checkmate Pattern',
    });
    expect(report.clue?.ideaExplanation.toLowerCase()).toContain('checkmate');
  });

  it('spots an undefended queen and guides the player to find the capture', () => {
    const fen = '4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1';
    const report = analyzeChessCoach({ fen, lastMove: null, history: [] }, 'w');
    expect(report.clue).toMatchObject({
      from: 'd1',
      to: 'd5',
      conceptTag: 'Undefended Target',
    });
  });

  it('detects when the player has an undefended piece under enemy attack (Threat Radar)', () => {
    const fen = '3rk3/8/8/3N4/8/8/8/4K3 w - - 0 1';
    const report = analyzeChessCoach({ fen, lastMove: null, history: [] }, 'w');
    expect(report.threatenedSquares).toContain('d5');
    expect(report.threatSummary).toContain('d5');
  });

  it('grades a strong move vs a blunder on lastMoveReview without spoiling exact destination square', () => {
    const before = {
      fen: '4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1',
      lastMove: null,
      history: [],
    };
    const goodAfter = applyChessMove(before, 'd1', 'd5')!;
    const goodReview = analyzeChessCoach(goodAfter, 'w', before).lastMoveReview;
    expect(goodReview?.grade).toBe('brilliant');

    const badAfter = applyChessMove(before, 'e1', 'f1')!;
    const badReview = analyzeChessCoach(badAfter, 'w', before).lastMoveReview;
    expect(badReview?.grade).toBe('blunder');
    expect(badReview?.retryPrompt?.length).toBeGreaterThan(10);
  });

  it('maps centipawns to win percentage bounded between 2 and 98', () => {
    expect(cpToWhitePct(0)).toBe(50);
    expect(cpToWhitePct(400)).toBeGreaterThan(85);
    expect(cpToWhitePct(-400)).toBeLessThan(15);
  });
});

describe('AI Game Coach — Socratic Dama Guide', () => {
  it('explains mandatory multi-jump rule and provides progressive clues', () => {
    const state = dama({
      [idx(5, 2)]: 'w',
      [idx(4, 3)]: 'b',
      [idx(2, 5)]: 'b',
      [idx(5, 6)]: 'w',
      [idx(4, 7)]: 'b',
      [idx(0, 1)]: 'b',
    });
    const report = analyzeDamaCoach(state, 'w');
    expect(report.clue).not.toBeNull();
    expect(report.clue?.captures.length).toBe(2);
    expect(report.clue?.conceptTag).toContain('Multi-Jump');
    expect(report.clue?.from).toBe(idx(5, 2));
  });

  it('guides safe opening advances with principles', () => {
    const report = analyzeDamaCoach(initialDama(), 'w');
    expect(report.clue).not.toBeNull();
    expect(report.clue?.conceptPrompt.length).toBeGreaterThan(10);
  });
});

describe('AI Game Coach — Socratic Tic-Tac-Toe Guide', () => {
  it('prompts the player to spot an immediate winning line', () => {
    const state = ttt([0, 3, 1, 4]); // X has 0, 1; X to move wins at 2
    const report = analyzeTttCoach(state, 'X');
    expect(report.clue?.cell).toBe(2);
    expect(report.clue?.conceptTag).toBe('Winning Line');
  });

  it('warns when a critical defensive block is required', () => {
    const state = ttt([0, 4, 1]); // X has 0, 1; O to move must block at 2
    const report = analyzeTttCoach(state, 'O');
    expect(report.clue?.cell).toBe(2);
    expect(report.clue?.conceptTag).toBe('Defensive Block');
  });
});

describe('AI Game Coach — finished Tic-Tac-Toe', () => {
  it('reports on a won board that still has empty squares', () => {
    const won = { board: ['X', 'X', 'X', '', 'O', 'O', '', '', ''] } as Parameters<typeof analyzeTttCoach>[0];
    const before = { board: ['X', 'X', '', '', 'O', 'O', '', '', ''] } as Parameters<typeof analyzeTttCoach>[0];
    const report = analyzeTttCoach(won, 'X', before);
    expect(report.clue).toBeNull();
    expect(report.lastMoveReview?.grade).toBe('best');
  });
});

describe('AI Game Coach — Block Drop Stack Coach', () => {
  it('diagnoses covered holes and stack health without giving cheat placements', () => {
    const grid = Array(COLS * ROWS).fill(0);
    // Create a covered hole at bottom-left: row ROWS-1 col 0 is empty, row ROWS-2 col 0 is filled
    grid[(ROWS - 2) * COLS + 0] = 2;
    const report = analyzeBlockDropCoach(grid, { kind: 'I', rot: 0, x: 3, y: 0 });
    expect(report).not.toBeNull();
    expect(report?.holes).toBe(1);
    expect(report?.tag).toBe('1 Trapped Hole');
  });
});
