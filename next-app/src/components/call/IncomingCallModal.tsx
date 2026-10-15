'use client';

import React from 'react';
import styles from './IncomingCallModal.module.css';
import { useCallStore } from '@/stores/call';
import { useSessionStore } from '@/stores/session';
import { PixelAvatar } from '@/components/neo/PixelAvatar';
import { defaultAvatarConfig } from '@/lib/models/avatar';

export function IncomingCallModal() {
  const { incomingCall, acceptIncomingCall, declineIncomingCall } = useCallStore();
  const { session } = useSessionStore();

  if (!incomingCall) return null;

  const handleAccept = (withVideo: boolean) => {
    if (!session) return;
    acceptIncomingCall(withVideo, {
      id: session.id,
      name: session.displayName,
      avatarConfig: session.avatarConfig,
    });
  };

  return (
    <div className={styles.backdrop}>
      <div className={styles.modalCard}>
        <div className={styles.avatarRing}>
          <div className={styles.pulseEffect} />
          <PixelAvatar
            config={incomingCall.callerAvatar || defaultAvatarConfig}
            size={72}
          />
        </div>

        <span className={styles.callTypeBadge}>
          {incomingCall.isVideo ? '📹 Incoming Video Call' : '📞 Incoming Voice Call'}
        </span>

        <h3 className={styles.callerName}>{incomingCall.callerName}</h3>
        <p className={styles.callerStatus}>
          {incomingCall.type === 'dm'
            ? 'is calling you...'
            : `started a call in ${incomingCall.title}`}
        </p>

        <div className={styles.actionsRow}>
          <button
            type="button"
            className={`${styles.btn} ${styles.declineBtn}`}
            onClick={declineIncomingCall}
          >
            ✕ Decline
          </button>

          <button
            type="button"
            className={`${styles.btn} ${styles.acceptVoiceBtn}`}
            onClick={() => handleAccept(false)}
          >
            🎙️ Voice
          </button>

          <button
            type="button"
            className={`${styles.btn} ${styles.acceptVideoBtn}`}
            onClick={() => handleAccept(true)}
          >
            📹 Video
          </button>
        </div>
      </div>
    </div>
  );
}
