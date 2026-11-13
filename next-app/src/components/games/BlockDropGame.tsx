'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import styles from './ChatGames.module.css';
import { AppIcon } from '@/components/icons/AppIcon';
import {
  BlockDrop,
  COLS,
  ROWS,
  kindValue,
  lockLabel,
  parseSnapshot,
  pieceCells,
  type LockEvent,
  type PieceKind,
} from '@/lib/games/blockdrop';
import { BlockDropCpu, type Difficulty } from '@/lib/games/bots';
import { analyzeBlockDropCoach, type BlockDropCoachReport, type CoachMode } from '@/lib/games/coach';
import type { GameLive } from '@/lib/services/chatGames';

/** Cell colours by value: 0 empty, 1-7 piece kinds (I O T S Z J L), 8 garbage. */
const CELL_COLORS = ['#18181b', '#22d3ee', '#facc15', '#c084fc', '#4ade80', '#f87171', '#60a5fa', '#fb923c', '#71717a'];
/** Backing-store cell size of the small opponent boards. */
const MINI = 12;
const COUNTDOWN = 3;
/** Held left/right: delay before auto-repeat starts, then the repeat interval. */
const DAS_MS = 140;
const ARR_MS = 28;
const FLASH_MS = 220;
const CALLOUT_MS = 1300;
/** Opponent board broadcasts are also throttled by the service; this just skips needless work. */
const BOARD_EVERY_MS = 120;
/** The service accepts at most this many garbage lines per message. */
const GARBAGE_PER_MESSAGE = 4;

type Action = 'left' | 'right' | 'soft' | 'hard' | 'cw' | 'ccw' | 'hold';

const KEY_ACTIONS: Record<string, Action> = {
  arrowleft: 'left',
  arrowright: 'right',
  arrowdown: 'soft',
  arrowup: 'cw',
  x: 'cw',
  z: 'ccw',
  ' ': 'hard',
  c: 'hold',
  shift: 'hold',
};

function drawBlock(ctx: CanvasRenderingContext2D, px: number, py: number, c: number, value: number) {
  ctx.fillStyle = CELL_COLORS[value] ?? CELL_COLORS[8];
  ctx.fillRect(px, py, c, c);
  if (c >= 10) {
    // Neo-brutalist block: dark outline + light bevel along the top.
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(px + c * 0.1, py + c * 0.1, c * 0.8, Math.max(2, c / 7));
  }
  const lw = Math.max(1, Math.round(c / 11));
  ctx.strokeStyle = '#000';
  ctx.lineWidth = lw;
  ctx.strokeRect(px + lw / 2, py + lw / 2, c - lw, c - lw);
}

/** Draws a whole well of settled cells; the cell size follows the canvas width. */
function drawCells(ctx: CanvasRenderingContext2D, cells: ArrayLike<number>) {
  const c = ctx.canvas.width / COLS;
  ctx.fillStyle = CELL_COLORS[0];
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  // Faint grid so the well reads as a well.
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let x = 1; x < COLS; x++) ctx.fillRect(Math.round(x * c), 0, 1, ctx.canvas.height);
  for (let y = 1; y < ROWS; y++) ctx.fillRect(0, Math.round(y * c), ctx.canvas.width, 1);
  for (let i = 0; i < cells.length; i++) {
    if (cells[i]) drawBlock(ctx, (i % COLS) * c, Math.floor(i / COLS) * c, c, cells[i]);
  }
}

