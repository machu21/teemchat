'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import styles from './ChatGames.module.css';
import { AppIcon } from '@/components/icons/AppIcon';
import { BlockDrop, COLS, ROWS, kindValue, parseSnapshot, pieceCells, type LockEvent, type PieceKind } from '@/lib/games/blockdrop';
import { BlockDropCpu, type Difficulty } from '@/lib/games/bots';
import { analyzeBlockDropCoach, type BlockDropCoachReport, type CoachMode } from '@/lib/games/coach';
import type { GameLive } from '@/lib/services/chatGames';

/** Cell colours by value: 0 empty, 1-7 piece kinds (I O T S Z J L), 8 garbage. */
const CELL_COLORS = ['#18181b', '#22d3ee', '#facc15', '#c084fc', '#4ade80', '#f87171', '#60a5fa', '#fb923c', '#71717a'];
const CELL = 22;
const MINI = 8;
const COUNTDOWN = 3;

function drawCells(ctx: CanvasRenderingContext2D, cells: number[], cell: number, cols = COLS, rows = ROWS) {
  ctx.fillStyle = CELL_COLORS[0];
  ctx.fillRect(0, 0, cols * cell, rows * cell);
  // Faint grid so the well reads as a well.
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let x = 1; x < cols; x++) {
    ctx.beginPath();
    ctx.moveTo(x * cell + 0.5, 0);
    ctx.lineTo(x * cell + 0.5, rows * cell);
    ctx.stroke();
  }
  for (let i = 0; i < cells.length; i++) {
    const v = cells[i];
    if (!v) continue;
    const x = (i % cols) * cell;
    const y = Math.floor(i / cols) * cell;
    ctx.fillStyle = CELL_COLORS[v] ?? CELL_COLORS[8];
    ctx.fillRect(x, y, cell, cell);
    if (cell >= 10) {
      // Neo-brutalist block: dark outline + light bevel on the top-left.
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(x + 2, y + 2, cell - 4, Math.max(2, cell / 7));
    }
    ctx.strokeStyle = '#000';
    ctx.lineWidth = Math.max(1, cell / 9);
    ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
  }
}

function drawGame(
  ctx: CanvasRenderingContext2D,
  game: BlockDrop,
  flash: { rows: number[]; until: number } | null,
  now: number
) {
  drawCells(ctx, Array.from(game.snapshot(), Number), CELL);
  const a = game.active;
  if (a) {
    const gy = game.ghostY();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    for (const [cx, cy] of pieceCells(a.kind, a.rot)) {
      const y = gy + cy;
      if (y >= 0 && y !== a.y + cy) ctx.strokeRect((a.x + cx) * CELL + 3, y * CELL + 3, CELL - 6, CELL - 6);
    }
    ctx.setLineDash([]);
  }
  if (flash && now < flash.until) {
    ctx.fillStyle = `rgba(255,255,255,${(0.75 * (flash.until - now)) / 220})`;
    for (const r of flash.rows) ctx.fillRect(0, r * CELL, COLS * CELL, CELL);
  }
}

function drawNext(ctx: CanvasRenderingContext2D, kind: PieceKind | undefined) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.fillStyle = CELL_COLORS[0];
  ctx.fillRect(0, 0, w, h);
  if (!kind) return;
  const cells = pieceCells(kind, 0);
  const minX = Math.min(...cells.map((c) => c[0]));
  const maxX = Math.max(...cells.map((c) => c[0]));
  const minY = Math.min(...cells.map((c) => c[1]));
  const maxY = Math.max(...cells.map((c) => c[1]));
  const size = 16;
  const ox = (w - (maxX - minX + 1) * size) / 2;
  const oy = (h - (maxY - minY + 1) * size) / 2;
  for (const [cx, cy] of cells) {
    const x = ox + (cx - minX) * size;
    const y = oy + (cy - minY) * size;
    ctx.fillStyle = CELL_COLORS[kindValue(kind)];
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
  }
}

export interface BlockDropEvents {
  onBoard?: (userId: string, snapshot: string, score: number, lines: number) => void;
  onGarbage?: (toUserId: string, count: number) => void;
}

