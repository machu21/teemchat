'use client';

import React, { useMemo, useState } from 'react';
import styles from './ChatGames.module.css';
import { AppIcon } from '@/components/icons/AppIcon';
import type { IconName } from '@/lib/icons';
import {
  applyChessMove,
  chessBoard,
  chessOutcome,
  chessTargetsFrom,
  chessTurn,
  parseChess,
  type ChessPieceType,
  type PromotionPiece,
} from '@/lib/games/chess';
import type { TurnBoardProps } from './boardTypes';

const PIECE_ICON: Record<ChessPieceType, IconName> = {
  k: 'chessKing',
  q: 'chessQueen',
  r: 'chessRook',
  b: 'chessBishop',
  n: 'chessKnight',
  p: 'chessPawn',
};
const PIECE_NAME: Record<ChessPieceType, string> = {
  k: 'king',
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
  p: 'pawn',
};
const PROMOTIONS: PromotionPiece[] = ['q', 'r', 'b', 'n'];

export function ChessBoard({ state: raw, seat, canMove, onMove }: TurnBoardProps) {
  const state = useMemo(() => parseChess(raw), [raw]);
  const squares = useMemo(() => chessBoard(state), [state]);
  const outcome = useMemo(() => chessOutcome(state), [state]);
  const turn = chessTurn(state);
  const myColor = seat === 'two' ? 'b' : 'w';
  const [selected, setSelected] = useState<string | null>(null);
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(null);
  // Forget a selection made on an older position.
  const [selFen, setSelFen] = useState(state.fen);
  if (selFen !== state.fen) {
    setSelFen(state.fen);
    setSelected(null);
    setPromo(null);
  }

  const targets = useMemo(
    () => (selected ? chessTargetsFrom(state, selected) : []),
    [state, selected]
  );
  const ordered = seat === 'two' ? [...squares].reverse() : squares;
  const checkSquare =
    !outcome.over && outcome.check
      ? squares.find((s) => s.piece?.type === 'k' && s.piece.color === turn)?.square
      : undefined;

  const commit = (from: string, to: string, promotion?: PromotionPiece) => {
    const next = applyChessMove(state, from, to, promotion);
    setSelected(null);
    setPromo(null);
    if (!next) return;
    const o = chessOutcome(next);
    onMove({
      state: next,
      finished: o.over,
      winner: o.over && o.winner ? (o.winner === 'w' ? 'one' : 'two') : null,
    });
  };

  const tap = (square: string) => {
    if (!canMove || turn !== myColor) return;
    const target = targets.find((t) => t.to === square);
    if (selected && target) {
      if (target.promotion) setPromo({ from: selected, to: square });
      else commit(selected, square);
      return;
    }
    const piece = squares.find((s) => s.square === square)?.piece;
    setSelected(piece && piece.color === myColor && square !== selected ? square : null);
  };

  return (
    <>
      <div className={styles.grid8} role="grid" aria-label="Chess board">
        {ordered.map(({ square, piece }) => {
          const file = square.charCodeAt(0) - 97;
          const rank = Number(square[1]);
          const dark = (file + rank) % 2 === 1; // a1 is dark
          const isTarget = targets.some((t) => t.to === square);
          const isLast = state.lastMove && (state.lastMove.from === square || state.lastMove.to === square);
          const clickable = canMove && (isTarget || piece?.color === myColor);
          const cls = [
            styles.square,
            dark ? styles.squareDark : styles.squareLight,
            isLast ? styles.squareLastMove : '',
            selected === square ? styles.squareSelected : '',
            checkSquare === square ? styles.squareCheck : '',
            isTarget ? styles.target : '',
            clickable ? styles.squareClickable : '',
          ].join(' ');
          const label = piece
            ? `${square}, ${piece.color === 'w' ? 'white' : 'black'} ${PIECE_NAME[piece.type]}`
            : `${square}, empty`;
          return (
            <button key={square} type="button" className={cls} onClick={() => tap(square)} aria-label={label} tabIndex={clickable ? 0 : -1}>
              {piece && (
                <AppIcon
                  name={PIECE_ICON[piece.type]}
                  className={styles.pieceIcon}
                  size="82%"
                  fill={piece.color === 'w' ? '#fafafa' : '#18181b'}
                  color={piece.color === 'w' ? '#18181b' : '#a1a1aa'}
                  strokeWidth={1.6}
                />
              )}
            </button>
          );
        })}
      </div>

      {promo && (
        <div className={styles.promoRow} role="group" aria-label="Promote pawn to">
          {PROMOTIONS.map((p) => (
            <button key={p} type="button" className={styles.smallBtn} onClick={() => commit(promo.from, promo.to, p)} aria-label={`Promote to ${PIECE_NAME[p]}`}>
              <AppIcon name={PIECE_ICON[p]} size={22} />
            </button>
          ))}
          <button type="button" className={styles.smallBtn} onClick={() => setPromo(null)} aria-label="Cancel promotion">
            <AppIcon name="close" />
          </button>
        </div>
      )}
    </>
  );
}

/** Status line for chess (check / mate / stalemate). */
export function chessStatus(raw: unknown): string | null {
  const o = chessOutcome(parseChess(raw));
  if (!o.over) return o.check ? 'Check' : null;
  if (o.reason === 'checkmate') return 'Checkmate';
  if (o.reason === 'stalemate') return 'Stalemate';
  return 'Draw';
}
