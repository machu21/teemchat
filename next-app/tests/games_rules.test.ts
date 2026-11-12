import { describe, it, expect } from 'vitest';
import { applyTttMove, initialTtt, parseTtt, tttIsDraw, tttNextMark, tttWinner, type TttState } from '../src/lib/games/tictactoe';
import {
  applyChessMove,
  chessBoard,
  chessOutcome,
  chessTargetsFrom,
  chessTurn,
  initialChess,
  parseChess,
  START_FEN,
  type ChessState,
} from '../src/lib/games/chess';
import {
  applyDamaMove,
  damaLegalMoves,
  damaOutcome,
  DAMA_DRAW_PLIES,
  idx,
  initialDama,
  parseDama,
  type DamaCell,
  type DamaState,
} from '../src/lib/games/dama';
import { BlockDrop, COLS, GARBAGE, ROWS, parseBlockDrop, parseSnapshot, pieceCells } from '../src/lib/games/blockdrop';
import { encodeInvite, parseInvite, rowFromDb } from '../src/lib/games/types';

const play = (cells: number[]): TttState => cells.reduce<TttState>((s, c) => applyTttMove(s, c)!, initialTtt());

describe('tic-tac-toe', () => {
  it('alternates X and O, X first', () => {
    const s = play([4]);
    expect(s.board[4]).toBe('X');
    expect(tttNextMark(s)).toBe('O');
  });

  it('detects a win and blocks further moves', () => {
    const s = play([0, 3, 1, 4, 2]);
    expect(tttWinner(s)).toEqual({ mark: 'X', line: [0, 1, 2] });
    expect(applyTttMove(s, 8)).toBeNull();
  });

  it('detects a draw', () => {
    const s = play([0, 1, 2, 4, 3, 5, 7, 6, 8]);
    expect(tttWinner(s)).toBeNull();
    expect(tttIsDraw(s)).toBe(true);
  });

  it('rejects occupied or out-of-range cells and junk state', () => {
    expect(applyTttMove(play([0]), 0)).toBeNull();
    expect(applyTttMove(initialTtt(), 9)).toBeNull();
    expect(parseTtt({ board: ['X', 'bad'] })).toEqual(initialTtt());
  });
});

describe('chess', () => {
  it('plays a fool-proof scholar\'s mate', () => {
    let s: ChessState = initialChess();
    for (const [f, t] of [['e2', 'e4'], ['e7', 'e5'], ['f1', 'c4'], ['b8', 'c6'], ['d1', 'h5'], ['g8', 'f6'], ['h5', 'f7']]) {
      const next = applyChessMove(s, f, t);
      expect(next).not.toBeNull();
      s = next!;
    }
    expect(chessOutcome(s)).toEqual({ over: true, winner: 'w', reason: 'checkmate' });
    expect(s.lastMove).toEqual({ from: 'h5', to: 'f7' });
  });

  it('detects stalemate', () => {
    expect(chessOutcome({ fen: '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', lastMove: null, history: [] })).toEqual({
      over: true,
      winner: null,
      reason: 'stalemate',
    });
  });

  it('rejects illegal moves and lists targets', () => {
    expect(applyChessMove(initialChess(), 'e2', 'e5')).toBeNull();
    expect(chessTargetsFrom(initialChess(), 'g1').map((t) => t.to).sort()).toEqual(['f3', 'h3']);
    expect(chessTurn(initialChess())).toBe('w');
  });

  it('flags promotion targets and promotes', () => {
    const s: ChessState = { fen: '8/P7/8/8/8/8/8/k6K w - - 0 1', lastMove: null, history: [] };
    expect(chessTargetsFrom(s, 'a7')).toEqual([{ to: 'a8', promotion: true }]);
    const n = applyChessMove(s, 'a7', 'a8', 'n')!;
    expect(chessBoard(n)[0].piece).toEqual({ type: 'n', color: 'w' });
  });

  it('falls back to the start position on a bad FEN', () => {
    expect(parseChess({ fen: 'nonsense' }).fen).toBe(START_FEN);
  });
});

const emptyDama = (pieces: Record<number, DamaCell>, turn: 'w' | 'b' = 'w'): DamaState => {
  const board: DamaCell[] = Array<DamaCell>(64).fill('');
  for (const [k, v] of Object.entries(pieces)) board[Number(k)] = v;
  return { board, turn, lastMove: null, quiet: 0 };
};

