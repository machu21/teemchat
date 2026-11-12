import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { BlockDropCpu, chessBotMove, damaBotMove, rankPlacements, tttBotMove } from '../src/lib/games/bots';
import { applyTttMove, initialTtt, type TttState } from '../src/lib/games/tictactoe';
import { applyChessMove, chessCaptured, initialChess, parseChess } from '../src/lib/games/chess';
import { damaLegalMoves, idx, initialDama, type DamaCell, type DamaState } from '../src/lib/games/dama';
import { COLS, ROWS } from '../src/lib/games/blockdrop';
import { formatClock, remainingMs } from '../src/lib/games/clock';
import { rowFromDb } from '../src/lib/games/types';

/** Deterministic rng for repeatable bot choices. */
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};
const noMistakes = () => 0.99;

const ttt = (cells: number[]): TttState => cells.reduce<TttState>((s, c) => applyTttMove(s, c)!, initialTtt());

describe('tic-tac-toe bot', () => {
  it('takes a winning cell on hard', () => {
    // X has 0 and 1; O to move would lose to 2, but here X is to move.
    expect(tttBotMove(ttt([0, 3, 1, 4]), 'hard', noMistakes)).toBe(2);
  });

  it('blocks the opponent on hard', () => {
    // X: 0, 1 — O to move must block 2.
    expect(tttBotMove(ttt([0, 4, 1]), 'hard', noMistakes)).toBe(2);
  });

  it('never loses to itself on hard (draw)', () => {
    let s = initialTtt();
    for (let i = 0; i < 9; i++) {
      const m = tttBotMove(s, 'hard', seq(0.99, 0.1, 0.5));
      if (m === null) break;
      s = applyTttMove(s, m)!;
    }
    expect(s.board.every((c) => c !== '')).toBe(true);
  });

  it('returns null when the game is over', () => {
    expect(tttBotMove(ttt([0, 3, 1, 4, 2]), 'hard')).toBeNull();
  });
});

describe('chess bot', () => {
  it('finds mate in one on medium and hard', () => {
    // White: Qh5, Bc4 vs the scholar's-mate setup; Qxf7# is mate.
    const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4';
    for (const level of ['medium', 'hard'] as const) {
      const m = chessBotMove(fen, level, noMistakes)!;
      const g = new Chess(fen);
      g.move(m);
      expect(g.isCheckmate()).toBe(true);
    }
  });

  it('takes a hanging queen', () => {
    const fen = '4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1';
    expect(chessBotMove(fen, 'hard', noMistakes)).toMatchObject({ from: 'd1', to: 'd5' });
  });

  it('always plays a legal move, even on easy', () => {
    const g = new Chess();
    for (let i = 0; i < 6; i++) {
      const m = chessBotMove(g.fen(), 'easy', seq(0.1, 0.7, 0.3));
      expect(m).not.toBeNull();
      expect(() => g.move(m!)).not.toThrow();
    }
  });
});

describe('chess history and captures', () => {
  it('records SAN history and parses it back', () => {
    const s = applyChessMove(applyChessMove(initialChess(), 'e2', 'e4')!, 'e7', 'e5')!;
    expect(s.history).toEqual(['e4', 'e5']);
    expect(parseChess(s).history).toEqual(['e4', 'e5']);
    expect(parseChess({ fen: s.fen, history: ['e4', 42, 'way-too-long-move'] }).history).toEqual(['e4']);
  });

  it('lists captured pieces and the material lead', () => {
    const c = chessCaptured({ fen: '4k3/8/8/8/8/8/8/3QK3 w - - 0 1', lastMove: null, history: [] });
    expect(c.byWhite).toEqual(['q', 'r', 'r', 'b', 'b', 'n', 'n', 'p', 'p', 'p', 'p', 'p', 'p', 'p', 'p']);
    expect(c.material).toBe(9);
  });
});

const dama = (pieces: Record<number, DamaCell>, turn: 'w' | 'b' = 'w'): DamaState => {
  const board: DamaCell[] = Array<DamaCell>(64).fill('');
  for (const [k, v] of Object.entries(pieces)) board[Number(k)] = v;
  return { board, turn, lastMove: null, quiet: 0 };
};

describe('dama bot', () => {
  it('picks the double capture over the single one', () => {
    const s = dama({ [idx(5, 2)]: 'w', [idx(4, 3)]: 'b', [idx(2, 5)]: 'b', [idx(5, 6)]: 'w', [idx(4, 7)]: 'b', [idx(0, 1)]: 'b' });
    const m = damaBotMove(s, 'hard', noMistakes)!;
    expect(m.captures.length).toBe(2);
  });

  it('plays a legal opening move on every level', () => {
    const legal = damaLegalMoves(initialDama());
    for (const level of ['easy', 'medium', 'hard'] as const) {
      const m = damaBotMove(initialDama(), level, seq(0.5, 0.2));
      expect(legal).toContainEqual(m);
    }
  });
});

describe('block drop cpu', () => {
  it('prefers the placement that clears a line', () => {
    const grid = Array(COLS * ROWS).fill(0);
    for (let x = 0; x < COLS - 1; x++) grid[(ROWS - 1) * COLS + x] = 3;
    const best = rankPlacements(grid, 'I')[0];
    expect(best.rot).toBe(1); // vertical
    expect(best.x + 2).toBe(COLS - 1); // into the gap in the last column
  });

  it('keeps playing pieces without topping out quickly on hard', () => {
    const cpu = new BlockDropCpu(7, 'hard', noMistakes);
    for (let t = 0; t < 600 && !cpu.game.over; t++) cpu.tick(50);
    expect(cpu.game.over).toBe(false);
    expect(cpu.game.pieceId).toBeGreaterThan(10);
  });
});

describe('clocks', () => {
  it('formats minutes and the final seconds with tenths', () => {
    expect(formatClock(5 * 60_000)).toBe('5:00');
    expect(formatClock(65_400)).toBe('1:06');
    expect(formatClock(9_340)).toBe('0:09.3');
    expect(formatClock(-50)).toBe('0:00.0');
  });

  it('only runs the clock of the side to move after it started', () => {
    expect(remainingMs(60_000, true, 1_000, 11_000)).toBe(50_000);
    expect(remainingMs(60_000, false, 1_000, 11_000)).toBe(60_000);
    expect(remainingMs(60_000, true, null, 11_000)).toBe(60_000);
  });

  it('maps clock columns from the database', () => {
    const row = rowFromDb({
      id: 'g',
      conversation_type: 'dm',
      conversation_id: 'c',
      game: 'chess',
      status: 'active',
      player_one: 'a',
      time_base_ms: 300_000,
      time_increment_ms: 2000,
      clock_one_ms: 250_000,
      clock_two_ms: null,
      turn_started_at: '2026-11-11T00:00:00Z',
    });
    expect(row).toMatchObject({ timeBaseMs: 300_000, timeIncMs: 2000, clockOneMs: 250_000, clockTwoMs: null });
    expect(rowFromDb({ ...row, id: 'g', conversation_type: 'dm', conversation_id: 'c', game: 'chess', status: 'active', player_one: 'a' })?.timeBaseMs).toBe(0);
  });
});
