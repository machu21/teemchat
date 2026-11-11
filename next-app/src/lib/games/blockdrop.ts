// Block Drop: a falling-block line-clear puzzle on a 10 x 20 grid, played as
// live versus. Pure logic (no DOM); the component drives it from its RAF loop.

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

/** Cells of `kind` at rotation `rot` (0-3, clockwise). */
export function pieceCells(kind: PieceKind, rot: number): [number, number][] {
  const { size, cells } = BASE[kind];
  let out = cells;
  for (let i = 0; i < ((rot % 4) + 4) % 4; i++) out = out.map(([x, y]) => [size - 1 - y, x]);
  return out;
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

export interface ActivePiece {
  kind: PieceKind;
  rot: number;
  x: number;
  y: number;
}

export interface LockEvent {
  cleared: number;
  /** Garbage lines to send to the opponent. */
  sent: number;
  over: boolean;
}

const LINE_SCORE = [0, 100, 300, 500, 800];
const GARBAGE_FOR = [0, 0, 1, 2, 4];

export class BlockDrop {
  grid: number[] = Array(COLS * ROWS).fill(0);
  active: ActivePiece | null = null;
  queue: PieceKind[] = [];
  score = 0;
  lines = 0;
  over = false;
  pendingGarbage = 0;
  private bag: PieceKind[] = [];
  private rng: () => number;
  private fallMs = 0;

  constructor(seed: number) {
    this.rng = mulberry32(seed);
    while (this.queue.length < 3) this.queue.push(this.draw());
    this.spawn();
  }

  get level() {
    return 1 + Math.floor(this.lines / 10);
  }

  /** Milliseconds per gravity step. */
  get gravityMs() {
    return Math.max(90, 800 - (this.level - 1) * 70);
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
    return pieceCells(p.kind, p.rot).every(([cx, cy]) => {
      const x = p.x + cx;
      const y = p.y + cy;
      if (x < 0 || x >= COLS || y >= ROWS) return false;
      return y < 0 || this.grid[y * COLS + x] === 0;
    });
  }

  private spawn() {
    const kind = this.queue.shift()!;
    this.queue.push(this.draw());
    const size = kind === 'I' ? 4 : kind === 'O' ? 2 : 3;
    const piece: ActivePiece = { kind, rot: 0, x: Math.floor((COLS - size) / 2), y: kind === 'I' ? -1 : 0 };
    this.fallMs = 0;
    if (!this.fits(piece)) {
      this.active = null;
      this.over = true;
      return;
    }
    this.active = piece;
  }

  move(dx: number): boolean {
    if (!this.active || this.over) return false;
    const next = { ...this.active, x: this.active.x + dx };
    if (!this.fits(next)) return false;
    this.active = next;
    return true;
  }

  rotate(dir: 1 | -1 = 1): boolean {
    if (!this.active || this.over || this.active.kind === 'O') return false;
    const rot = (this.active.rot + dir + 4) % 4;
    for (const kick of [0, -1, 1, -2, 2]) {
      for (const up of [0, -1]) {
        const next = { ...this.active, rot, x: this.active.x + kick, y: this.active.y + up };
        if (this.fits(next)) {
          this.active = next;
          return true;
        }
      }
    }
    return false;
  }

  /** Row the active piece would land on. */
  ghostY(): number {
    if (!this.active) return 0;
    let y = this.active.y;
    while (this.fits({ ...this.active, y: y + 1 })) y++;
    return y;
  }

  /** One step down; locks when blocked. Returns the lock event, if any. */
  softDrop(): LockEvent | null {
    if (!this.active || this.over) return null;
    const next = { ...this.active, y: this.active.y + 1 };
    if (this.fits(next)) {
      this.active = next;
      this.score += 1;
      this.fallMs = 0;
      return null;
    }
    return this.lock();
  }

  hardDrop(): LockEvent | null {
    if (!this.active || this.over) return null;
    const y = this.ghostY();
    this.score += 2 * (y - this.active.y);
    this.active = { ...this.active, y };
    return this.lock();
  }

  /** Advances gravity by `dt` ms. Returns a lock event when a piece locked. */
  tick(dt: number): LockEvent | null {
    if (!this.active || this.over) return null;
    this.fallMs += dt;
    if (this.fallMs < this.gravityMs) return null;
    this.fallMs = 0;
    const next = { ...this.active, y: this.active.y + 1 };
    if (this.fits(next)) {
      this.active = next;
      return null;
    }
    return this.lock();
  }

  /** Queues garbage lines from the opponent; they rise after the next lock. */
  receiveGarbage(lines: number) {
    if (Number.isInteger(lines) && lines > 0) this.pendingGarbage = Math.min(20, this.pendingGarbage + lines);
  }

  private lock(): LockEvent {
    const p = this.active!;
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
    for (let y = ROWS - 1; y >= 0; y--) {
      const row = this.grid.slice(y * COLS, y * COLS + COLS);
      if (row.every((v) => v !== 0)) {
        this.grid.splice(y * COLS, COLS);
        this.grid.unshift(...Array(COLS).fill(0));
        cleared++;
        y++; // re-check the row that moved down into this slot
      }
    }
    this.lines += cleared;
    this.score += LINE_SCORE[cleared] * this.level;

    // Clearing lines cancels incoming garbage first.
    let sent = GARBAGE_FOR[cleared];
    const cancel = Math.min(sent, this.pendingGarbage);
    this.pendingGarbage -= cancel;
    sent -= cancel;
    if (this.pendingGarbage > 0) {
      toppedOut = this.raiseGarbage(this.pendingGarbage) || toppedOut;
      this.pendingGarbage = 0;
    }

    if (toppedOut) this.over = true;
    else this.spawn();
    return { cleared, sent, over: this.over };
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