export type BlockDropOpponent =
  | { kind: 'cpu'; difficulty: Difficulty; name: string }
  | {
      kind: 'remote';
      /** Opponent user id (null while nobody has joined). */
      id: string | null;
      name: string;
      live: GameLive | null;
      subscribe: (events: BlockDropEvents) => () => void;
    };

export interface BlockDropEnd {
  won: boolean;
  score: number;
  lines: number;
  oppScore: number;
  oppLines: number;
}

interface Props {
  seed: number;
  meId: string;
  /** Run the local game (false = spectating a remote game). */
  playing: boolean;
  opponent: BlockDropOpponent;
  /** Spectators: the two players to watch. */
  watch?: { id: string; name: string }[];
  coachMode?: CoachMode;
  onEnd: (end: BlockDropEnd) => void;
}

export function BlockDropGame({ seed, meId, playing, opponent, watch, coachMode = 'off', onEnd }: Props) {
  const mainRef = useRef<HTMLCanvasElement | null>(null);
  const nextRef = useRef<HTMLCanvasElement | null>(null);
  const oppRef = useRef<HTMLCanvasElement | null>(null);
  const watchRefs = useRef(new Map<string, HTMLCanvasElement>());
  const gameRef = useRef<BlockDrop | null>(null);
  /** Lock handler of the running game, for the on-screen buttons. */
  const handlers = useRef<((ev: LockEvent | null) => void) | null>(null);
  const [count, setCount] = useState(playing ? COUNTDOWN : 0);
  // Restart the countdown whenever play begins (an online game going live after the accept).
  const [wasPlaying, setWasPlaying] = useState(playing);
  if (wasPlaying !== playing) {
    setWasPlaying(playing);
    setCount(playing ? COUNTDOWN : 0);
  }
  const [stats, setStats] = useState({ score: 0, lines: 0, level: 1, incoming: 0 });
  const [opp, setOpp] = useState<Record<string, { score: number; lines: number }>>({});
  const [coachReport, setCoachReport] = useState<BlockDropCoachReport | null>(null);
  const oppStatsRef = useRef({ score: 0, lines: 0 });
  const onEndRef = useRef(onEnd);
  const opponentRef = useRef(opponent);
  const coachModeRef = useRef(coachMode);
  useEffect(() => {
    onEndRef.current = onEnd;
    opponentRef.current = opponent;
    coachModeRef.current = coachMode;
  });

  const remoteSubscribe = opponent.kind === 'remote' ? opponent.subscribe : null;
  const remoteId = opponent.kind === 'remote' ? opponent.id : null;
  const cpuDifficulty = opponent.kind === 'cpu' ? opponent.difficulty : null;

  // 3-2-1 countdown before a game starts.
  useEffect(() => {
    if (!playing || count <= 0) return;
    const id = setTimeout(() => setCount((c) => c - 1), 700);
    return () => clearTimeout(id);
  }, [playing, count]);

  // Remote opponents' boards and incoming garbage.
  useEffect(() => {
    if (!remoteSubscribe) return;
    return remoteSubscribe({
      onBoard: (userId, snapshot, score, lines) => {
        const cells = parseSnapshot(snapshot);
        const canvas = userId === remoteId ? oppRef.current : watchRefs.current.get(userId);
        const ctx = canvas?.getContext('2d');
        if (cells && ctx) drawCells(ctx, cells, MINI);
        if (userId === remoteId) oppStatsRef.current = { score, lines };
        setOpp((prev) => (prev[userId]?.score === score && prev[userId]?.lines === lines ? prev : { ...prev, [userId]: { score, lines } }));
      },
      onGarbage: (toUserId, n) => {
        const g = gameRef.current;
        if (toUserId !== meId || !g) return;
        g.receiveGarbage(n);
        setStats((s) => ({ ...s, incoming: g.pendingGarbage }));
      },
    });
  }, [remoteSubscribe, remoteId, meId]);

  // The local game (and the CPU, in solo play): one RAF loop drives both.
  useEffect(() => {
    if (!playing || count > 0) return;
    const game = new BlockDrop(seed);
    gameRef.current = game;
    const cpu = cpuDifficulty ? new BlockDropCpu(seed, cpuDifficulty) : null;
    let raf = 0;
    let last = performance.now();
    let ended = false;
    let flash: { rows: number[]; until: number } | null = null;
    let shownPiece = -1;

    const sync = () =>
      setStats({ score: game.score, lines: game.lines, level: game.level, incoming: game.pendingGarbage });

    const finish = (won: boolean) => {
      if (ended) return;
      ended = true;
      const o = cpu ? { score: cpu.game.score, lines: cpu.game.lines } : oppStatsRef.current;
      const r = opponentRef.current;
      if (r.kind === 'remote') r.live?.sendBoard(game.snapshot(), game.score, game.lines);
      onEndRef.current({ won, score: game.score, lines: game.lines, oppScore: o.score, oppLines: o.lines });
    };

    const handleMine = (ev: LockEvent | null) => {
      if (!ev) return;
      if (ev.rows && ev.rows.length) flash = { rows: ev.rows, until: performance.now() + 220 };
      if (ev.sent > 0) {
        if (cpu) cpu.game.receiveGarbage(ev.sent);
        const r = opponentRef.current;
        if (r.kind === 'remote' && r.id) r.live?.sendGarbage(r.id, ev.sent);
      }
      sync();
      if (ev.over) finish(false);
    };
    handlers.current = handleMine;

    const loop = (now: number) => {
      const dt = Math.min(100, now - last);
      last = now;
      if (!ended) {
        handleMine(game.tick(dt));
        if (cpu && !ended) {
          for (const ev of cpu.tick(dt)) {
            if (ev.sent > 0) {
              game.receiveGarbage(ev.sent);
              sync();
            }
            if (ev.cleared > 0 || ev.sent > 0) {
              oppStatsRef.current = { score: cpu.game.score, lines: cpu.game.lines };
              setOpp({ cpu: { score: cpu.game.score, lines: cpu.game.lines } });
            }
          }
          if (cpu.game.over) finish(true);
        }
        const r = opponentRef.current;
        if (r.kind === 'remote') r.live?.sendBoard(game.snapshot(), game.score, game.lines);
      }

      const ctx = mainRef.current?.getContext('2d');
      if (ctx) drawGame(ctx, game, flash, now);
      if (cpu) {
        const octx = oppRef.current?.getContext('2d');
        if (octx) drawCells(octx, Array.from(cpu.game.snapshot(), Number), MINI);
      }
      if (shownPiece !== game.pieceId) {
        shownPiece = game.pieceId;
        const nctx = nextRef.current?.getContext('2d');
        if (nctx) drawNext(nctx, game.queue[0]);
        if (coachModeRef.current !== 'off' && game.active) {
          setCoachReport(analyzeBlockDropCoach(game.grid, game.active));
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (ended) return;
      let handled = true;
      switch (e.key) {
        case 'ArrowLeft':
          game.move(-1);
          break;
        case 'ArrowRight':
          game.move(1);
          break;
        case 'ArrowDown':
          handleMine(game.softDrop());
          break;
        case 'ArrowUp':
        case 'x':
        case 'X':
          game.rotate(1);
          break;
        case 'z':
        case 'Z':
          game.rotate(-1);
          break;
        case ' ':
          handleMine(game.hardDrop());
          break;
        default:
          handled = false;
      }
      if (handled) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      gameRef.current = null;
      handlers.current = null;
    };
  }, [playing, count, seed, cpuDifficulty]);

  const act = useCallback((a: 'left' | 'right' | 'rotate' | 'soft' | 'hard') => {
    const g = gameRef.current;
    if (!g || g.over) return;
    if (a === 'left') g.move(-1);
    else if (a === 'right') g.move(1);
    else if (a === 'rotate') g.rotate(1);
    else handlers.current?.(a === 'soft' ? g.softDrop() : g.hardDrop());
  }, []);

  if (!playing) {
    return (
      <div className={styles.dropStage}>
        {(watch ?? []).map((w) => (
          <div key={w.id} className={styles.panel} style={{ width: 120 }}>
            <span className={styles.panelLabel}>{w.name}</span>
            <canvas
              ref={(el) => {
                if (el) watchRefs.current.set(w.id, el);
                else watchRefs.current.delete(w.id);
              }}
              className={styles.oppCanvas}
              width={COLS * MINI}
              height={ROWS * MINI}
              role="img"
              aria-label={`${w.name}'s board`}
            />
            <span className={styles.panelValue}>{opp[w.id]?.score ?? 0}</span>
          </div>
        ))}
      </div>
    );
  }

  const oppKey = opponent.kind === 'cpu' ? 'cpu' : opponent.id ?? '';
  return (
    <>
      {coachMode !== 'off' && opponent.kind === 'cpu' && coachReport && (
        <div className={styles.dropCoachBar} aria-live="polite">
          <div className={styles.dropCoachMain}>
            <div className={styles.coachHeadlineRow}>
              <span className={styles.coachTagPill}>
                <AppIcon name="sparkles" size={12} /> {coachReport.tag}
              </span>
              <span className={styles.dropCoachAction}>{coachReport.headline}</span>
            </div>
            <span className={styles.dropCoachReason}>{coachReport.reason}</span>
          </div>
        </div>
      )}

      <div className={styles.dropStage}>
        <div className={styles.dropWell}>
          <canvas
            ref={mainRef}
            className={styles.dropCanvas}
            width={COLS * CELL}
            height={ROWS * CELL}
            role="img"
            aria-label="Your Block Drop board"
          />
          {count > 0 && (
            <div className={styles.countdown} aria-live="assertive">
              <span key={count} className={styles.countNum}>{count}</span>
            </div>
          )}
        </div>
        <div className={styles.dropSide}>
          <div className={styles.panel}>
            <span className={styles.panelLabel}>Next</span>
            <canvas ref={nextRef} className={styles.nextCanvas} width={80} height={48} role="img" aria-label="Next piece" />
          </div>
          <div className={styles.panel}>
            <span className={styles.panelLabel}>Score</span>
            <span className={styles.panelValue}>{stats.score}</span>
          </div>
          <div className={styles.panel}>
            <span className={styles.panelLabel}>Lines · Lv</span>
            <span className={styles.panelValue}>
              {stats.lines} · {stats.level}
            </span>
          </div>
          {stats.incoming > 0 && (
            <div className={`${styles.panel} ${styles.incoming}`}>
              <span className={styles.panelLabel}>Incoming</span>
              <span className={styles.panelValue}>+{stats.incoming}</span>
            </div>
          )}
          <div className={styles.panel}>
            <span className={styles.panelLabel}>{opponent.name}</span>
            <canvas
              ref={oppRef}
              className={styles.oppCanvas}
              width={COLS * MINI}
              height={ROWS * MINI}
              role="img"
              aria-label={`${opponent.name}'s board`}
            />
            <span className={styles.panelLabel} style={{ marginTop: 4 }}>
              {opp[oppKey]?.score ?? 0} pts
            </span>
          </div>
        </div>
      </div>

      <div className={styles.pad}>
        <button type="button" className={styles.padBtn} onPointerDown={() => act('left')} aria-label="Move left">
          <AppIcon name="arrowLeft" size={22} />
        </button>
        <button type="button" className={styles.padBtn} onPointerDown={() => act('rotate')} aria-label="Rotate">
          <AppIcon name="rotate" size={22} />
        </button>
        <button type="button" className={styles.padBtn} onPointerDown={() => act('right')} aria-label="Move right">
          <AppIcon name="arrowRight" size={22} />
        </button>
        <button type="button" className={styles.padBtn} onPointerDown={() => act('soft')} aria-label="Soft drop">
          <AppIcon name="arrowDown" size={22} />
        </button>
        <button type="button" className={`${styles.padBtn} ${styles.padDrop}`} onPointerDown={() => act('hard')} aria-label="Hard drop">
          <AppIcon name="down" size={22} />
        </button>
      </div>
      <div className={styles.keysHint}>Arrows move · Up rotates · Space drops</div>
    </>
  );
}
