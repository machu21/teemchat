'use client';

import React, { useMemo, useState } from 'react';
import styles from './ChatGames.module.css';
import { AppIcon } from '@/components/icons/AppIcon';
import { applyDamaMove, colorOf, damaLegalMoves, damaOutcome, isDark, isKing, parseDama, rc } from '@/lib/games/dama';
import type { DamaCoachHint, Seat, TurnBoardProps } from './boardTypes';

function damaIndexToSvgCenter(index: number, seat: Seat): { x: number; y: number } {
  const [r, c] = rc(index);
  const col = seat === 'two' ? 7 - c : c;
  const row = seat === 'two' ? 7 - r : r;
  return { x: col * 100 + 50, y: row * 100 + 50 };
}

function DamaCoachArrowOverlay({ arrow, seat }: { arrow: { from: number; path: number[] }; seat: Seat }) {
  const chain = [arrow.from, ...arrow.path];
  if (chain.length < 2) return null;
  const points = chain.map((idx) => damaIndexToSvgCenter(idx, seat));
  const first = points[0];
  const last = points[points.length - 1];
  const prev = points[points.length - 2];

  const dx = last.x - prev.x;
  const dy = last.y - prev.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return null;

  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;

  const tipX = last.x - ux * 10;
  const tipY = last.y - uy * 10;
  const headLen = 34;
  const headHalfWidth = 22;

  const polyPoints = points
    .map((p, idx) => {
      if (idx === points.length - 1) {
        return `${tipX - ux * (headLen - 6)},${tipY - uy * (headLen - 6)}`;
      }
      return `${p.x},${p.y}`;
    })
    .join(' ');

  const headPoints = [
    `${tipX},${tipY}`,
    `${tipX - ux * headLen + px * headHalfWidth},${tipY - uy * headLen + py * headHalfWidth}`,
    `${tipX - ux * headLen - px * headHalfWidth},${tipY - uy * headLen - py * headHalfWidth}`,
  ].join(' ');

  return (
    <svg className={styles.coachArrowSvg} viewBox="0 0 800 800" aria-hidden="true">
      <circle cx={first.x} cy={first.y} r={34} fill="rgba(250, 204, 21, 0.28)" stroke="#18181b" strokeWidth={5} />
      <polyline
        points={polyPoints}
        fill="none"
        stroke="#18181b"
        strokeWidth={22}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points={polyPoints}
        fill="none"
        stroke="#facc15"
        strokeWidth={13}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.slice(1, -1).map((wp, idx) => (
        <circle key={idx} cx={wp.x} cy={wp.y} r={14} fill="#facc15" stroke="#18181b" strokeWidth={4} />
      ))}
      <polygon points={headPoints} fill="#facc15" stroke="#18181b" strokeWidth={5} strokeLinejoin="round" />
    </svg>
  );
}