function drawGame(
  ctx: CanvasRenderingContext2D,
  game: BlockDrop,
  ghost: boolean,
  flash: { rows: number[]; until: number } | null,
  now: number
) {
  const c = ctx.canvas.width / COLS;
  drawCells(ctx, game.grid);
  const a = game.active;
  if (a) {
    const cells = pieceCells(a.kind, a.rot);
    const value = kindValue(a.kind);
    if (ghost) {
      const gy = game.ghostY();
      if (gy !== a.y) {
        const lw = Math.max(1, Math.round(c / 11));
        ctx.strokeStyle = CELL_COLORS[value];
        ctx.fillStyle = CELL_COLORS[value];
        ctx.lineWidth = lw;
        for (const [cx, cy] of cells) {
          const y = gy + cy;
          if (y < 0) continue;
          ctx.globalAlpha = 0.2;
          ctx.fillRect((a.x + cx) * c, y * c, c, c);
          ctx.globalAlpha = 0.8;
          ctx.strokeRect((a.x + cx) * c + lw, y * c + lw, c - lw * 2, c - lw * 2);
        }
        ctx.globalAlpha = 1;
      }
    }
    // The piece brightens as its lock delay runs out.
    const lock = game.lockProgress;
    for (const [cx, cy] of cells) {
      const y = a.y + cy;
      if (y < 0) continue;
      drawBlock(ctx, (a.x + cx) * c, y * c, c, value);
      if (lock > 0) {
        ctx.fillStyle = `rgba(255,255,255,${0.35 * lock})`;
        ctx.fillRect((a.x + cx) * c, y * c, c, c);
      }
    }
  }
  if (flash && now < flash.until) {
    ctx.fillStyle = `rgba(255,255,255,${(0.75 * (flash.until - now)) / FLASH_MS})`;
    for (const r of flash.rows) ctx.fillRect(0, r * c, COLS * c, c);
  }
}

/** Draws pieces stacked in equal slots (the hold slot, or the next queue). */
function drawPreview(ctx: CanvasRenderingContext2D, kinds: (PieceKind | null | undefined)[], dim = false) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.fillStyle = CELL_COLORS[0];
  ctx.fillRect(0, 0, w, h);
  const slot = h / kinds.length;
  const c = Math.floor(Math.min(w / 4.6, slot / 2.7));
  ctx.globalAlpha = dim ? 0.35 : 1;
  kinds.forEach((kind, i) => {
    if (!kind) return;
    const cells = pieceCells(kind, 0);
    let minX = 9;
    let maxX = 0;
    let minY = 9;
    let maxY = 0;
    for (const [cx, cy] of cells) {
      minX = Math.min(minX, cx);
      maxX = Math.max(maxX, cx);
      minY = Math.min(minY, cy);
      maxY = Math.max(maxY, cy);
    }
    const ox = Math.round((w - (maxX - minX + 1) * c) / 2);
    const oy = Math.round(i * slot + (slot - (maxY - minY + 1) * c) / 2);
    for (const [cx, cy] of cells) drawBlock(ctx, ox + (cx - minX) * c, oy + (cy - minY) * c, c, kindValue(kind));
  });
  ctx.globalAlpha = 1;
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
  /** Optional external canvas ref when the opponent screen is rendered in the right sidebar. */
  oppCanvasRef?: React.RefObject<HTMLCanvasElement | null>;
  onOppStatsChange?: (stats: { score: number; lines: number }) => void;
  onCoachReportChange?: (report: BlockDropCoachReport | null) => void;
  onEnd: (end: BlockDropEnd) => void;
}

export interface BlockDropOpponentCardProps {
  name: string;
  bot?: boolean;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  score: number;
  lines: number;
  finished?: boolean;
}

