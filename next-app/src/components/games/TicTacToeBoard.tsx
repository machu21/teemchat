'use client';

import React, { useMemo } from 'react';
import styles from './ChatGames.module.css';
import { AppIcon } from '@/components/icons/AppIcon';
import { applyTttMove, parseTtt, tttIsDraw, tttWinner } from '@/lib/games/tictactoe';
import type { TttCoachHint, TurnBoardProps } from './boardTypes';

function Mark({ mark, ghost }: { mark: 'X' | 'O'; ghost?: boolean }) {
  return mark === 'X' ? (
    <AppIcon name="close" size="72%" strokeWidth={3.2} className={ghost ? styles.ghost : styles.pop} />
  ) : (
    <AppIcon name="dot" size="64%" strokeWidth={3.2} className={ghost ? styles.ghost : styles.pop} />
  );
}

export function TicTacToeBoard({
  state: raw,
  seat,
  canMove,
  onMove,
  coachHint,
}: TurnBoardProps & { coachHint?: TttCoachHint | null }) {
  const state = useMemo(() => parseTtt(raw), [raw]);
  const win = tttWinner(state);
  const myMark = seat === 'two' ? 'O' : 'X';

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
    <div className={styles.tttFrame}>
      <div className={styles.tttGrid} role="grid" aria-label="Tic-Tac-Toe board">
        {state.board.map((mark, i) => {
          const inLine = win?.line.includes(i);
          const open = canMove && mark === '' && !win;
          const isCoach = open && coachHint?.focusCell === i;
          return (
            <button
              key={i}
              type="button"
              className={`${styles.cell} ${mark === 'X' ? styles.cellX : mark === 'O' ? styles.cellO : ''} ${inLine ? styles.cellWin : ''} ${isCoach ? styles.cellCoach : ''}`}
              onClick={() => play(i)}
              disabled={!open}
              aria-label={mark ? `Cell ${i + 1}, ${mark}` : `Cell ${i + 1}, empty${isCoach ? ', clue highlighted' : ''}`}
            >
              {isCoach && <span className={styles.coachBadge}>Clue</span>}
              {mark ? <Mark mark={mark} /> : open ? <Mark mark={myMark} ghost /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
