'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import styles from './ChatGames.module.css';
import { AppIcon } from '@/components/icons/AppIcon';
import { BlockDrop, COLS, ROWS, parseSnapshot, pieceCells } from '@/lib/games/blockdrop';
import type { GameLive } from '@/lib/services/chatGames';

/** Cell colours by value: 0 empty, 1-7 piece kinds (I O T S Z J L), 8 garbage. */
const CELL_COLORS = ['#18181b', '#22d3ee', '#facc15', '#c084fc', '#4ade80', '#f87171', '#60a5fa', '#fb923c', '#71717a'];
const CELL = 20;

function drawGrid(ctx: CanvasRenderingContext2D, cells: number[], cell: number, ghost?: { cells: [number, number][] }) {
  ctx.fillStyle = CELL_COLORS[0];
  ctx.fillRect(0, 0, COLS * cell, ROWS * cell);
  if (ghost) {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5;
    for (const [x, y] of ghost.cells) if (y >= 0) ctx.strokeRect(x * cell + 2, y * cell + 2, cell - 4, cell - 4);
  }
  for (let i = 0; i < cells.length; i++) {
    const v = cells[i];
    if (!v) continue;
    const x = (i % COLS) * cell;
    const y = Math.floor(i / COLS) * cell;
    ctx.fillStyle = CELL_COLORS[v] ?? CELL_COLORS[8];
    ctx.fillRect(x, y, cell, cell);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = Math.max(1, cell / 10);
    ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
  }
}

export interface BlockDropEvents {
  onBoard?: (userId: string, snapshot: string, score: number, lines: number) => void;
  onGarbage?: (toUserId: string, count: number) => void;
}

interface Props {
  seed: number;
  meId: string;
  /** True when the viewer is a player in a live game. */
  playing: boolean;
  /** The other player(s) whose boards are shown small. */
  watchIds: string[];
  nameOf: (id: string) => string;
  live: GameLive | null;
  /** Registers live board / garbage listeners; returns an unsubscribe. */
  subscribe: (events: BlockDropEvents) => () => void;
  opponentId: string | null;
  onTopOut: (score: number, lines: number, opponentScore: number, opponentLines: number) => void;
}