export function BlockDropOpponentCard({
  name,
  bot = true,
  canvasRef,
  score,
  lines,
  finished = false,
}: BlockDropOpponentCardProps) {
  return (
    <div className={styles.oppScreenCard}>
      <div className={styles.oppScreenHeader}>
        <div className={styles.oppScreenIdentity}>
          <span className={`${styles.oppScreenAvatar} ${bot ? styles.avatarBot : ''}`}>
            <AppIcon name={bot ? 'bot' : 'user'} size={16} />
          </span>
          <span className={styles.oppScreenTitle}>{name}</span>
        </div>
        <span className={styles.oppScreenBadge}>{finished ? 'Finished' : 'Live screen'}</span>
      </div>

      <div className={styles.oppScreenBody}>
        <div className={styles.oppScreenWell}>
          <canvas
            ref={canvasRef}
            className={styles.oppScreenCanvas}
            width={COLS * 16}
            height={ROWS * 16}
            role="img"
            aria-label={`${name}'s board`}
          />
        </div>
        <div className={styles.oppScreenStats}>
          <div className={styles.panel}>
            <span className={styles.panelLabel}>Score</span>
            <span className={styles.panelValue}>{score}</span>
          </div>
          <div className={styles.panel}>
            <span className={styles.panelLabel}>Lines</span>
            <span className={styles.panelValue}>{lines}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function BlockDropCoachCard({
  mode,
  onModeChange,
  report,
}: {
  mode: CoachMode;
  onModeChange: (mode: CoachMode) => void;
  report: BlockDropCoachReport | null;
}) {
  if (mode === 'off') {
    return (
      <div className={styles.coachCollapsed}>
        <span className={styles.coachCollapsedText}>
          <AppIcon name="bookText" size={14} /> Stack Coach is off
        </span>
        <button
          type="button"
          className={`${styles.btn} ${styles.coachSmallBtn}`}
          onClick={() => onModeChange('live')}
        >
          Enable Coach
        </button>
      </div>
    );
  }

  return (
    <div className={styles.coachCard} role="region" aria-label="Block Drop Stack Coach">
      <div className={styles.coachHeader}>
        <div className={styles.coachTitleWrap}>
          <span className={styles.coachIconBadge}>
            <AppIcon name="bookText" size={14} />
          </span>
          <span className={styles.coachTitle}>Stack Coach</span>
          {report && (
            <span className={styles.coachTagPill}>
              <AppIcon name="sparkles" size={11} /> {report.tag}
            </span>
          )}
        </div>
        <button
          type="button"
          className={`${styles.btn} ${styles.coachSmallBtn}`}
          onClick={() => onModeChange('off')}
        >
          Hide
        </button>
      </div>
      {report ? (
        <div className={styles.dropCoachMain}>
          <span className={styles.dropCoachAction}>{report.headline}</span>
          <span className={styles.dropCoachReason}>{report.reason}</span>
        </div>
      ) : (
        <span className={styles.dropCoachReason}>
          Monitors your stack height, surface balance, and trapped holes as pieces spawn.
        </span>
      )}
    </div>
  );
}

const noContextMenu = (e: React.MouseEvent) => e.preventDefault();

interface Controls {
  press: (a: Action) => void;
  release: (a: Action) => void;
}

export function BlockDropGame({
  seed,
  meId,
  playing,
  opponent,
  watch,
  coachMode = 'off',
  oppCanvasRef,
  onOppStatsChange,
  onCoachReportChange,
  onEnd,
}: Props) {
  const mainRef = useRef<HTMLCanvasElement | null>(null);
  const holdRef = useRef<HTMLCanvasElement | null>(null);
  const nextRef = useRef<HTMLCanvasElement | null>(null);
  const internalOppRef = useRef<HTMLCanvasElement | null>(null);
  const oppRef = oppCanvasRef ?? internalOppRef;
  const watchRefs = useRef(new Map<string, HTMLCanvasElement>());
  const gameRef = useRef<BlockDrop | null>(null);
  /** Input of the running game, for the on-screen buttons. */
  const controls = useRef<Controls | null>(null);
  /** Repaints the well (after the canvas was resized, which clears it). */
  const repaint = useRef<(() => void) | null>(null);
  const [count, setCount] = useState(playing ? COUNTDOWN : 0);
  // Restart the countdown whenever play begins (an online game going live after the accept).
  const [wasPlaying, setWasPlaying] = useState(playing);
  if (wasPlaying !== playing) {
    setWasPlaying(playing);
    setCount(playing ? COUNTDOWN : 0);
  }
  const [stats, setStats] = useState({ score: 0, lines: 0, level: 1, incoming: 0 });
  const [opp, setOpp] = useState<Record<string, { score: number; lines: number }>>({});
  const [callout, setCallout] = useState<{ id: number; text: string } | null>(null);
  const [coachReport, setCoachReport] = useState<BlockDropCoachReport | null>(null);
  const oppStatsRef = useRef({ score: 0, lines: 0 });
  const onEndRef = useRef(onEnd);
  const opponentRef = useRef(opponent);
  const coachModeRef = useRef(coachMode);
  const onOppStatsRef = useRef(onOppStatsChange);
  const onCoachReportRef = useRef(onCoachReportChange);
  useEffect(() => {
    onEndRef.current = onEnd;
    opponentRef.current = opponent;
    coachModeRef.current = coachMode;
    onOppStatsRef.current = onOppStatsChange;
    onCoachReportRef.current = onCoachReportChange;
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

  // Keep the well's backing store at the device's pixel size, so blocks stay sharp at any width.
  useEffect(() => {
    const canvas = mainRef.current;
    if (!playing || !canvas) return;
    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const cell = Math.max(8, Math.round((canvas.clientWidth * dpr) / COLS));
      if (canvas.width !== cell * COLS) {
        canvas.width = cell * COLS;
        canvas.height = cell * ROWS;
      }
      if (repaint.current) repaint.current();
      else {
        const ctx = canvas.getContext('2d');
        if (ctx) drawCells(ctx, []);
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [playing]);

  // Paint the opponent board and side previews immediately (including during countdown).
  useEffect(() => {
    if (!playing) return;
    const octx = oppRef.current?.getContext('2d');
    if (octx && !gameRef.current) drawCells(octx, []);
    const hctx = holdRef.current?.getContext('2d');
    if (hctx && !gameRef.current) drawPreview(hctx, [null]);
    const nctx = nextRef.current?.getContext('2d');
    if (nctx && !gameRef.current) {
      const preview = new BlockDrop(seed);
      drawPreview(nctx, preview.queue);
    }
  }, [playing, seed, oppRef]);

  // Remote opponents' boards and incoming garbage.
  useEffect(() => {
    if (!remoteSubscribe) return;
    return remoteSubscribe({
      onBoard: (userId, snapshot, score, lines) => {
        const cells = parseSnapshot(snapshot);
        const canvas = userId === remoteId ? oppRef.current : watchRefs.current.get(userId);
        const ctx = canvas?.getContext('2d');
        if (cells && ctx) drawCells(ctx, cells);
        if (userId === remoteId) {
          oppStatsRef.current = { score, lines };
          onOppStatsRef.current?.({ score, lines });
        }
        setOpp((prev) => (prev[userId]?.score === score && prev[userId]?.lines === lines ? prev : { ...prev, [userId]: { score, lines } }));
      },
      onGarbage: (toUserId, n) => {
        const g = gameRef.current;
        if (toUserId !== meId || !g) return;
        g.receiveGarbage(n);
        setStats((s) => ({ ...s, incoming: g.pendingGarbage }));
      },
    });
  }, [remoteSubscribe, remoteId, meId, oppRef]);

  // The local game (and the CPU, in solo play): one RAF loop drives input, gravity and drawing.
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
    let shownSide = '';
    let boardMs = BOARD_EVERY_MS;
    let calloutId = 0;
    let calloutTimer: ReturnType<typeof setTimeout> | null = null;
    // Held keys / buttons. `dir` is the direction that auto-repeats (the last one pressed).
    const held = { left: false, right: false, soft: false, dir: 0 as -1 | 0 | 1, das: 0 };

    const sync = () =>
      setStats((s) =>
        s.score === game.score && s.lines === game.lines && s.level === game.level && s.incoming === game.pendingGarbage
          ? s
          : { score: game.score, lines: game.lines, level: game.level, incoming: game.pendingGarbage }
      );

    const sendBoard = () => {
      const r = opponentRef.current;
      if (r.kind === 'remote') r.live?.sendBoard(game.snapshot(), game.score, game.lines);
    };

    const finish = (won: boolean) => {
      if (ended) return;
      ended = true;
      const o = cpu ? { score: cpu.game.score, lines: cpu.game.lines } : oppStatsRef.current;
      sendBoard();
      sync();
      onEndRef.current({ won, score: game.score, lines: game.lines, oppScore: o.score, oppLines: o.lines });
    };

    const handleMine = (ev: LockEvent | null) => {
      if (!ev) return;
      if (ev.rows && ev.rows.length) flash = { rows: ev.rows, until: performance.now() + FLASH_MS };
      const label = lockLabel(ev);
      if (label) {
        setCallout({ id: ++calloutId, text: label });
        if (calloutTimer) clearTimeout(calloutTimer);
        calloutTimer = setTimeout(() => setCallout(null), CALLOUT_MS);
      }
      if (ev.sent > 0) {
        if (cpu) cpu.game.receiveGarbage(ev.sent);
        const r = opponentRef.current;
        if (r.kind === 'remote' && r.id) {
          for (let left = ev.sent; left > 0; left -= GARBAGE_PER_MESSAGE) {
            r.live?.sendGarbage(r.id, Math.min(GARBAGE_PER_MESSAGE, left));
          }
        }
      }
      boardMs = BOARD_EVERY_MS;
      sync();
      if (ev.over) finish(false);
    };

    const press = (a: Action) => {
      if (ended) return;
      switch (a) {
        case 'left':
        case 'right':
          held[a] = true;
          held.dir = a === 'left' ? -1 : 1;
          held.das = 0;
          game.move(held.dir);
          break;
        case 'soft':
          held.soft = true;
          game.softDrop();
          break;
        case 'cw':
          game.rotate(1);
          break;
        case 'ccw':
          game.rotate(-1);
          break;
        case 'hold':
          game.hold();
          break;
        case 'hard':
          handleMine(game.hardDrop());
          break;
      }
    };

    const release = (a: Action) => {
      if (a === 'soft') held.soft = false;
      if (a !== 'left' && a !== 'right') return;
      held[a] = false;
      const dir = a === 'left' ? -1 : 1;
      if (held.dir !== dir) return;
      // Fall back to the other direction if it is still held.
      held.dir = held.left ? -1 : held.right ? 1 : 0;
      held.das = 0;
    };
    controls.current = { press, release };

    const draw = (now: number) => {
      const ctx = mainRef.current?.getContext('2d');
      if (ctx) drawGame(ctx, game, true, flash, now);
      if (cpu) {
        const octx = oppRef.current?.getContext('2d');
        if (octx) drawGame(octx, cpu.game, false, null, now);
      }
      const side = `${game.pieceId}|${game.held ?? ''}|${game.canHold ? 1 : 0}`;
      if (side !== shownSide) {
        shownSide = side;
        const hctx = holdRef.current?.getContext('2d');
        if (hctx) drawPreview(hctx, [game.held], !game.canHold);
        const nctx = nextRef.current?.getContext('2d');
        if (nctx) drawPreview(nctx, game.queue);
      }
    };
    repaint.current = () => draw(performance.now());

    const loop = (now: number) => {
      // A background tab pauses RAF; never simulate more than a tenth of a second at once.
      const dt = Math.min(100, Math.max(0, now - last));
      last = now;
      if (!ended) {
        if (held.dir !== 0) {
          held.das += dt;
          while (held.das >= DAS_MS) {
            if (!game.move(held.dir)) {
              // Against a wall: stay charged so the piece slides the moment it can.
              held.das = DAS_MS;
              break;
            }
            held.das -= ARR_MS;
          }
        }
        handleMine(game.tick(dt, held.soft));
        if (cpu && !ended) {
          for (const ev of cpu.tick(dt)) {
            if (ev.sent > 0) {
              game.receiveGarbage(ev.sent);
              sync();
            }
          }
          if (
            cpu.game.score !== oppStatsRef.current.score ||
            cpu.game.lines !== oppStatsRef.current.lines
          ) {
            const nextOppStats = { score: cpu.game.score, lines: cpu.game.lines };
            oppStatsRef.current = nextOppStats;
            setOpp({ cpu: nextOppStats });
            onOppStatsRef.current?.(nextOppStats);
          }
          if (cpu.game.over) finish(true);
        }
        boardMs += dt;
        if (boardMs >= BOARD_EVERY_MS) {
          boardMs = 0;
          sendBoard();
        }
      }

      draw(now);
      if (shownPiece !== game.pieceId) {
        shownPiece = game.pieceId;
        if (game.active) {
          const rep = analyzeBlockDropCoach(game.grid, game.active);
          setCoachReport(rep);
          onCoachReportRef.current?.(rep);
        }
      }
      // After the game ends, keep painting only until the last line flash fades.
      if (!ended || (flash && now < flash.until)) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return Boolean(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable));
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      const action = KEY_ACTIONS[e.key.toLowerCase()];
      if (!action || ended) return;
      e.preventDefault();
      // The loop does its own auto-repeat, so the keyboard's repeat is ignored.
      if (!e.repeat) press(action);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const action = KEY_ACTIONS[e.key.toLowerCase()];
      if (action) release(action);
    };
    const releaseAll = () => {
      held.left = held.right = held.soft = false;
      held.dir = 0;
      held.das = 0;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', releaseAll);

    return () => {
      cancelAnimationFrame(raf);
      if (calloutTimer) clearTimeout(calloutTimer);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', releaseAll);
      gameRef.current = null;
      controls.current = null;
      repaint.current = null;
    };
  }, [playing, count, seed, cpuDifficulty, oppRef]);

  // On-screen buttons act while the finger (or mouse) is down; data-action names the button.
  const padDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Capture is a nicety; the release handlers still fire without it.
    }
    controls.current?.press(e.currentTarget.dataset.action as Action);
  }, []);
  const padUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    controls.current?.release(e.currentTarget.dataset.action as Action);
  }, []);
  const pad = {
    onPointerDown: padDown,
    onPointerUp: padUp,
    onPointerCancel: padUp,
    onLostPointerCapture: padUp,
    onContextMenu: noContextMenu,
  };

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
  const hasExternalSidebar = Boolean(oppCanvasRef);

  return (
    <>
      {!hasExternalSidebar && coachMode !== 'off' && opponent.kind === 'cpu' && coachReport && (
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
        <div className={styles.dropSide}>
          <div className={styles.panel}>
            <span className={styles.panelLabel}>Hold</span>
            <canvas ref={holdRef} className={styles.nextCanvas} width={92} height={60} role="img" aria-label="Held piece" />
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
          {!hasExternalSidebar && (
            <div className={styles.panel}>
              <span className={`${styles.panelLabel} ${styles.panelName}`}>{opponent.name}</span>
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
          )}
        </div>

        <div className={styles.dropWell}>
          <canvas
            ref={mainRef}
            className={styles.dropCanvas}
            width={COLS * 24}
            height={ROWS * 24}
            role="img"
            aria-label="Your Block Drop board"
          />
          {callout && (
            <div key={callout.id} className={styles.dropCallout} role="status" aria-live="polite">
              {callout.text}
            </div>
          )}
          {count > 0 && (
            <div className={styles.countdown} aria-live="assertive">
              <span key={count} className={styles.countNum}>{count}</span>
            </div>
          )}
        </div>

        <div className={styles.dropSide}>
          <div className={styles.panel}>
            <span className={styles.panelLabel}>Next</span>
            <canvas ref={nextRef} className={styles.nextCanvas} width={92} height={270} role="img" aria-label="Next pieces" />
          </div>
          <div className={`${styles.panel} ${stats.incoming > 0 ? styles.incoming : styles.incomingIdle}`}>
            <span className={styles.panelLabel}>Incoming</span>
            <span className={styles.panelValue}>+{stats.incoming}</span>
          </div>
        </div>
      </div>

      <div className={styles.pad}>
        <button type="button" className={styles.padBtn} data-action="left" {...pad} aria-label="Move left">
          <AppIcon name="arrowLeft" size={22} />
        </button>
        <button type="button" className={styles.padBtn} data-action="right" {...pad} aria-label="Move right">
          <AppIcon name="arrowRight" size={22} />
        </button>
        <button type="button" className={styles.padBtn} data-action="ccw" {...pad} aria-label="Rotate left">
          <AppIcon name="undo" size={22} />
        </button>
        <button type="button" className={styles.padBtn} data-action="cw" {...pad} aria-label="Rotate right">
          <AppIcon name="rotate" size={22} />
        </button>
        <button type="button" className={styles.padBtn} data-action="soft" {...pad} aria-label="Soft drop">
          <AppIcon name="arrowDown" size={22} />
        </button>
        <button type="button" className={`${styles.padBtn} ${styles.padHold}`} data-action="hold" {...pad} aria-label="Hold piece">
          <AppIcon name="package" size={18} /> <span>Hold</span>
        </button>
        <button type="button" className={`${styles.padBtn} ${styles.padDrop}`} data-action="hard" {...pad} aria-label="Hard drop">
          <AppIcon name="down" size={22} /> <span>Drop</span>
        </button>
      </div>
      <div className={styles.keysHint}>Arrows move · Up or X rotates · Z rotates back · Down soft drop · Space drops · C holds</div>
    </>
  );
}
