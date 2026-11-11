'use client';

import React, { useMemo, useState } from 'react';
import styles from './ChatGames.module.css';
import { AppIcon } from '@/components/icons/AppIcon';
import {
  applyDamaMove,
  colorOf,
  damaLegalMoves,
  damaOutcome,
  isDark,
  isKing,
  parseDama,
  rc,
} from '@/lib/games/dama';
import type { TurnBoardProps } from './boardTypes';

export function DamaBoard({ state: raw, seat, canMove, onMove }: TurnBoardProps) {
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
  const mustCapture = legal.some((m) => m.captures.length > 0);

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
  const lastCaptured = new Set(state.lastMove?.captures ?? []);

  return (
    <>
      <div className={styles.grid8} role="grid" aria-label="Dama board">
        {order.map((i) => {
          const cell = state.board[i];
          const dark = isDark(i);
          const isTarget = targets.has(i);
          const isLast = state.lastMove && (state.lastMove.from === i || state.lastMove.to === i || lastCaptured.has(i));
          const clickable = myTurn && (isTarget || movable.has(i));
          const [r, c] = rc(i);
          const color = colorOf(cell);
          const label = cell
            ? `Row ${8 - r} column ${c + 1}, ${color === 'w' ? 'white' : 'black'} ${isKing(cell) ? 'king' : 'piece'}`
            : `Row ${8 - r} column ${c + 1}, empty`;
          const cls = [
            styles.square,
            dark ? styles.squareDark : styles.squareLight,
            isLast ? styles.squareLastMove : '',
            selected === i ? styles.squareSelected : '',
            isTarget ? styles.target : '',
            clickable ? styles.squareClickable : '',
          ].join(' ');
          return (
            <button key={i} type="button" className={cls} onClick={() => tap(i)} aria-label={label} tabIndex={clickable ? 0 : -1} disabled={!dark}>
              {cell && (
                <span className={`${styles.disc} ${color === 'w' ? styles.discLight : styles.discDark}`}>
                  {isKing(cell) && <AppIcon name="crown" size="60%" strokeWidth={2.5} />}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {myTurn && mustCapture && <div className={styles.status}>You must capture.</div>}
    </>
  );
}

export function damaStatus(raw: unknown): string | null {
  const o = damaOutcome(parseDama(raw));
  if (!o.over) return null;
  return o.winner ? 'No moves left' : 'Draw';
}
