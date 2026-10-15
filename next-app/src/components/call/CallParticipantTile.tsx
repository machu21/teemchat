'use client';

import React, { useEffect, useRef } from 'react';
import styles from './CallParticipantTile.module.css';
import { CallParticipantModel } from '@/lib/models/call';
import { PixelAvatar } from '@/components/neo/PixelAvatar';
import { defaultAvatarConfig } from '@/lib/models/avatar';
import { attachTrackToElement } from '@/lib/services/livekit';

interface CallParticipantTileProps {
  participant: CallParticipantModel;
  isPinned?: boolean;
  onPin?: () => void;
  showPinBtn?: boolean;
}

export function CallParticipantTile({
  participant,
  isPinned = false,
  onPin,
  showPinBtn = true,
}: CallParticipantTileProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Attach video track when available
  useEffect(() => {
    const el = videoRef.current;
    const track = participant.screenTrack || participant.videoTrack;
    return attachTrackToElement(track, el);
  }, [participant.videoTrack, participant.screenTrack]);

  const hasActiveVideo = Boolean(
    participant.isScreenSharing
      ? participant.screenTrack
      : participant.isCameraOn && participant.videoTrack
  );

  return (
    <div
      className={`${styles.tileCard} ${participant.isSpeaking ? styles.speakingGlow : ''}`}
    >
      {/* Video View */}
      {hasActiveVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={participant.isLocal} // Avoid local echo
          className={`${styles.videoElement} ${
            participant.isLocal && !participant.isScreenSharing ? styles.mirrored : ''
          }`}
        />
      ) : (
        /* Fallback Pixel Avatar View */
        <div className={styles.avatarContainer}>
          {participant.isSpeaking && <div className={styles.speakingPulse} />}
          <div className={styles.avatarWrapper}>
            <PixelAvatar
              config={participant.avatarConfig || defaultAvatarConfig}
              size={56}
            />
          </div>
        </div>
      )}

      {/* Pin Tile Button */}
      {showPinBtn && onPin && (
        <button
          type="button"
          className={styles.pinBtn}
          onClick={onPin}
          title={isPinned ? 'Unpin participant' : 'Pin to main stage'}
        >
          {isPinned ? '📌 Pinned' : '📌 Pin'}
        </button>
      )}

      {/* Name and State Pill */}
      <div className={styles.nameBadge}>
        <span>{participant.name}</span>
        {participant.isScreenSharing && (
          <span className={styles.screenShareBadge}>LIVE</span>
        )}
        {participant.isMuted ? (
          <span className={`${styles.statusIcon} ${styles.mutedIcon}`} title="Muted">
            🔇
          </span>
        ) : participant.isSpeaking ? (
          <span className={styles.statusIcon} title="Speaking">
            🟢
          </span>
        ) : null}
      </div>
    </div>
  );
}
