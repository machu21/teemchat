'use client';

import React from 'react';
import styles from './ChatGames.module.css';
import { AppIcon } from '@/components/icons/AppIcon';
import { GAME_INFO, INVITE_TTL_MS, type ChatGameRow, type GameKind } from '@/lib/games/types';
import { TIME_CONTROLS } from '@/lib/games/clock';
import { ACCENT_CLASS } from './GameShell';

interface Props {
  kind: GameKind;
  row: ChatGameRow | undefined;
  senderName: string;
  createdAt: string;
  meId: string;
  /** Current time, passed in so rendering stays pure. */
  now: number;
  onOpen: () => void;
}

function subtitle(row: ChatGameRow | undefined, meId: string, expired: boolean): string {
  if (!row) return 'Loading...';
  switch (row.status) {
    case 'invited':
      return expired ? 'Invite expired' : row.playerOne === meId ? 'Waiting for a player' : 'Tap to accept';
    case 'active':
      return row.currentTurn === meId ? 'Your move' : 'In progress';
    case 'finished':
      if (!row.winner) return 'Draw';
      return row.winner === meId ? 'You won' : 'Finished';
    case 'declined':
      return 'Declined';
    case 'abandoned':
      return 'Cancelled';
  }
}

export function GameInviteCard({ kind, row, senderName, createdAt, meId, now, onOpen }: Props) {
  const info = GAME_INFO[kind];
  const expired = row?.status === 'invited' && now - new Date(createdAt).getTime() > INVITE_TTL_MS;
  const isPlayer = row ? row.playerOne === meId || row.playerTwo === meId : false;
  const label = !row
    ? 'Open'
    : row.status === 'invited'
      ? row.playerOne === meId || expired ? 'View' : 'Play'
      : row.status === 'active'
        ? isPlayer ? 'Play' : 'Watch'
        : 'View';
  const tc = row && row.timeBaseMs > 0 ? TIME_CONTROLS.find((t) => t.baseMs === row.timeBaseMs && t.incMs === row.timeIncMs)?.label : null;

  return (
    <div className={`${styles.root} ${styles.inviteCard} ${ACCENT_CLASS[kind]}`}>
      <span className={styles.inviteStripe}>
        <AppIcon name={info.icon} />
      </span>
      <div className={styles.inviteMain}>
        <div className={styles.inviteTitle}>
          {senderName} started {info.title}
        </div>
        <div className={styles.inviteSub}>
          {subtitle(row, meId, expired)}
          {tc ? ` · ${tc}` : ''} · {new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
      <div className={styles.inviteActions}>
        <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={onOpen}>
          {label}
        </button>
      </div>
    </div>
  );
}
