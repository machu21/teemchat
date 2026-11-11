'use client';

import React from 'react';
import styles from './ChatGames.module.css';
import { AppIcon } from '@/components/icons/AppIcon';
import { GAME_INFO, INVITE_TTL_MS, type ChatGameRow, type GameKind } from '@/lib/games/types';

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
      return expired ? 'Invite expired' : 'Waiting for a player';
    case 'active':
      return row.currentTurn === meId ? 'Your turn' : 'In progress';
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
  const label = !row
    ? 'Open'
    : row.status === 'invited'
      ? row.playerOne === meId || expired ? 'View' : 'Play'
      : row.status === 'active'
        ? row.playerOne === meId || row.playerTwo === meId ? 'Play' : 'Watch'
        : 'View';

  return (
    <div className={styles.inviteCard}>
      <div className={styles.inviteLeft}>
        <span className={styles.inviteIcon}><AppIcon name={info.icon} /></span>
        <div>
          <div className={styles.inviteTitle}>
            {senderName} started {info.title}
          </div>
          <div className={styles.inviteSub}>
            {subtitle(row, meId, expired)} ·{' '}
            {new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>
      <div className={styles.inviteActions}>
        <button type="button" className={`${styles.smallBtn} ${styles.primaryBtn}`} onClick={onOpen}>
          {label}
        </button>
      </div>
    </div>
  );
}