export function BlockDropGame({ seed, meId, playing, watchIds, nameOf, live, subscribe, opponentId, onTopOut }: Props) {
  const mainRef = useRef<HTMLCanvasElement | null>(null);
  const miniRefs = useRef(new Map<string, HTMLCanvasElement>());
  const gameRef = useRef<BlockDrop | null>(null);
  const [stats, setStats] = useState({ score: 0, lines: 0, level: 1, incoming: 0 });
  const [others, setOthers] = useState<Record<string, { score: number; lines: number }>>({});
  const othersRef = useRef(others);
  const onTopOutRef = useRef(onTopOut);
  const liveRef = useRef(live);
  useEffect(() => {
    othersRef.current = others;
    onTopOutRef.current = onTopOut;
    liveRef.current = live;
  });

  // Opponent boards and incoming garbage.
  useEffect(
    () =>
      subscribe({
        onBoard: (userId, snapshot, score, lines) => {
          const cells = parseSnapshot(snapshot);
          const canvas = miniRefs.current.get(userId);
          const ctx = canvas?.getContext('2d');
          if (cells && ctx) drawGrid(ctx, cells, 7);
          setOthers((prev) => ({ ...prev, [userId]: { score, lines } }));
        },
        onGarbage: (toUserId, count) => {
          if (toUserId !== meId || !gameRef.current) return;
          gameRef.current.receiveGarbage(count);
          setStats((s) => ({ ...s, incoming: gameRef.current?.pendingGarbage ?? 0 }));
        },
      }),
    [subscribe, meId]
  );

  // The local game: RAF loop, keyboard, rendering.
  useEffect(() => {
    if (!playing) return;
    const game = new BlockDrop(seed);
    gameRef.current = game;
    let raf = 0;
    let last = performance.now();
    let ended = false;

    const sync = () => {
      setStats({ score: game.score, lines: game.lines, level: game.level, incoming: game.pendingGarbage });
    };

    const afterLock = (ev: ReturnType<BlockDrop['tick']>) => {
      if (!ev) return;
      if (ev.sent > 0 && opponentId) liveRef.current?.sendGarbage(opponentId, ev.sent);
      sync();
      if (ev.over && !ended) {
        ended = true;
        const opp = opponentId ? othersRef.current[opponentId] : undefined;
        liveRef.current?.sendBoard(game.snapshot(), game.score, game.lines);
        onTopOutRef.current(game.score, game.lines, opp?.score ?? 0, opp?.lines ?? 0);
      }
    };

    const render = () => {
      const ctx = mainRef.current?.getContext('2d');
      if (!ctx) return;
      const a = game.active;
      const gy = a ? game.ghostY() : 0;
      const ghost = a
        ? { cells: pieceCells(a.kind, a.rot).map(([cx, cy]) => [a.x + cx, gy + cy] as [number, number]) }
        : undefined;
      const cells = Array.from(game.snapshot(), Number);
      drawGrid(ctx, cells, CELL, ghost);
    };

    const loop = (now: number) => {
      const dt = Math.min(100, now - last);
      last = now;
      if (!game.over) {
        afterLock(game.tick(dt));
        liveRef.current?.sendBoard(game.snapshot(), game.score, game.lines);
      }
      render();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      let handled = true;
      switch (e.key) {
        case 'ArrowLeft':
          game.move(-1);
          break;
        case 'ArrowRight':
          game.move(1);
          break;
        case 'ArrowDown':
          afterLock(game.softDrop());
          break;
        case 'ArrowUp':
        case 'x':
          game.rotate(1);
          break;
        case 'z':
          game.rotate(-1);
          break;
        case ' ':
          afterLock(game.hardDrop());
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
    };
  }, [playing, seed, opponentId]);

  const act = useCallback((a: 'left' | 'right' | 'rotate' | 'soft' | 'hard') => {
    const g = gameRef.current;
    if (!g || g.over) return;
    if (a === 'left') g.move(-1);
    else if (a === 'right') g.move(1);
    else if (a === 'rotate') g.rotate(1);
    else {
      const ev = a === 'soft' ? g.softDrop() : g.hardDrop();
      if (ev) {
        if (ev.sent > 0 && opponentId) live?.sendGarbage(opponentId, ev.sent);
        setStats({ score: g.score, lines: g.lines, level: g.level, incoming: g.pendingGarbage });
        if (ev.over) {
          const opp = opponentId ? othersRef.current[opponentId] : undefined;
          onTopOutRef.current(g.score, g.lines, opp?.score ?? 0, opp?.lines ?? 0);
        }
      }
    }
  }, [live, opponentId]);

  return (
    <>
      <div className={styles.dropLayout}>
        {playing && (
          <canvas
            ref={mainRef}
            className={styles.dropCanvas}
            width={COLS * CELL}
            height={ROWS * CELL}
            aria-label="Your Block Drop board. Arrow keys move, up rotates, space drops."
            role="img"
          />
        )}
        <div className={styles.dropSide}>
          {playing && (
            <>
              <div className={styles.stat}>Score <strong>{stats.score}</strong></div>
              <div className={styles.stat}>Lines <strong>{stats.lines}</strong></div>
              <div className={styles.stat}>Level <strong>{stats.level}</strong></div>
              {stats.incoming > 0 && <div className={styles.stat}>Incoming <strong>{stats.incoming}</strong></div>}
            </>
          )}
          {watchIds.map((id) => (
            <div key={id}>
              <div>{nameOf(id)}</div>
              <canvas
                ref={(el) => {
                  if (el) miniRefs.current.set(id, el);
                  else miniRefs.current.delete(id);
                }}
                className={styles.miniCanvas}
                width={COLS * 7}
                height={ROWS * 7}
                role="img"
                aria-label={`${nameOf(id)}'s board`}
              />
              <div>{others[id]?.score ?? 0} pts</div>
            </div>
          ))}
        </div>
      </div>

      {playing && (
        <div className={styles.pad}>
          <button type="button" className={styles.padBtn} onPointerDown={() => act('left')} aria-label="Move left">
            <AppIcon name="arrowLeft" size={20} />
          </button>
          <button type="button" className={styles.padBtn} onPointerDown={() => act('rotate')} aria-label="Rotate">
            <AppIcon name="rotate" size={20} />
          </button>
          <button type="button" className={styles.padBtn} onPointerDown={() => act('right')} aria-label="Move right">
            <AppIcon name="arrowRight" size={20} />
          </button>
          <button type="button" className={styles.padBtn} onPointerDown={() => act('soft')} aria-label="Soft drop">
            <AppIcon name="arrowDown" size={20} />
          </button>
          <button type="button" className={styles.padBtn} onPointerDown={() => act('hard')} aria-label="Hard drop">
            <AppIcon name="down" size={20} />
          </button>
        </div>
      )}
    </>
  );
}
