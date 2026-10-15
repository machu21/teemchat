'use client';

import React from 'react';
import styles from './InlineCallPanel.module.css';
import { useCallStore } from '@/stores/call';
import { CallParticipantTile } from './CallParticipantTile';
import { CallControls } from './CallControls';

export function InlineCallPanel() {
  const {
    currentCall,
    status,
    participants,
    callDurationSeconds,
    setStageMaximized,
  } = useCallStore();

  if (status !== 'connected' || !currentCall) {
    return null;
  }

  const mins = Math.floor(callDurationSeconds / 60);
  const secs = callDurationSeconds % 60;
  const formattedDuration = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  return (
    <div className={styles.inlinePanel}>
      <div className={styles.panelHeader}>
        <div className={styles.headerLeft}>
          <div className={styles.liveDot} />
          <span className={styles.panelTitle}>
            {currentCall.type === 'dm' ? 'Voice / Video Call' : 'Squad Call'}
          </span>
          <span className={styles.durationBadge}>{formattedDuration}</span>
        </div>

        <button
          type="button"
          className={styles.expandBtn}
          onClick={() => setStageMaximized(true)}
          title="Expand to Full Stage"
        >
          ⤢ Stage Mode
        </button>
      </div>

      {/* Participant Strip */}
      <div className={styles.participantStrip}>
        {participants.map((p) => (
          <div key={p.id} className={styles.stripTile}>
            <CallParticipantTile participant={p} showPinBtn={false} />
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className={styles.controlsRow}>
        <CallControls
          onToggleStage={() => setStageMaximized(true)}
          isStageMaximized={false}
        />
      </div>
    </div>
  );
}
