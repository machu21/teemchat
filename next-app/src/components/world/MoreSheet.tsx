'use client';

import React, { useEffect, useRef } from 'react';
import { AppIcon } from '@/components/icons/AppIcon';
import type { IconName } from '@/lib/icons';
import styles from './MoreSheet.module.css';

export interface MoreSheetItem {
  id: string;
  icon: IconName;
  label: string;
  onSelect: () => void;
  /** Shows the tile as on (e.g. music playing, build mode open). */
  active?: boolean;
}

interface MoreSheetProps {
  open: boolean;
  onClose: () => void;
  items: MoreSheetItem[];
}

/**
 * Phone-only bottom sheet that holds the space tools that don't need to be on
 * the map all the time (teleport, build, music, meetings, invite, settings).
 * Desktop keeps them in the top bar and dock.
 */
export function MoreSheet({ open, onClose, items }: MoreSheetProps) {
  const sheetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    // Focus the sheet itself so keyboard users land inside it without a ring on touch
    sheetRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles.backdrop} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={sheetRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label="More space tools"
        tabIndex={-1}
      >
        <div className={styles.header}>
          <span className={styles.grabber} aria-hidden="true" />
          <span className={styles.title}>More</span>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            <AppIcon name="close" />
          </button>
        </div>
        <div className={styles.grid}>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`${styles.tile} ${item.active ? styles.tileOn : ''}`}
              aria-pressed={item.active}
              onClick={() => {
                onClose();
                item.onSelect();
              }}
            >
              <span className={styles.tileIcon}>
                <AppIcon name={item.icon} />
              </span>
              <span className={styles.tileLabel}>{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
