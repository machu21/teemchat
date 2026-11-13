// Block Drop: a falling-block line-clear puzzle on a 10 x 20 grid, played as
// live versus. Pure logic (no DOM); the component drives it from its RAF loop.
// Rules: 7-bag randomizer, hold slot, wall kicks, lock delay, T-spins,
// back-to-back and combo bonuses.

export const COLS = 10;
export const ROWS = 20;
export const GARBAGE = 8;

export type PieceKind = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
export const PIECES: PieceKind[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

/** Cells of each piece in spawn rotation, inside a size x size box. */
const BASE: Record<PieceKind, { size: number; cells: [number, number][] }> = {
  I: { size: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
  O: { size: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  T: { size: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
  S: { size: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  Z: { size: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
  J: { size: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  L: { size: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
};

/** Every piece in every rotation, built once so the frame loop allocates nothing. */
const CELLS = {} as Record<PieceKind, [number, number][][]>;
for (const kind of PIECES) {
  const { size, cells } = BASE[kind];
  const rots: [number, number][][] = [cells];
  for (let r = 1; r < 4; r++) rots.push(rots[r - 1].map(([x, y]) => [size - 1 - y, x]));
  CELLS[kind] = rots;
}

/** Cells of `kind` at rotation `rot` (0-3, clockwise). */
export function pieceCells(kind: PieceKind, rot: number): [number, number][] {
  return CELLS[kind][((rot % 4) + 4) % 4];
}

/** Cell value for a piece kind (1-7); 0 is empty, 8 is garbage. */
export const kindValue = (k: PieceKind) => PIECES.indexOf(k) + 1;

/** Deterministic PRNG so tests (and replays) are repeatable. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** True when piece `p` fits on `grid` (cells above the top count as free). */
export function fitsGrid(grid: number[], p: { kind: PieceKind; rot: number; x: number; y: number }): boolean {
  const cells = pieceCells(p.kind, p.rot);
  for (let i = 0; i < cells.length; i++) {
    const x = p.x + cells[i][0];
    const y = p.y + cells[i][1];
    if (x < 0 || x >= COLS || y >= ROWS) return false;
    if (y >= 0 && grid[y * COLS + x] !== 0) return false;
  }
  return true;
}

/** Spawn position for a piece kind. */
export function spawnOf(kind: PieceKind): { kind: PieceKind; rot: number; x: number; y: number } {
  const size = kind === 'I' ? 4 : kind === 'O' ? 2 : 3;
  return { kind, rot: 0, x: Math.floor((COLS - size) / 2), y: kind === 'I' ? -1 : 0 };
}

export interface ActivePiece {
  kind: PieceKind;
  rot: number;
  x: number;
  y: number;
}

/** Pieces shown in the next queue. */
export const QUEUE_SIZE = 5;
/** How long a piece may rest on the stack before it locks. */
export const LOCK_DELAY_MS = 500;
/** Moves or rotations that may restart the lock delay before a piece reaches a new low row. */
export const MAX_LOCK_RESETS = 15;
/** Soft drop falls this many times faster than gravity. */
export const SOFT_DROP_FACTOR = 20;

type Kick = [number, number];

// Wall-kick offsets of the standard rotation system, keyed by "<from><to>" rotation
// state (0 spawn, 1 right, 2 reverse, 3 left). Written with +y pointing up, the way
// the tables are usually published; kicksFor() flips y for this grid.
const KICKS_JLSTZ: Record<string, Kick[]> = {
  '01': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '10': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '12': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '21': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '23': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '32': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '30': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '03': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};

const KICKS_I: Record<string, Kick[]> = {
  '01': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '10': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '12': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '21': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '23': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '32': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '30': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '03': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};

/** Wall kicks to try, in order, when rotating `kind` from `from` to `to` (dx, dy with +y down). */
export function kicksFor(kind: PieceKind, from: number, to: number): Kick[] {
  if (kind === 'O') return [[0, 0]];
  const table = kind === 'I' ? KICKS_I : KICKS_JLSTZ;
  return (table[`${from}${to}`] ?? [[0, 0]]).map(([dx, dy]): Kick => [dx, dy === 0 ? 0 : -dy]);
}

export type Spin = 'none' | 'mini' | 'full';

/** Corners of the T's 3 x 3 box: top-left, top-right, bottom-left, bottom-right. */
const T_CORNERS: Kick[] = [[0, 0], [2, 0], [0, 2], [2, 2]];
/** Indexes into T_CORNERS of the two corners beside the T's point, per rotation. */
const T_FRONT: [number, number][] = [[0, 1], [1, 3], [2, 3], [0, 2]];

/**
 * Three-corner rule for a T piece whose last move was a rotation. Walls and the floor
 * count as filled. Both corners beside the point filled is a full spin; only one is a
 * mini, unless the rotation used the last (long) wall kick.
 */
export function tSpinType(grid: number[], p: ActivePiece, lastKick: number): Spin {
  if (p.kind !== 'T') return 'none';
  const filled = T_CORNERS.map(([cx, cy]) => {
    const x = p.x + cx;
    const y = p.y + cy;
    if (x < 0 || x >= COLS || y >= ROWS) return true;
    return y >= 0 && grid[y * COLS + x] !== 0;
  });
  if (filled.filter(Boolean).length < 3) return 'none';
  const [f1, f2] = T_FRONT[((p.rot % 4) + 4) % 4];
  return (filled[f1] && filled[f2]) || lastKick === 4 ? 'full' : 'mini';
}

export interface LockEvent {
  cleared: number;
  /** Row indexes (before collapsing) that were cleared, for a flash effect. */
  rows?: number[];
  /** Garbage lines to send to the opponent. */
  sent: number;
  over: boolean;
  /** T-spin made by this lock. */
  spin: Spin;
  /** True when this clear got the back-to-back bonus. */
  b2b: boolean;
  /** Line-clearing locks in a row before this one (0 for a first clear, -1 for no clear). */
  combo: number;
}

const LINE_SCORE = [0, 100, 300, 500, 800];
const MINI_SCORE = [100, 200, 400];
const SPIN_SCORE = [400, 800, 1200, 1600];
const GARBAGE_FOR = [0, 0, 1, 2, 4];
const MINI_GARBAGE = [0, 0, 1];
const SPIN_GARBAGE = [0, 2, 4, 6];
const COMBO_GARBAGE = [0, 0, 1, 1, 2, 2, 3, 3, 4];

/** Short name of a lock for on-screen feedback; null when nothing notable happened. */
export function lockLabel(ev: Pick<LockEvent, 'cleared' | 'spin' | 'b2b' | 'combo'>): string | null {
  const count = ['', 'Single', 'Double', 'Triple', 'Quad'][ev.cleared] ?? '';
  let text = '';
  if (ev.spin !== 'none') text = `${ev.spin === 'mini' ? 'Mini ' : ''}T-Spin${count ? ` ${count}` : ''}`;
  else if (ev.cleared >= 2) text = count;
  if (text && ev.b2b) text = `Back-to-back ${text}`;
  if (ev.combo >= 1) text = text ? `${text} · Combo ${ev.combo}` : `Combo ${ev.combo}`;
  return text || null;
}

export class BlockDrop {
  grid: number[] = Array(COLS * ROWS).fill(0);
  active: ActivePiece | null = null;
  queue: PieceKind[] = [];
  /** The stored piece, if any. */
  held: PieceKind | null = null;
  /** False once the current piece has been through the hold slot. */
  canHold = true;
  score = 0;
  lines = 0;
  over = false;
  pendingGarbage = 0;
  /** Increments every time a new piece spawns. */
  pieceId = 0;
  /** Line-clearing locks in a row, -1 when the last lock cleared nothing. */
  combo = -1;
  /** True when the last line clear was a quad or a T-spin. */
  backToBack = false;
  private bag: PieceKind[] = [];
  private rng: () => number;
  private fallMs = 0;
  private lockMs = 0;
  private lockResets = 0;
  private lowestY = -99;
  private lastWasRotate = false;
  private lastKick = 0;

  constructor(seed: number) {
    this.rng = mulberry32(seed);
    while (this.queue.length < QUEUE_SIZE) this.queue.push(this.draw());
    this.spawn();
  }

  get level() {
    return 1 + Math.floor(this.lines / 10);
  }

  /** Milliseconds per gravity step. */
  get gravityMs() {
    const l = Math.min(this.level, 15) - 1;
    return 1000 * Math.pow(0.8 - l * 0.007, l);
  }

  /** 0-1: how far the resting piece is through its lock delay. */
  get lockProgress() {
    return Math.min(1, this.lockMs / LOCK_DELAY_MS);
  }

  private draw(): PieceKind {
    if (this.bag.length === 0) {
      this.bag = PIECES.slice();
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
    }
    return this.bag.pop()!;
  }

  fits(p: ActivePiece): boolean {
    return fitsGrid(this.grid, p);
  }

  /** Spawns `kind`, or the next piece in the queue. */
  private spawn(kind?: PieceKind) {
    if (!kind) {
      kind = this.queue.shift()!;
      this.queue.push(this.draw());
    }
    const piece: ActivePiece = spawnOf(kind);
    this.fallMs = 0;
    this.lockMs = 0;
    this.lockResets = 0;
    this.lastWasRotate = false;
    this.lastKick = 0;
    this.canHold = true;
    this.pieceId++;
    // A crowded spawn row gets one row of grace before the game ends.
    if (!this.fits(piece)) piece.y -= 1;
    if (!this.fits(piece)) {
      this.active = null;
      this.over = true;
      return;
    }
    this.active = piece;
    this.lowestY = piece.y;
  }

  private canFall(): boolean {
    return this.active !== null && this.fits({ ...this.active, y: this.active.y + 1 });
  }

  /** A successful move or rotation restarts the lock delay, a limited number of times. */
  private touched() {
    if (this.lockMs === 0 && this.canFall()) return;
    if (this.lockResets >= MAX_LOCK_RESETS) return;
    this.lockResets++;
    this.lockMs = 0;
  }

  private stepDown(soft: boolean) {
    const a = this.active!;
    this.active = { ...a, y: a.y + 1 };
    this.lastWasRotate = false;
    if (soft) this.score += 1;
    if (this.active.y > this.lowestY) {
      this.lowestY = this.active.y;
      this.lockResets = 0;
      this.lockMs = 0;
    }
  }

  move(dx: number): boolean {
    if (!this.active || this.over) return false;
    const next = { ...this.active, x: this.active.x + dx };
    if (!this.fits(next)) return false;
    this.active = next;
    this.lastWasRotate = false;
    this.touched();
    return true;
  }

  /** Rotates clockwise (1) or counter-clockwise (-1), trying the wall kicks in order. */
  rotate(dir: 1 | -1 = 1): boolean {
    if (!this.active || this.over || this.active.kind === 'O') return false;
    const from = this.active.rot;
    const rot = (from + dir + 4) % 4;
    const kicks = kicksFor(this.active.kind, from, rot);
    for (let i = 0; i < kicks.length; i++) {
      const next = { ...this.active, rot, x: this.active.x + kicks[i][0], y: this.active.y + kicks[i][1] };
      if (!this.fits(next)) continue;
      this.active = next;
      this.lastWasRotate = true;
      this.lastKick = i;
      this.touched();
      return true;
    }
    return false;
  }

  /** Stores the active piece and brings out the stored one (or the next). Once per piece. */
  hold(): boolean {
    if (!this.active || this.over || !this.canHold) return false;
    const stored = this.held;
    this.held = this.active.kind;
    this.spawn(stored ?? undefined);
    this.canHold = false;
    return true;
  }

  /** Row the active piece would land on. */
  ghostY(): number {
    if (!this.active) return 0;
    let y = this.active.y;
    while (this.fits({ ...this.active, y: y + 1 })) y++;
    return y;
  }

  /** One row down by hand (1 point). Never locks; false when the piece is resting. */
  softDrop(): boolean {
    if (!this.active || this.over || !this.canFall()) return false;
    this.stepDown(true);
    this.fallMs = 0;
    return true;
  }

  hardDrop(): LockEvent | null {
    if (!this.active || this.over) return null;
    const y = this.ghostY();
    if (y !== this.active.y) {
      this.score += 2 * (y - this.active.y);
      this.active = { ...this.active, y };
      this.lastWasRotate = false;
    }
    return this.lock();
  }

  /**
   * Advances gravity and the lock delay by `dt` ms; `soft` is true while soft drop is
   * held. Returns a lock event when the piece locked.
   */
  tick(dt: number, soft = false): LockEvent | null {
    if (!this.active || this.over) return null;
    if (this.canFall()) {
      const step = soft ? this.gravityMs / SOFT_DROP_FACTOR : this.gravityMs;
      this.fallMs += dt;
      while (this.fallMs >= step && this.canFall()) {
        this.fallMs -= step;
        this.stepDown(soft);
      }
      if (!this.canFall()) this.fallMs = 0;
      return null;
    }
    this.fallMs = 0;
    this.lockMs += dt;
    return this.lockMs >= LOCK_DELAY_MS ? this.lock() : null;
  }

  /** Queues garbage lines from the opponent; they rise after the next lock. */
  receiveGarbage(lines: number) {
    if (Number.isInteger(lines) && lines > 0) this.pendingGarbage = Math.min(20, this.pendingGarbage + lines);
  }

  private lock(): LockEvent {
    const p = this.active!;
    const spin: Spin = this.lastWasRotate ? tSpinType(this.grid, p, this.lastKick) : 'none';
    let toppedOut = false;
    for (const [cx, cy] of pieceCells(p.kind, p.rot)) {
      const y = p.y + cy;
      if (y < 0) {
        toppedOut = true;
        continue;
      }
      this.grid[y * COLS + p.x + cx] = kindValue(p.kind);
    }
    this.active = null;

    let cleared = 0;
    const rows: number[] = [];
    for (let y = 0; y < ROWS; y++) {
      if (this.grid.slice(y * COLS, y * COLS + COLS).every((v) => v !== 0)) rows.push(y);
    }
    for (let y = ROWS - 1; y >= 0; y--) {
      const row = this.grid.slice(y * COLS, y * COLS + COLS);
      if (row.every((v) => v !== 0)) {
        this.grid.splice(y * COLS, COLS);
        this.grid.unshift(...Array(COLS).fill(0));
        cleared++;
        y++; // re-check the row that moved down into this slot
      }
    }

    const level = this.level;
    const difficult = cleared > 0 && (cleared === 4 || spin !== 'none');
    const b2b = difficult && this.backToBack;
    const base =
      spin === 'full' ? SPIN_SCORE[cleared] ?? 0 : spin === 'mini' ? MINI_SCORE[cleared] ?? 0 : LINE_SCORE[cleared];
    this.score += Math.floor(base * (b2b ? 1.5 : 1)) * level;
    this.lines += cleared;

    let sent = 0;
    if (cleared > 0) {
      this.combo++;
      this.backToBack = difficult;
      this.score += 50 * this.combo * level;
      const lineGarbage =
        spin === 'full' ? SPIN_GARBAGE[cleared] ?? 0 : spin === 'mini' ? MINI_GARBAGE[cleared] ?? 0 : GARBAGE_FOR[cleared];
      sent = lineGarbage + (b2b ? 1 : 0) + COMBO_GARBAGE[Math.min(this.combo, COMBO_GARBAGE.length - 1)];
    } else {
      this.combo = -1;
    }
    const combo = this.combo;

    // Clearing lines cancels incoming garbage first.
    const cancel = Math.min(sent, this.pendingGarbage);
    this.pendingGarbage -= cancel;
    sent -= cancel;
    if (this.pendingGarbage > 0) {
      toppedOut = this.raiseGarbage(this.pendingGarbage) || toppedOut;
      this.pendingGarbage = 0;
    }

    if (toppedOut) this.over = true;
    else this.spawn();
    return { cleared, rows, sent, over: this.over, spin, b2b, combo };
  }

  /** Pushes `n` garbage rows (one hole each) up from the bottom. True when blocks spill off the top. */
  private raiseGarbage(n: number): boolean {
    const spill = this.grid.slice(0, n * COLS).some((v) => v !== 0);
    this.grid.splice(0, n * COLS);
    for (let i = 0; i < n; i++) {
      const hole = Math.floor(this.rng() * COLS);
      const row = Array(COLS).fill(GARBAGE);
      row[hole] = 0;
      this.grid.push(...row);
    }
    return spill;
  }

  /** The grid with the active piece drawn in, as 200 digits (for the opponent's mini board). */
  snapshot(): string {
    const g = this.grid.slice();
    if (this.active) {
      for (const [cx, cy] of pieceCells(this.active.kind, this.active.rot)) {
        const y = this.active.y + cy;
        if (y >= 0) g[y * COLS + this.active.x + cx] = kindValue(this.active.kind);
      }
    }
    return g.join('');
  }
}

/** Parses an opponent snapshot; null when malformed. */
export function parseSnapshot(raw: unknown): number[] | null {
  if (typeof raw !== 'string' || raw.length !== COLS * ROWS || !/^[0-8]+$/.test(raw)) return null;
  return Array.from(raw, Number);
}

/** Persisted Block Drop state: final scores per player. */
export interface BlockDropState {
  seed: number;
  scores: Record<string, { score: number; lines: number; over: boolean }>;
}

export function parseBlockDrop(raw: unknown): BlockDropState {
  const r = (raw ?? {}) as { seed?: unknown; scores?: unknown };
  const scores: BlockDropState['scores'] = {};
  if (r.scores && typeof r.scores === 'object') {
    for (const [k, v] of Object.entries(r.scores as Record<string, unknown>).slice(0, 4)) {
      const s = v as { score?: unknown; lines?: unknown; over?: unknown };
      scores[k] = {
        score: Number.isFinite(s?.score) ? Number(s.score) : 0,
        lines: Number.isFinite(s?.lines) ? Number(s.lines) : 0,
        over: s?.over === true,
      };
    }
  }
  return { seed: Number.isInteger(r.seed) ? (r.seed as number) : 1, scores };
}