export function DamaBoard({
  state: raw,
  seat,
  canMove,
  onMove,
  coachHint,
}: TurnBoardProps & { coachHint?: DamaCoachHint | null }) {
  const state = useMemo(() => parseDama(raw), [raw]);
  const legal = useMemo(() => damaLegalMoves(state), [state]);
  const myColor = seat === 'two' ? 'b' : 'w';
  const myTurn = canMove && state.turn === myColor;
  const [selected, setSelected] = useState<number | null>(null);
  const [selBoard, setSelBoard] = useState(raw);
  if (selBoard !== raw) {
    setSelBoard(raw);
    setSelected(null);
  }

  const movable = useMemo(() => new Set(legal.map((m) => m.from)), [legal]);
  const targets = useMemo(
    () => new Set(selected === null ? [] : legal.filter((m) => m.from === selected).map((m) => m.path[m.path.length - 1])),
    [legal, selected]
  );

  const tap = (i: number) => {
    if (!myTurn) return;
    if (selected !== null && targets.has(i)) {
      const next = applyDamaMove(state, selected, i);
      setSelected(null);
      if (!next) return;
      const o = damaOutcome(next);
      onMove({
        state: next,
        finished: o.over,
        winner: o.over && o.winner ? (o.winner === 'w' ? 'one' : 'two') : null,
      });
      return;
    }
    setSelected(movable.has(i) && i !== selected ? i : null);
  };

  const order = Array.from({ length: 64 }, (_, k) => (seat === 'two' ? 63 - k : k));
  const captured = new Set(state.lastMove?.captures ?? []);
  const ideaTo = coachHint?.arrow && coachHint.arrow.path.length > 0 ? coachHint.arrow.path[coachHint.arrow.path.length - 1] : null;

  return (
    <div className={styles.frame}>
      <div className={styles.grid8} role="grid" aria-label="Dama board">
        {order.map((i) => {
          const cell = state.board[i];
          const dark = isDark(i);
          const isTarget = targets.has(i);
          const isLast = state.lastMove && (state.lastMove.from === i || state.lastMove.to === i);
          const landed = state.lastMove?.to === i;
          const isFocusPiece = coachHint?.focusSquare === i || coachHint?.arrow?.from === i;
          const isIdeaTo = ideaTo === i;
          const clickable = myTurn && (isTarget || movable.has(i));
          const [r, c] = rc(i);
          const color = colorOf(cell);
          const label = cell
            ? `Row ${8 - r} column ${c + 1}, ${color === 'w' ? 'white' : 'black'} ${isKing(cell) ? 'king' : 'piece'}`
            : `Row ${8 - r} column ${c + 1}, empty`;
          const cls = [
            styles.sq,
            dark ? styles.damaDark : styles.damaLight,
            isLast ? styles.sqLast : '',
            selected === i ? styles.sqSelected : '',
            isFocusPiece ? styles.sqCoachFrom : '',
            isIdeaTo ? styles.sqCoachTo : '',
            captured.has(i) ? styles.sqCaptured : '',
            clickable ? styles.sqClickable : '',
          ].join(' ');
          return (
            <button key={i} type="button" className={cls} onClick={() => tap(i)} aria-label={label} tabIndex={clickable ? 0 : -1} disabled={!dark}>
              {isFocusPiece && !isIdeaTo && <span className={styles.coachBadge}>Clue</span>}
              {cell && (
                <span
                  key={landed ? `${i}:${JSON.stringify(state.lastMove)}` : i}
                  className={[
                    styles.disc,
                    color === 'w' ? styles.discLight : styles.discDark,
                    myTurn && movable.has(i) && selected === null ? styles.discMovable : '',
                    landed ? styles.pop : '',
                  ].join(' ')}
                >
                  {isKing(cell) && <AppIcon name="crown" size="58%" strokeWidth={2.6} />}
                </span>
              )}
              {isTarget && <span className={styles.hint} />}
            </button>
          );
        })}
        {coachHint?.arrow && <DamaCoachArrowOverlay arrow={coachHint.arrow} seat={seat} />}
      </div>
    </div>
  );
}

/** Pieces of `color` taken by the opponent so far. */
export function damaLost(raw: unknown, color: 'w' | 'b'): number {
  const left = parseDama(raw).board.filter((c) => colorOf(c) === color).length;
  return Math.max(0, 12 - left);
}

/** Small "captured" badge for a player card. */
export function DamaCaptured({ count, color }: { count: number; color: 'w' | 'b' }) {
  if (count <= 0) return null;
  return (
    <span className={styles.capturedRow} aria-label={`Captured ${count}`}>
      <span
        className={`${styles.disc} ${color === 'w' ? styles.discLight : styles.discDark}`}
        style={{ width: 12, height: 12, boxShadow: 'none', borderWidth: 1.5 }}
        aria-hidden
      />
      <span className={styles.lead}>x{count}</span>
    </span>
  );
}

export function damaStatus(raw: unknown): string | null {
  const o = damaOutcome(parseDama(raw));
  if (!o.over) return null;
  return o.winner ? 'No moves left' : 'Draw by quiet play';
}
