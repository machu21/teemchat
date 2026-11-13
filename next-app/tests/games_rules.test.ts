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
import {
  BlockDrop,
  COLS,
  GARBAGE,
  LOCK_DELAY_MS,
  MAX_LOCK_RESETS,
  QUEUE_SIZE,
  ROWS,
  kicksFor,
  lockLabel,
  parseBlockDrop,
  parseSnapshot,
  pieceCells,
  tSpinType,
} from '../src/lib/games/blockdrop';
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
    expect(a.queue).toHaveLength(QUEUE_SIZE);
    const seen = new Set([a.active!.kind, ...a.queue]);
    expect(seen.size).toBe(QUEUE_SIZE + 1);
    // The first seven pieces are one full bag.
    const g = new BlockDrop(11);
    const firstBag = [g.active!.kind];
    for (let i = 0; i < 6; i++) {
      g.hardDrop();
      firstBag.push(g.active!.kind);
    }
    expect(new Set(firstBag).size).toBe(7);
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
    expect(ev).toEqual({ cleared: 4, rows: [16, 17, 18, 19], sent: 4, over: false, spin: 'none', b2b: false, combo: 0 });
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

  it('holds one piece and swaps it back, once per drop', () => {
    const g = new BlockDrop(21);
    const first = g.active!.kind;
    const second = g.queue[0];
    const third = g.queue[1];
    expect(g.held).toBeNull();

    expect(g.hold()).toBe(true);
    expect(g.held).toBe(first);
    expect(g.active!.kind).toBe(second);
    // Only one hold until this piece locks.
    expect(g.canHold).toBe(false);
    expect(g.hold()).toBe(false);
    expect(g.held).toBe(first);

    g.hardDrop();
    expect(g.active!.kind).toBe(third);
    expect(g.canHold).toBe(true);
    const queueBefore = g.queue.slice();
    expect(g.hold()).toBe(true);
    // The stored piece comes back at its spawn position; the queue is not used.
    expect(g.active).toMatchObject({ kind: first, rot: 0 });
    expect(g.held).toBe(third);
    expect(g.queue).toEqual(queueBefore);
  });

  it('counts a hold as a new piece for the lock delay and the piece id', () => {
    const g = new BlockDrop(4);
    const id = g.pieceId;
    g.tick(100_000, true);
    const y = g.active!.y;
    g.hold();
    expect(g.pieceId).toBe(id + 1);
    expect(g.active!.y).toBeLessThan(y);
    expect(g.lockProgress).toBe(0);
  });

  it('kicks a rotation off the wall and the floor', () => {
    // Upright T hard against the left wall: the plain rotation is out of bounds.
    const g = new BlockDrop(1);
    g.active = { kind: 'T', rot: 1, x: -1, y: 5 };
    expect(g.fits(g.active)).toBe(true);
    expect(g.rotate(1)).toBe(true);
    expect(g.active).toEqual({ kind: 'T', rot: 2, x: 0, y: 5 });

    // Upright I against the left wall uses the long-bar table (two columns over).
    g.active = { kind: 'I', rot: 1, x: -2, y: 5 };
    expect(g.rotate(1)).toBe(true);
    expect(g.active).toEqual({ kind: 'I', rot: 2, x: 0, y: 5 });

    // Flat I resting on the floor stands up by kicking upward.
    g.active = { kind: 'I', rot: 0, x: 3, y: ROWS - 2 };
    expect(g.rotate(1)).toBe(true);
    expect(g.active!.rot).toBe(1);
    expect(g.fits(g.active!)).toBe(true);

    // The square never rotates.
    g.active = { kind: 'O', rot: 0, x: 4, y: 5 };
    expect(g.rotate(1)).toBe(false);
  });

  it('lists five kicks per rotation, starting with no offset', () => {
    for (const kind of ['T', 'I', 'J', 'L', 'S', 'Z'] as const) {
      for (let from = 0; from < 4; from++) {
        for (const to of [(from + 1) % 4, (from + 3) % 4]) {
          const kicks = kicksFor(kind, from, to);
          expect(kicks).toHaveLength(5);
          expect(kicks[0]).toEqual([0, 0]);
          // Rotating back undoes each kick.
          const back = kicksFor(kind, to, from);
          expect(back.map(([x, y]) => [0 - x, 0 - y])).toEqual(kicks);
        }
      }
    }
    expect(kicksFor('O', 0, 1)).toEqual([[0, 0]]);
  });

  /** A T-spin double slot: rows 18-19 full except a T-shaped notch under an overhang. */
  const tSlot = () => {
    const g = new BlockDrop(1);
    for (let x = 0; x < COLS; x++) {
      if (x < 1 || x > 3) g.grid[18 * COLS + x] = 3;
      if (x !== 2) g.grid[19 * COLS + x] = 3;
    }
    g.grid[17 * COLS + 3] = 3; // the overhang
    return g;
  };

  it('scores a T-spin double when the T is rotated into the slot', () => {
    const g = tSlot();
    g.active = { kind: 'T', rot: 3, x: 1, y: 17 };
    expect(g.fits(g.active)).toBe(true);
    expect(g.rotate(-1)).toBe(true);
    expect(g.active).toEqual({ kind: 'T', rot: 2, x: 1, y: 17 });
    const ev = g.hardDrop()!;
    expect(ev).toMatchObject({ cleared: 2, spin: 'full', sent: 4, b2b: false, combo: 0 });
    expect(g.score).toBe(1200);
    expect(lockLabel(ev)).toBe('T-Spin Double');
    expect(g.backToBack).toBe(true);
  });

  it('does not count a T-spin when the last move was not a rotation', () => {
    // Same resting place, but placed without rotating.
    const placed = tSlot();
    placed.active = { kind: 'T', rot: 2, x: 1, y: 17 };
    expect(placed.hardDrop()).toMatchObject({ cleared: 2, spin: 'none', sent: 1 });
    expect(placed.score).toBe(300);

    // Rotated, then nudged sideways: the rotation is no longer the last move.
    const moved = new BlockDrop(1);
    moved.grid[19 * COLS + 0] = 3;
    moved.grid[19 * COLS + 2] = 3;
    moved.grid[17 * COLS + 0] = 3;
    moved.active = { kind: 'T', rot: 1, x: 0, y: 17 };
    moved.rotate(-1);
    expect(moved.move(1)).toBe(true);
    expect(moved.hardDrop()!.spin).toBe('none');
  });

  it('detects a mini T-spin with only one front corner filled', () => {
    const g = new BlockDrop(1);
    g.grid[17 * COLS + 0] = 3; // front-left corner
    g.grid[19 * COLS + 0] = 3; // both back corners
    g.grid[19 * COLS + 2] = 3;
    g.active = { kind: 'T', rot: 1, x: 0, y: 17 };
    expect(g.rotate(-1)).toBe(true);
    expect(g.active).toEqual({ kind: 'T', rot: 0, x: 0, y: 17 });
    const ev = g.hardDrop()!;
    expect(ev).toMatchObject({ cleared: 0, spin: 'mini', sent: 0 });
    expect(g.score).toBe(100);
    expect(lockLabel(ev)).toBe('Mini T-Spin');
  });

  it('applies the three-corner rule, with walls and floor as corners', () => {
    const grid = Array(COLS * ROWS).fill(0);
    // Open field: no corners.
    expect(tSpinType(grid, { kind: 'T', rot: 0, x: 4, y: 5 }, 0)).toBe('none');
    // On the floor in the open: only the two floor corners.
    expect(tSpinType(grid, { kind: 'T', rot: 2, x: 4, y: ROWS - 2 }, 0)).toBe('none');
    // Pointing down with one top corner filled: the floor fills both front corners.
    grid[(ROWS - 2) * COLS + 4] = 3;
    expect(tSpinType(grid, { kind: 'T', rot: 2, x: 4, y: ROWS - 2 }, 0)).toBe('full');
    // Pointing up there, the fronts are the top corners, so one filled is a mini...
    expect(tSpinType(grid, { kind: 'T', rot: 0, x: 4, y: ROWS - 2 }, 0)).toBe('mini');
    // ...unless the rotation used the last, long kick.
    expect(tSpinType(grid, { kind: 'T', rot: 0, x: 4, y: ROWS - 2 }, 4)).toBe('full');
    // Other pieces never spin.
    expect(tSpinType(grid, { kind: 'L', rot: 2, x: 4, y: ROWS - 2 }, 0)).toBe('none');
  });

  it('rewards back-to-back quads and combos', () => {
    const g = new BlockDrop(1);
    const quad = () => {
      for (let y = ROWS - 4; y < ROWS; y++) for (let x = 1; x < COLS; x++) g.grid[y * COLS + x] = 3;
      g.active = { kind: 'I', rot: 1, x: -2, y: 0 };
      return g.hardDrop()!;
    };
    const first = quad();
    expect(first).toMatchObject({ cleared: 4, b2b: false, combo: 0, sent: 4 });
    const second = quad();
    // Back-to-back adds a line; the second clear in a row is a combo.
    expect(second).toMatchObject({ cleared: 4, b2b: true, combo: 1, sent: 5 });
    expect(lockLabel(second)).toBe('Back-to-back Quad · Combo 1');

    // A lock that clears nothing ends the combo but keeps back-to-back alive.
    g.active = { kind: 'O', rot: 0, x: 0, y: 0 };
    expect(g.hardDrop()).toMatchObject({ cleared: 0, combo: -1 });
    expect(g.backToBack).toBe(true);
    g.grid.fill(0);
    expect(quad()).toMatchObject({ b2b: true, combo: 0 });
    expect(lockLabel({ cleared: 1, spin: 'none', b2b: false, combo: 0 })).toBeNull();
  });

  it('waits out the lock delay, and lets moves reset it only so many times', () => {
    const g = new BlockDrop(8);
    const id = g.pieceId;
    // Soft drop to the floor: the piece rests but does not lock.
    for (let i = 0; i < ROWS + 2; i++) g.softDrop();
    expect(g.softDrop()).toBe(false);
    expect(g.tick(LOCK_DELAY_MS - 10)).toBeNull();
    expect(g.pieceId).toBe(id);
    // A move restarts the delay.
    expect(g.move(-1)).toBe(true);
    expect(g.lockProgress).toBe(0);
    expect(g.tick(LOCK_DELAY_MS - 10)).toBeNull();
    // Left alone, it locks.
    expect(g.tick(20)).not.toBeNull();
    expect(g.pieceId).toBe(id + 1);

    // Wiggling forever does not stall: the resets run out.
    const stall = new BlockDrop(8);
    for (let i = 0; i < ROWS + 2; i++) stall.softDrop();
    let locked = false;
    for (let i = 0; i < MAX_LOCK_RESETS * 4 && !locked; i++) {
      stall.move(i % 2 ? 1 : -1);
      locked = stall.tick(LOCK_DELAY_MS - 10) !== null;
    }
    expect(locked).toBe(true);
  });

  it('falls by delta time, and faster while soft drop is held', () => {
    const g = new BlockDrop(2);
    const y = g.active!.y;
    const step = g.gravityMs;
    g.tick(step / 2);
    expect(g.active!.y).toBe(y);
    g.tick(step / 2);
    expect(g.active!.y).toBe(y + 1);
    // One long frame carries several rows, not just one.
    g.tick(step * 3);
    expect(g.active!.y).toBe(y + 4);
    const before = g.score;
    g.tick(step / 4, true);
    expect(g.active!.y).toBe(y + 9);
    expect(g.score).toBe(before + 5);
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
