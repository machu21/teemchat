'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BOARD_COLORS,
  BOARD_H,
  BOARD_SIZES,
  BOARD_W,
  PointBatcher,
  Stroke,
  WhiteboardTool,
  capStrokes,
  newStrokeId,
  normalizePoint,
} from '@/lib/whiteboard/model';
import { BoardLive, WhiteboardService } from '@/lib/services/whiteboard';
import styles from './WhiteboardModal.module.css';
import { AppIcon } from '@/components/icons/AppIcon';
import type { IconName } from '@/lib/icons';

interface WhiteboardModalProps {
  spaceId: string;
  boardId: string;
  userId: string;
  /** Hosts can wipe the board. */
  canClear: boolean;
  /** Banned / chat-muted players can look but not draw. */
  readOnly: boolean;
  /** Blocked / muted players' strokes are hidden for this viewer. */
  hiddenUserIds: Set<string>;
  onClose: () => void;
}

const SAVE_DEBOUNCE_MS = 2000;

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, w: number, h: number) {
  if (stroke.points.length === 0) return;
  const scale = w / BOARD_W;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (stroke.tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = stroke.size * 3 * scale;
  } else if (stroke.tool === 'highlighter') {
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.size * 2.5 * scale;
  } else {
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.size * scale;
  }
  ctx.beginPath();
  const [x0, y0] = stroke.points[0];
  ctx.moveTo(x0 * w, y0 * h);
  if (stroke.points.length === 1) ctx.lineTo(x0 * w + 0.01, y0 * h);
  for (let i = 1; i < stroke.points.length; i++) {
    const [x, y] = stroke.points[i];
    ctx.lineTo(x * w, y * h);
  }
  ctx.stroke();
  ctx.restore();
}

