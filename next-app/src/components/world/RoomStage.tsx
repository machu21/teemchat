'use client';

import React, { useEffect, useRef, useState } from 'react';
import { VideoFeedModel, attachTrackToElement } from '@/lib/services/livekit';
import styles from './RoomStage.module.css';

interface RoomStageProps {
  /** Screen shares visible to the viewer (already filtered to their room). */
  feeds: VideoFeedModel[];
  roomName: string;
  safeText: (text: string) => string;
}

function StageVideo({ feed }: { feed: VideoFeedModel }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    return attachTrackToElement(feed.track, el);
  }, [feed.track]);
  return <video ref={videoRef} className={styles.video} autoPlay playsInline muted />;
}

/** Docked stage that shows screen shares inside a private room. */
export function RoomStage({ feeds, roomName, safeText }: RoomStageProps) {
  const [minimized, setMinimized] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  if (feeds.length === 0) return null;
  const active = feeds.find((f) => `${f.participantId}:${f.isLocal ? 'local' : 'remote'}` === activeId) || feeds[0];
  const label = active.isLocal ? 'You are sharing' : `${safeText(active.participantName)} is sharing`;

  const goFullscreen = () => {
    const el = panelRef.current?.querySelector('video');
    el?.requestFullscreen?.().catch(() => {});
  };

  return (
    <section
      ref={panelRef}
      className={`${styles.stage} ${minimized ? styles.minimized : ''}`}
      aria-label={`Screen share in ${roomName}`}
    >
      <header className={styles.header}>
        <span className={styles.pill}>🖥️ {label}</span>
        <div className={styles.actions}>
          {!minimized && (
            <button type="button" className={styles.btn} onClick={goFullscreen} aria-label="Full screen">
              ⛶
            </button>
          )}
          <button
            type="button"
            className={styles.btn}
            onClick={() => setMinimized((m) => !m)}
            aria-label={minimized ? 'Expand screen share' : 'Minimize screen share'}
          >
            {minimized ? '▢' : '—'}
          </button>
        </div>
      </header>
      {!minimized && <StageVideo key={`${active.participantId}:${active.isLocal}`} feed={active} />}
      {!minimized && feeds.length > 1 && (
        <div className={styles.switcher} role="tablist" aria-label="Choose a screen">
          {feeds.map((f) => {
            const id = `${f.participantId}:${f.isLocal ? 'local' : 'remote'}`;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={f === active}
                className={`${styles.chip} ${f === active ? styles.chipOn : ''}`}
                onClick={() => setActiveId(id)}
              >
                {f.isLocal ? 'You' : safeText(f.participantName)}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
