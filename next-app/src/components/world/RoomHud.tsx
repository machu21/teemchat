'use client';

import React from 'react';
import type { RoomDefinition } from '@/lib/world/rooms';
import type { PendingKnock } from '@/lib/hooks/useWorldSocial';
import styles from './WorldSocial.module.css';

interface RoomHudProps {
  room: RoomDefinition | null;
  roomCount: number;
  roomLocked: boolean;
  onToggleLock: () => void;
  knockTarget: RoomDefinition | null;
  onKnock: () => void;
  knocks: PendingKnock[];
  onAnswerKnock: (knock: PendingKnock, allow: boolean) => void;
  /** Filters names shown in knock cards (viewer's chat filter). */
  safeText: (text: string) => string;
  /** Extra room tools under the badge (focus timer, notes). */
  children?: React.ReactNode;
}

/** Private room badge (inside), Knock prompt (outside a locked room) and knock requests. */
export function RoomHud({
  room,
  roomCount,
  roomLocked,
  onToggleLock,
  knockTarget,
  onKnock,
  knocks,
  onAnswerKnock,
  safeText,
  children,
}: RoomHudProps) {
  if (!room && !knockTarget && knocks.length === 0) return null;

  return (
    <div className={styles.roomHud} aria-live="polite">
      {room && (
        <div className={styles.roomBadge}>
          <span>
            {room.icon} {room.name} · {roomCount} {roomCount === 1 ? 'person' : 'people'} · 🔇 voice stays inside
          </span>
          <button type="button" className={styles.hudBtn} aria-pressed={roomLocked} onClick={onToggleLock}>
            {roomLocked ? '🔒 Locked' : '🔓 Lock'}
          </button>
        </div>
      )}

      {room && children}

      {!room && knockTarget && (
        <div className={styles.knockPrompt}>
          <span>
            🔒 {knockTarget.name} is locked
          </span>
          <button type="button" className={`${styles.hudBtn} ${styles.hudBtnPrimary}`} onClick={onKnock}>
            ✊ Knock
          </button>
        </div>
      )}

      {knocks.map((k) => (
        <div key={`${k.roomId}:${k.actorId}`} className={styles.knockCard} role="alert">
          <span>✊ {safeText(k.actorName)} is knocking</span>
          <button type="button" className={`${styles.hudBtn} ${styles.hudBtnPrimary}`} onClick={() => onAnswerKnock(k, true)}>
            Let in
          </button>
          <button type="button" className={styles.hudBtn} onClick={() => onAnswerKnock(k, false)}>
            Ignore
          </button>
        </div>
      ))}
    </div>
  );
}