export function WhiteboardModal({
  spaceId,
  boardId,
  userId,
  canClear,
  readOnly,
  hiddenUserIds,
  onClose,
}: WhiteboardModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const versionRef = useRef(1);
  const removedRef = useRef<Set<string>>(new Set());
  const liveRef = useRef<Map<string, Stroke>>(new Map());
  const currentRef = useRef<Stroke | null>(null);
  const boardLiveRef = useRef<BoardLive | null>(null);
  const batcherRef = useRef<PointBatcher | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const hiddenRef = useRef(hiddenUserIds);

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [tool, setTool] = useState<WhiteboardTool>('pen');
  const [color, setColor] = useState<string>(BOARD_COLORS[0]);
  const [size, setSize] = useState<number>(BOARD_SIZES[0]);

  // ── Rendering ──
  const redraw = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const hidden = hiddenRef.current;
      for (const s of strokesRef.current) if (!hidden.has(s.userId)) drawStroke(ctx, s, w, h);
      for (const s of liveRef.current.values()) if (!hidden.has(s.userId)) drawStroke(ctx, s, w, h);
      if (currentRef.current) drawStroke(ctx, currentRef.current, w, h);
    });
  }, []);

  useEffect(() => {
    hiddenRef.current = hiddenUserIds;
    redraw();
  }, [hiddenUserIds, redraw]);

  // Keep the canvas at 16:10, sharp on high-DPI screens.
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const resize = () => {
      const cssW = wrap.clientWidth;
      const cssH = Math.round((cssW * BOARD_H) / BOARD_W);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.style.height = `${cssH}px`;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      redraw();
    };
    resize();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    ro?.observe(wrap);
    window.addEventListener('resize', resize);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [redraw]);

  // ── Persistence ──
  const saveNow = useCallback(async () => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    setSaveState('saving');
    const saved = await WhiteboardService.save(
      spaceId,
      boardId,
      userId,
      { strokes: strokesRef.current, version: versionRef.current },
      removedRef.current
    );
    if (saved) {
      versionRef.current = saved.version;
      strokesRef.current = saved.strokes;
      setSaveState(dirtyRef.current ? 'unsaved' : 'saved');
      redraw();
    } else {
      dirtyRef.current = true;
      setSaveState('unsaved');
    }
  }, [spaceId, boardId, userId, redraw]);

  const scheduleSave = useCallback(() => {
    dirtyRef.current = true;
    setSaveState('unsaved');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      saveNow().catch(() => setSaveState('unsaved'));
    }, SAVE_DEBOUNCE_MS);
  }, [saveNow]);

  // ── Load + live channel ──
  useEffect(() => {
    let cancelled = false;
    WhiteboardService.load(spaceId, boardId)
      .then((snap) => {
        if (cancelled) return;
        if (!snap) {
          setStatus('error');
          return;
        }
        strokesRef.current = snap.strokes;
        versionRef.current = snap.version;
        setStatus('ready');
        redraw();
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    const live = WhiteboardService.connect(spaceId, boardId, userId, {
      onPoints: (strokeId, author, meta, points) => {
        const existing = liveRef.current.get(strokeId);
        if (existing) existing.points.push(...points);
        else liveRef.current.set(strokeId, { id: strokeId, userId: author, ...meta, points: [...points] });
        redraw();
      },
      onStrokeEnd: (stroke) => {
        liveRef.current.delete(stroke.id);
        if (!strokesRef.current.some((s) => s.id === stroke.id)) {
          strokesRef.current = capStrokes([...strokesRef.current, stroke]);
        }
        redraw();
      },
      onUndo: (strokeId, author) => {
        strokesRef.current = strokesRef.current.filter((s) => !(s.id === strokeId && s.userId === author));
        redraw();
      },
      onClear: () => {
        strokesRef.current = [];
        liveRef.current.clear();
        redraw();
      },
    });
    boardLiveRef.current = live;
    const batcher = new PointBatcher((points) => {
      const cur = currentRef.current;
      if (cur) live.sendPoints(cur.id, { color: cur.color, size: cur.size, tool: cur.tool }, points);
    });
    batcherRef.current = batcher;

    return () => {
      cancelled = true;
      batcher.dispose();
      live.dispose();
      boardLiveRef.current = null;
      batcherRef.current = null;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    };
  }, [spaceId, boardId, userId, redraw]);

  // Flush unsaved strokes when the board closes.
  const close = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    saveNow().catch(() => {});
    onClose();
  }, [onClose, saveNow]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  // ── Drawing ──
  const pointFromEvent = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const rect = e.currentTarget.getBoundingClientRect();
    return normalizePoint(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (readOnly || status !== 'ready') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = pointFromEvent(e);
    currentRef.current = { id: newStrokeId(), userId, color, size, tool, points: [p] };
    batcherRef.current?.push(p);
    redraw();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cur = currentRef.current;
    if (!cur) return;
    const p = pointFromEvent(e);
    const last = cur.points[cur.points.length - 1];
    if (last && Math.abs(last[0] - p[0]) < 0.0008 && Math.abs(last[1] - p[1]) < 0.0008) return;
    cur.points.push(p);
    batcherRef.current?.push(p);
    redraw();
  };

  const finishStroke = () => {
    const cur = currentRef.current;
    if (!cur) return;
    batcherRef.current?.flush();
    currentRef.current = null;
    strokesRef.current = capStrokes([...strokesRef.current, cur]);
    boardLiveRef.current?.sendStrokeEnd(cur);
    scheduleSave();
    redraw();
  };

  const undo = () => {
    const mine = [...strokesRef.current].reverse().find((s) => s.userId === userId);
    if (!mine) return;
    strokesRef.current = strokesRef.current.filter((s) => s.id !== mine.id);
    removedRef.current.add(mine.id);
    boardLiveRef.current?.sendUndo(mine.id);
    scheduleSave();
    redraw();
  };

  const clearBoard = () => {
    for (const s of strokesRef.current) removedRef.current.add(s.id);
    strokesRef.current = [];
    liveRef.current.clear();
    boardLiveRef.current?.sendClear();
    scheduleSave();
    redraw();
  };

  const exportPng = () => {
    const ink = document.createElement('canvas');
    ink.width = BOARD_W;
    ink.height = BOARD_H;
    const inkCtx = ink.getContext('2d');
    const out = document.createElement('canvas');
    out.width = BOARD_W;
    out.height = BOARD_H;
    const outCtx = out.getContext('2d');
    if (!inkCtx || !outCtx) return;
    for (const s of strokesRef.current) if (!hiddenRef.current.has(s.userId)) drawStroke(inkCtx, s, BOARD_W, BOARD_H);
    outCtx.fillStyle = '#FFFFFF';
    outCtx.fillRect(0, 0, BOARD_W, BOARD_H);
    outCtx.drawImage(ink, 0, 0);
    out.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'teemchat-whiteboard.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  };

  const tools: { id: WhiteboardTool; label: string; icon: IconName }[] = [
    { id: 'pen', label: 'Pen', icon: 'pen' },
    { id: 'highlighter', label: 'Highlighter', icon: 'highlighter' },
    { id: 'eraser', label: 'Eraser', icon: 'eraser' },
  ];

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Whiteboard">
      <div className={styles.panel}>
        <header className={styles.header}>
          <h2 className={styles.title}><AppIcon name="pen" /> Whiteboard</h2>
          <span className={styles.saveState} aria-live="polite">
            {status === 'loading'
              ? 'Loading…'
              : status === 'error'
                ? 'Could not open this board'
                : readOnly
                  ? 'View only'
                  : saveState === 'saving'
                    ? 'Saving…'
                    : saveState === 'unsaved'
                      ? 'Unsaved changes'
                      : 'Saved'}
          </span>
          <button type="button" className={styles.closeBtn} onClick={close} aria-label="Close whiteboard">
            <AppIcon name="close" />
          </button>
        </header>

        {!readOnly && (
          <div className={styles.toolbar} role="toolbar" aria-label="Drawing tools">
            <div className={styles.group} role="radiogroup" aria-label="Tool">
              {tools.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={tool === t.id}
                  aria-label={t.label}
                  title={t.label}
                  className={`${styles.toolBtn} ${tool === t.id ? styles.on : ''}`}
                  onClick={() => setTool(t.id)}
                >
                  <AppIcon name={t.icon} />
                </button>
              ))}
            </div>
            <div className={styles.group} role="radiogroup" aria-label="Colour">
              {BOARD_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c}
                  aria-label={`Colour ${c}`}
                  className={`${styles.swatch} ${color === c ? styles.swatchOn : ''}`}
                  style={{ background: c }}
                  onClick={() => {
                    setColor(c);
                    if (tool === 'eraser') setTool('pen');
                  }}
                />
              ))}
            </div>
            <div className={styles.group} role="radiogroup" aria-label="Size">
              {BOARD_SIZES.map((sz) => (
                <button
                  key={sz}
                  type="button"
                  role="radio"
                  aria-checked={size === sz}
                  aria-label={`Size ${sz}`}
                  className={`${styles.toolBtn} ${size === sz ? styles.on : ''}`}
                  onClick={() => setSize(sz)}
                >
                  <span className={styles.dot} style={{ width: 4 + sz, height: 4 + sz }} />
                </button>
              ))}
            </div>
            <div className={styles.group}>
              <button type="button" className={styles.textBtn} onClick={undo}>
                <AppIcon name="undo" /> Undo
              </button>
              {canClear && (
                <button type="button" className={styles.textBtn} onClick={clearBoard}>
                  <AppIcon name="trash" /> Clear
                </button>
              )}
              <button type="button" className={styles.textBtn} onClick={exportPng}>
                <AppIcon name="download" /> PNG
              </button>
            </div>
          </div>
        )}

        <div ref={wrapRef} className={styles.boardWrap}>
          <canvas
            ref={canvasRef}
            className={`${styles.board} ${readOnly ? styles.readOnly : ''}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={finishStroke}
            onPointerCancel={finishStroke}
            aria-label="Drawing area"
          />
        </div>
      </div>
    </div>
  );
}