describe('dama', () => {
  it('starts with 12 men a side and 7 opening moves for white', () => {
    const s = initialDama();
    expect(s.board.filter((c) => c === 'w')).toHaveLength(12);
    expect(s.board.filter((c) => c === 'b')).toHaveLength(12);
    expect(damaLegalMoves(s)).toHaveLength(7);
  });

  it('forces a capture when one exists', () => {
    const s = emptyDama({ [idx(5, 2)]: 'w', [idx(4, 3)]: 'b', [idx(6, 7)]: 'w' });
    const moves = damaLegalMoves(s);
    expect(moves).toHaveLength(1);
    expect(moves[0]).toEqual({ from: idx(5, 2), path: [idx(3, 4)], captures: [idx(4, 3)] });
  });

  it('lets men capture backwards and completes multi-jumps', () => {
    // White man at (3,2) jumps back over (4,3) to (5,4), then forward over (4,5) to (3,6).
    const s = emptyDama({ [idx(3, 2)]: 'w', [idx(4, 3)]: 'b', [idx(4, 5)]: 'b' });
    const moves = damaLegalMoves(s);
    expect(moves).toEqual([{ from: idx(3, 2), path: [idx(5, 4), idx(3, 6)], captures: [idx(4, 3), idx(4, 5)] }]);
    const after = applyDamaMove(s, idx(3, 2), idx(3, 6))!;
    expect(after.board.filter((c) => c === 'b')).toHaveLength(0);
    expect(damaOutcome(after)).toEqual({ over: true, winner: 'w' });
  });

  it('lets kings fly and capture at a distance', () => {
    const s = emptyDama({ [idx(7, 0)]: 'W', [idx(3, 4)]: 'b', [idx(0, 1)]: 'b' });
    const caps = damaLegalMoves(s);
    expect(caps.map((m) => m.path[m.path.length - 1]).sort((a, b) => a - b)).toEqual([idx(1, 6), idx(2, 5), idx(0, 7)].sort((a, b) => a - b));
    expect(caps.every((m) => m.captures[0] === idx(3, 4))).toBe(true);
  });

  it('promotes a man on the far row', () => {
    const s = emptyDama({ [idx(1, 2)]: 'w', [idx(7, 0)]: 'b' });
    const after = applyDamaMove(s, idx(1, 2), idx(0, 1))!;
    expect(after.board[idx(0, 1)]).toBe('W');
    expect(after.turn).toBe('b');
  });

  it('declares a draw after long quiet king play and parses junk safely', () => {
    expect(damaOutcome({ ...emptyDama({ [idx(7, 0)]: 'W', [idx(0, 7)]: 'B' }), quiet: DAMA_DRAW_PLIES })).toEqual({
      over: true,
      winner: null,
    });
    expect(parseDama({ board: [1, 2] })).toEqual(initialDama());
  });
});

describe('block drop', () => {
  it('rotates pieces four times back to the start', () => {
    expect(pieceCells('T', 4)).toEqual(pieceCells('T', 0));
    expect(pieceCells('T', 1)).not.toEqual(pieceCells('T', 0));
  });

  it('deals the same seeded sequence and every piece once per bag', () => {
    const a = new BlockDrop(42);
    const b = new BlockDrop(42);
    expect(a.active?.kind).toBe(b.active?.kind);
    expect(a.queue).toEqual(b.queue);
    const seen = new Set([a.active!.kind, ...a.queue]);
    expect(seen.size).toBe(4);
  });

  it('clears a full line and sends no garbage for a single', () => {
    const g = new BlockDrop(1);
    for (let x = 0; x < COLS; x++) g.grid[(ROWS - 1) * COLS + x] = x === 0 ? 0 : 3;
    g.active = { kind: 'I', rot: 1, x: -2, y: ROWS - 4 };
    const ev = g.hardDrop()!;
    expect(ev.cleared).toBe(1);
    expect(ev.sent).toBe(0);
    expect(g.lines).toBe(1);
  });

  it('sends four garbage lines for a four-line clear', () => {
    const g = new BlockDrop(1);
    for (let y = ROWS - 4; y < ROWS; y++) for (let x = 1; x < COLS; x++) g.grid[y * COLS + x] = 3;
    g.active = { kind: 'I', rot: 1, x: -2, y: 0 };
    const ev = g.hardDrop()!;
    expect(ev).toEqual({ cleared: 4, rows: [16, 17, 18, 19], sent: 4, over: false });
  });

  it('raises received garbage after the next lock', () => {
    const g = new BlockDrop(3);
    g.receiveGarbage(2);
    g.hardDrop();
    const bottom = g.grid.slice((ROWS - 1) * COLS);
    expect(bottom.filter((v) => v === GARBAGE)).toHaveLength(COLS - 1);
  });

  it('tops out when blocks reach the spawn area', () => {
    const g = new BlockDrop(5);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (x !== 0 || y < 2) g.grid[y * COLS + x] = 3;
    g.active = { kind: 'O', rot: 0, x: 4, y: -2 };
    const ev = g.hardDrop()!;
    expect(ev.over).toBe(true);
    expect(g.over).toBe(true);
  });

  it('round-trips snapshots and rejects junk', () => {
    const g = new BlockDrop(9);
    const snap = g.snapshot();
    expect(parseSnapshot(snap)).toHaveLength(COLS * ROWS);
    expect(parseSnapshot('12')).toBeNull();
    expect(parseBlockDrop({ seed: 7, scores: { u: { score: 10, lines: 1, over: true } } })).toEqual({
      seed: 7,
      scores: { u: { score: 10, lines: 1, over: true } },
    });
  });
});

describe('chat game rows and invites', () => {
  it('round-trips invite messages', () => {
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
    expect(parseInvite(encodeInvite(id, 'chess'))).toEqual({ gameId: id, kind: 'chess' });
    expect(parseInvite('[[game:nope:chess]]')).toBeNull();
    expect(parseInvite(`[[game:${id}:poker]]`)).toBeNull();
    expect(parseInvite('hello')).toBeNull();
  });

  it('maps database rows and rejects malformed ones', () => {
    const row = rowFromDb({
      id: 'g1',
      conversation_type: 'dm',
      conversation_id: 'c1',
      game: 'dama',
      status: 'active',
      player_one: 'a',
      player_two: 'b',
      current_turn: 'a',
      state: {},
      version: 3,
      winner: null,
      result: null,
    });
    expect(row?.version).toBe(3);
    expect(row?.playerTwo).toBe('b');
    expect(rowFromDb({ id: 'g1', game: 'poker' })).toBeNull();
  });
});

describe('chat preview text', () => {
  it('turns invite markers into a sentence and leaves normal text alone', async () => {
    const { messagePreview } = await import('../src/lib/games/types');
    expect(messagePreview(encodeInvite('0f8fad5b-d9cb-469f-a165-70867728950e', 'dama'))).toBe('Started a game of Dama');
    expect(messagePreview('u on?')).toBe('u on?');
  });
});
