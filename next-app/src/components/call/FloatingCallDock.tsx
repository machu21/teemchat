'use client';

import React from 'react';
import styles from './FloatingCallDock.module.css';
import { useCallStore } from '@/stores/call';
import {
  MicIcon,
  MicOffIcon,
  VideoIcon,
  VideoOffIcon,
  MaximizeIcon,
  PhoneOffIcon,
} from '@/components/icons/DockIcons';

export function FloatingCallDock() {
  const {
    currentCall,
    status,
    isStageMaximized,
    isMicMuted,
    isCameraActive,
    callDurationSeconds,
    participants,
    toggleMic,
    toggleCamera,
    leaveCall,
    setStageMaximized,
    setMinimized,
  } = useCallStore();

  // Show dock when call is active, but not when full stage modal is open
  if (status !== 'connected' || !currentCall || isStageMaximized) {
    return null;
  }

  const mins = Math.floor(callDurationSeconds / 60);
  const secs = callDurationSeconds % 60;
  const formattedDuration = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  return (
    <div className={styles.floatingDock}>
      {/* Click info to expand stage */}
      <div
        className={styles.callInfo}
        onClick={() => {
          setStageMaximized(true);
          setMinimized(false);
        }}
        title="Open Call Stage"
      >
        <div className={styles.callTitle}>
          <span className={styles.greenDot} />
          <span>{currentCall.title}</span>
        </div>
        <div className={styles.callSubtext}>
          {formattedDuration} • {participants.length} connected
        </div>
      </div>

      {/* Quick Mute */}
      <button
        type="button"
        className={`${styles.actionBtn} ${isMicMuted ? styles.mutedBtn : styles.activeBtn}`}
        onClick={toggleMic}
        title={isMicMuted ? 'Unmute' : 'Mute'}
        aria-label={isMicMuted ? 'Unmute' : 'Mute'}
      >
        {isMicMuted ? <MicOffIcon size={18} /> : <MicIcon size={18} />}
      </button>

      {/* Quick Camera */}
      <button
        type="button"
        className={`${styles.actionBtn} ${isCameraActive ? styles.activeBtn : ''}`}
        onClick={toggleCamera}
        title={isCameraActive ? 'Turn off camera' : 'Turn on camera'}
        aria-label={isCameraActive ? 'Turn off camera' : 'Turn on camera'}
      >
        {isCameraActive ? <VideoIcon size={18} /> : <VideoOffIcon size={18} />}
      </button>

      {/* Expand Stage */}
      <button
        type="button"
        className={`${styles.actionBtn} ${styles.expandBtn}`}
        onClick={() => {
          setStageMaximized(true);
          setMinimized(false);
        }}
        title="Expand Stage"
        aria-label="Expand Stage"
      >
        <MaximizeIcon size={18} />
      </button>

      {/* Leave */}
      <button
        type="button"
        className={`${styles.actionBtn} ${styles.dangerBtn}`}
        onClick={leaveCall}
        title="Leave Call"
        aria-label="Leave Call"
      >
        <PhoneOffIcon size={18} />
      </button>
    </div>
  );
}
