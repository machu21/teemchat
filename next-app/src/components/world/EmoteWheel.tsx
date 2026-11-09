'use client';

import React, { useEffect, useRef } from 'react';
import { EMOTES, EmoteId } from '@/lib/world/emotes';
import styles from './WorldSocial.module.css';

interface EmoteWheelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEmote: (emote: EmoteId) => void;
  handRaised: boolean;
  onToggleHand: () => void;
  sitting: boolean;
  onToggleSit: () => void;
  /** The dock button that opens the wheel. */
  trigger: React.ReactNode;
}

/** Dock popover with emotes plus raise-hand and sit toggles. */
export function EmoteWheel({
  open,
  onOpenChange,
  onEmote,
  handRaised,
  onToggleHand,
  sitting,
  onToggleSit,
  trigger,
}: EmoteWheelProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click and Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={rootRef} className={styles.anchor}>
      {trigger}
      {open && (
        <div className={styles.popover} role="dialog" aria-label="Emotes">
          <div className={styles.emoteGrid}>
            {EMOTES.map((e) => (
              <button key={e.id} type="button" className={styles.emoteBtn} onClick={() => onEmote(e.id)}>
                <span className={styles.emoji} aria-hidden="true">
                  {e.emoji}
                </span>
                <span className={styles.emoteLabel}>{e.label}</span>
              </button>
            ))}
          </div>
          <div className={styles.toggleRow}>
            <button
              type="button"
              className={`${styles.toggle} ${handRaised ? styles.toggleOn : ''}`}
              aria-pressed={handRaised}
              onClick={onToggleHand}
            >
              ✋ {handRaised ? 'Lower hand' : 'Raise hand'}
            </button>
            <button
              type="button"
              className={`${styles.toggle} ${sitting ? styles.toggleOn : ''}`}
              aria-pressed={sitting}
              onClick={onToggleSit}
            >
              🪑 {sitting ? 'Stand up' : 'Sit'}
            </button>
          </div>
          <p className={styles.hint}>Shortcuts: T emotes · H hand · X sit</p>
        </div>
      )}
    </div>
  );
}
