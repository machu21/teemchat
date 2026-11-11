'use client';

import React from 'react';
import styles from './ChatGames.module.css';
import { NeoModal } from '@/components/neo/NeoModal';
import { AppIcon } from '@/components/icons/AppIcon';
import { GAME_INFO, GAME_KINDS, type GameKind } from '@/lib/games/types';

interface Props {
  isOpen: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onPick: (kind: GameKind) => void;
}

export function GamePicker({ isOpen, busy, error, onClose, onPick }: Props) {
  return (
    <NeoModal isOpen={isOpen} onClose={onClose} title="Play a game" maxWidth="440px">
      <div className={styles.pickerGrid}>
        {GAME_KINDS.map((kind) => {
          const g = GAME_INFO[kind];
          return (
            <button key={kind} type="button" className={styles.pickerItem} disabled={busy} onClick={() => onPick(kind)}>
              <span className={styles.pickerIcon}><AppIcon name={g.icon} /></span>
              <span className={styles.pickerName}>{g.title}</span>
              <span className={styles.pickerBlurb}>{g.blurb}</span>
            </button>
          );
        })}
      </div>
      {error && (
        <div className={`${styles.status} ${styles.statusError}`} role="alert">
          {error}
        </div>
      )}
    </NeoModal>
  );
}
