'use client';

import React, { useState, useRef, useEffect } from 'react';
import styles from './CallStageModal.module.css';
import { useCallStore } from '@/stores/call';
import { CallControls } from './CallControls';
import { CallParticipantTile } from './CallParticipantTile';
import { attachTrackToElement } from '@/lib/services/livekit';
import { MinimizeIcon } from '@/components/icons/DockIcons';

export function CallStageModal() {
  const {
    currentCall,
    status,
    isStageMaximized,
    setStageMaximized,
    setMinimized,
    participants,
    callDurationSeconds,
  } = useCallStore();

  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const theaterVideoRef = useRef<HTMLVideoElement | null>(null);

  // Find active screen sharer or pinned participant
  const screenSharer = participants.find((p) => p.isScreenSharing && p.screenTrack);
  const pinnedParticipant = pinnedId
    ? participants.find((p) => p.id === pinnedId)
    : null;

  const theaterParticipant = screenSharer || pinnedParticipant;

  // Attach theater track
  useEffect(() => {
    const el = theaterVideoRef.current;
    if (!theaterParticipant) {
      if (el) el.srcObject = null;
      return;
    }

    const track = theaterParticipant.isScreenSharing
      ? theaterParticipant.screenTrack
      : theaterParticipant.videoTrack;

    return attachTrackToElement(track, el);
  }, [theaterParticipant, screenSharer]);

  // If not connected or not maximized, do not render
  if (status !== 'connected' || !currentCall || !isStageMaximized) {
    return null;
  }

  // Format call duration MM:SS
  const mins = Math.floor(callDurationSeconds / 60);
  const secs = callDurationSeconds % 60;
  const formattedDuration = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  // Determine grid CSS class based on participant count
  const getGridClass = (count: number) => {
    if (count <= 1) return styles.grid1;
    if (count === 2) return styles.grid2;
    if (count === 3) return styles.grid3;
    if (count === 4) return styles.grid4;
    return styles.gridMany;
  };

  return (
    <div className={styles.modalBackdrop}>
      <div className={styles.stageContainer}>
        {/* Header */}
        <header className={styles.stageHeader}>
          <div className={styles.headerLeft}>
            <span className={styles.headerIcon}>{currentCall.icon || '📞'}</span>
            <div>
              <div className={styles.headerTitle}>{currentCall.title}</div>
              <div className={styles.headerBadges}>
                <span className={styles.liveBadge}>● In Call</span>
                <span className={styles.durationBadge}>{formattedDuration}</span>
                <span className={styles.durationBadge}>
                  {participants.length} connected
                </span>
              </div>
            </div>
          </div>

          <div className={styles.headerRight}>
            <button
              type="button"
              className={styles.minimizeBtn}
              onClick={() => {
                setStageMaximized(false);
                setMinimized(true);
              }}
              title="Minimize to Floating Dock"
            >
              <MinimizeIcon size={14} style={{ marginRight: 6 }} /> Minimize
            </button>
            <button
              type="button"
              className={styles.minimizeBtn}
              onClick={() => setStageMaximized(false)}
              title="Close Stage"
            >
              ✕
            </button>
          </div>
        </header>

        {/* Stage Content */}
        <div className={styles.stageBody}>
          <div className={styles.stageMain}>
            {theaterParticipant ? (
              /* Theater Mode: Screen Share or Pinned Participant */
              <div className={styles.theaterContainer}>
                <div className={styles.theaterPrimary}>
                  <video
                    ref={theaterVideoRef}
                    autoPlay
                    playsInline
                    className={styles.theaterVideo}
                  />
                  <div className={styles.theaterLabel}>
                    <span>
                      {theaterParticipant.isScreenSharing
                        ? `📺 ${theaterParticipant.name}'s Screen`
                        : `📌 ${theaterParticipant.name}`}
                    </span>
                    {pinnedId && (
                      <button
                        type="button"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#FFE57F',
                          cursor: 'pointer',
                          fontWeight: 700,
                          marginLeft: 6,
                        }}
                        onClick={() => setPinnedId(null)}
                      >
                        (Unpin)
                      </button>
                    )}
                  </div>
                </div>

                {/* Participant strip below screen share */}
                <div className={styles.theaterStrip}>
                  {participants.map((p) => (
                    <div key={p.id} className={styles.theaterStripTile}>
                      <CallParticipantTile
                        participant={p}
                        isPinned={pinnedId === p.id}
                        onPin={() => setPinnedId(pinnedId === p.id ? null : p.id)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* Normal Grid Layout */
              <div className={`${styles.gridContainer} ${getGridClass(participants.length)}`}>
                {participants.map((p) => (
                  <CallParticipantTile
                    key={p.id}
                    participant={p}
                    isPinned={false}
                    onPin={() => setPinnedId(p.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Bottom Dock Controls */}
        <footer className={styles.stageFooter}>
          <CallControls
            onToggleStage={() => setStageMaximized(false)}
            isStageMaximized={true}
          />
        </footer>
      </div>
    </div>
  );
}
