'use client';

import React, { useMemo } from 'react';
import styles from './ChatGames.module.css';
import { AppIcon } from '@/components/icons/AppIcon';
import { applyTttMove, parseTtt, tttIsDraw, tttWinner } from '@/lib/games/tictactoe';
import type { TurnBoardProps } from './boardTypes';

export function TicTacToeBoard({ state: raw, canMove, onMove }: TurnBoardProps) {
  const state = useMemo(() => parseTtt(raw), [raw]);
  const win = tttWinner(state);

  const play = (cell: number) => {
    if (!canMove) return;
    const next = applyTttMove(state, cell);
    if (!next) return;
    const w = tttWinner(next);
    onMove({
      state: next,
      finished: Boolean(w) || tttIsDraw(next),
      winner: w ? (w.mark === 'X' ? 'one' : 'two') : null,
    });
  };

  return (
    <div className={styles.tttGrid} role="grid" aria-label="Tic-Tac-Toe board">
      {state.board.map((mark, i) => {
        const inLine = win?.line.includes(i);
        const label = mark ? `Cell ${i + 1}, ${mark}` : `Cell ${i + 1}, empty`;
        return (
          <button
            key={i}
            type="button"
            className={`${styles.cell} ${inLine ? styles.cellWin : ''}`}
            onClick={() => play(i)}
            disabled={!canMove || mark !== '' || Boolean(win)}
            aria-label={label}
          >
            {mark === 'X' && <AppIcon name="close" size="70%" strokeWidth={3} />}
            {mark === 'O' && <AppIcon name="dot" size="62%" strokeWidth={3} />}
          </button>
        );
      })}
    </div>
  );
}
