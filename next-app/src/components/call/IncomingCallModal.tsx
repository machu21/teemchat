'use client';

import React from 'react';
import styles from './IncomingCallModal.module.css';
import { useCallStore } from '@/stores/call';
import { useSessionStore } from '@/stores/session';
import { PixelAvatar } from '@/components/neo/PixelAvatar';
import { defaultAvatarConfig } from '@/lib/models/avatar';
import { AppIcon } from '@/components/icons/AppIcon';

export function IncomingCallModal() {
  const { incomingCall, acceptIncomingCall, declineIncomingCall, voiceOnly } = useCallStore();
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
      <div
        className={styles.modalCard}
        role="alertdialog"
        aria-modal="true"
        aria-label={`Incoming call from ${incomingCall.callerName}`}
      >
        <div className={styles.avatarRing}>
          <div className={styles.pulseEffect} />
          <PixelAvatar
            config={incomingCall.callerAvatar || defaultAvatarConfig}
            size={72}
          />
        </div>

        <span className={styles.callTypeBadge}>
          {incomingCall.isVideo && !voiceOnly ? <><AppIcon name="video" /> Incoming Video Call</> : <><AppIcon name="phone" /> Incoming Voice Call</>}
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
            <AppIcon name="close" /> Decline
          </button>

          <button
            type="button"
            className={`${styles.btn} ${styles.acceptVoiceBtn}`}
            onClick={() => handleAccept(false)}
          >
            <AppIcon name="mic" /> Voice
          </button>

          {!voiceOnly && (
            <button
              type="button"
              className={`${styles.btn} ${styles.acceptVideoBtn}`}
              onClick={() => handleAccept(true)}
            >
              <AppIcon name="video" /> Video
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
