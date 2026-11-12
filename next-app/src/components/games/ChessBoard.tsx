'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import styles from './ChatGames.module.css';
import { AppIcon } from '@/components/icons/AppIcon';
import type { IconName } from '@/lib/icons';
import {
  applyChessMove,
  chessBoard,
  chessCaptured,
  chessOutcome,
  chessTargetsFrom,
  chessTurn,
  parseChess,
  type ChessPieceType,
  type PromotionPiece,
} from '@/lib/games/chess';
import type { ChessCoachHint, Seat, TurnBoardProps } from './boardTypes';

export const PIECE_ICON: Record<ChessPieceType, IconName> = {
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

function PieceIcon({ type, color, className }: { type: ChessPieceType; color: 'w' | 'b'; className?: string }) {
  return (
    <AppIcon
      name={PIECE_ICON[type]}
      className={className}
      size="86%"
      fill={color === 'w' ? '#fafafa' : '#1f1f23'}
      // Black pieces get a thin mid-grey outline: a thick light one swamps slim pieces (rook, pawn).
      color={color === 'w' ? '#18181b' : '#8b8b94'}
      strokeWidth={color === 'w' ? 1.5 : 1}
    />
  );
}

function squareToSvgCenter(square: string, seat: Seat): { x: number; y: number } | null {
  if (square.length !== 2) return null;
  const f = square.charCodeAt(0) - 97;
  const r = 8 - Number(square[1]);
  if (f < 0 || f > 7 || r < 0 || r > 7) return null;
  const col = seat === 'two' ? 7 - f : f;
  const row = seat === 'two' ? 7 - r : r;
  return { x: col * 100 + 50, y: row * 100 + 50 };
}

function CoachArrowOverlay({ arrow, seat }: { arrow: { from: string; to: string }; seat: Seat }) {
  const fromPt = squareToSvgCenter(arrow.from, seat);
  const toPt = squareToSvgCenter(arrow.to, seat);
  if (!fromPt || !toPt) return null;

  const dx = toPt.x - fromPt.x;
  const dy = toPt.y - fromPt.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return null;

  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;

  const startX = fromPt.x + ux * 18;
  const startY = fromPt.y + uy * 18;
  const tipX = toPt.x - ux * 10;
  const tipY = toPt.y - uy * 10;
  const headLen = 34;
  const headHalfWidth = 22;
  const shaftEndX = tipX - ux * (headLen - 6);
  const shaftEndY = tipY - uy * (headLen - 6);

  const headPoints = [
    `${tipX},${tipY}`,
    `${tipX - ux * headLen + px * headHalfWidth},${tipY - uy * headLen + py * headHalfWidth}`,
    `${tipX - ux * headLen - px * headHalfWidth},${tipY - uy * headLen - py * headHalfWidth}`,
  ].join(' ');

  return (
    <svg className={styles.coachArrowSvg} viewBox="0 0 800 800" aria-hidden="true">
      <circle cx={fromPt.x} cy={fromPt.y} r={34} fill="rgba(250, 204, 21, 0.28)" stroke="#18181b" strokeWidth={5} />
      <line
        x1={startX}
        y1={startY}
        x2={shaftEndX}
        y2={shaftEndY}
        stroke="#18181b"
        strokeWidth={22}
        strokeLinecap="round"
      />
      <line
        x1={startX}
        y1={startY}
        x2={shaftEndX}
        y2={shaftEndY}
        stroke="#facc15"
        strokeWidth={13}
        strokeLinecap="round"
      />
      <polygon points={headPoints} fill="#facc15" stroke="#18181b" strokeWidth={5} strokeLinejoin="round" />
    </svg>
  );
}

export function ChessBoard({
  state: raw,
  seat,
  canMove,
  onMove,
  coachHint,
}: TurnBoardProps & { coachHint?: ChessCoachHint | null }) {
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

  const myTurn = canMove && turn === myColor;
  const targets = useMemo(() => (selected ? chessTargetsFrom(state, selected) : []), [state, selected]);
  const ordered = seat === 'two' ? [...squares].reverse() : squares;
  const checkSquare =
    !outcome.over && outcome.check ? squares.find((s) => s.piece?.type === 'k' && s.piece.color === turn)?.square : undefined;
  const bottomRank = seat === 'two' ? '8' : '1';
  const leftFile = seat === 'two' ? 'h' : 'a';
  const threatenedSet = useMemo(() => new Set(coachHint?.threatenedSquares ?? []), [coachHint?.threatenedSquares]);

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
    if (!myTurn) return;
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
    <div className={styles.frame}>
      <div className={styles.grid8} role="grid" aria-label="Chess board">
        {ordered.map(({ square, piece }) => {
          const file = square[0];
          const rank = square[1];
          const dark = (square.charCodeAt(0) - 97 + Number(rank)) % 2 === 1; // a1 is dark
          const target = targets.find((t) => t.to === square);
          const isLast = state.lastMove && (state.lastMove.from === square || state.lastMove.to === square);
          const landed = state.lastMove?.to === square;
          const isThreatened = threatenedSet.has(square);
          const isFocusPiece = coachHint?.focusSquare === square || coachHint?.arrow?.from === square;
          const isIdeaTo = coachHint?.arrow?.to === square;
          const clickable = myTurn && (Boolean(target) || piece?.color === myColor);
          const cls = [
            styles.sq,
            dark ? styles.sqDark : styles.sqLight,
            isLast ? styles.sqLast : '',
            selected === square ? styles.sqSelected : '',
            isThreatened ? styles.sqThreatened : '',
            isFocusPiece ? styles.sqCoachFrom : '',
            isIdeaTo ? styles.sqCoachTo : '',
            checkSquare === square ? styles.sqCheck : '',
            clickable ? styles.sqClickable : '',
          ].join(' ');
          const label = piece ? `${square}, ${piece.color === 'w' ? 'white' : 'black'} ${PIECE_NAME[piece.type]}` : `${square}, empty`;
          const coordColor = dark ? styles.coordOnDark : styles.coordOnLight;
          return (
            <button key={square} type="button" className={cls} onClick={() => tap(square)} aria-label={label} tabIndex={clickable ? 0 : -1}>
              {file === leftFile && <span className={`${styles.coordRank} ${coordColor}`}>{rank}</span>}
              {rank === bottomRank && <span className={`${styles.coordFile} ${coordColor}`}>{file}</span>}
              {isFocusPiece && !isIdeaTo && <span className={styles.coachBadge}>Clue</span>}
              {piece && (
                <PieceIcon
                  key={landed ? `${square}:${state.history.length}` : square}
                  type={piece.type}
                  color={piece.color}
                  className={`${styles.piece} ${landed ? styles.pop : ''}`}
                />
              )}
              {target && (piece ? <span className={styles.hintCapture} /> : <span className={styles.hint} />)}
            </button>
          );
        })}
        {coachHint?.arrow && <CoachArrowOverlay arrow={coachHint.arrow} seat={seat} />}
      </div>

      {promo && (
        <div className={styles.promoSheet}>
          <div className={styles.promoCard} role="group" aria-label="Promote pawn to">
            Promote to
            <div className={styles.promoRow}>
              {PROMOTIONS.map((p) => (
                <button key={p} type="button" className={styles.promoBtn} onClick={() => commit(promo.from, promo.to, p)} aria-label={`Promote to ${PIECE_NAME[p]}`}>
                  <PieceIcon type={p} color={myColor} />
                </button>
              ))}
            </div>
            <button type="button" className={styles.btn} onClick={() => setPromo(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Small captured-piece row and material lead for a player card. */
export function ChessCaptured({ state: raw, color }: { state: unknown; color: 'w' | 'b' }) {
  const { byWhite, byBlack, material } = chessCaptured(parseChess(raw));
  const list = color === 'w' ? byWhite : byBlack;
  const lead = color === 'w' ? material : -material;
  if (list.length === 0 && lead <= 0) return null;
  return (
    <span className={styles.capturedRow} aria-label={`Captured ${list.length} pieces`}>
      {list.map((t, i) => (
        <AppIcon
          key={i}
          name={PIECE_ICON[t]}
          size={14}
          fill={color === 'w' ? '#27272a' : '#fafafa'}
          color={color === 'w' ? '#d4d4d8' : '#18181b'}
          strokeWidth={1.5}
        />
      ))}
      {lead > 0 && <span className={styles.lead}>+{lead}</span>}
    </span>
  );
}

/** Horizontal move list ("1. e4 e5 2. Nf3 ..."), scrolled to the latest move. */
export function MoveList({ state: raw }: { state: unknown }) {
  const { history } = parseChess(raw);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    // Horizontal strip on phones, wrapped column on wide screens: follow the latest move in both.
    if (ref.current) {
      ref.current.scrollLeft = ref.current.scrollWidth;
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [history.length]);
  return (
    <div className={styles.moveList} ref={ref} aria-label="Moves">
      {history.length === 0 && <span className={styles.moveEmpty}>No moves yet</span>}
      {history.map((san, i) => (
        <React.Fragment key={i}>
          {i % 2 === 0 && <span className={styles.moveNo}>{i / 2 + 1}.</span>}
          <span className={`${styles.moveSan} ${i === history.length - 1 ? styles.moveSanLast : ''}`}>{san}</span>
        </React.Fragment>
      ))}
    </div>
  );
}

/** Status word for chess (check / mate / stalemate). */
export function chessStatus(raw: unknown): string | null {
  const o = chessOutcome(parseChess(raw));
  if (!o.over) return o.check ? 'Check' : null;
  if (o.reason === 'checkmate') return 'Checkmate';
  if (o.reason === 'stalemate') return 'Stalemate';
  return 'Draw';
}
