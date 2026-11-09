'use client';

import React, { useEffect, useRef, useState } from 'react';
import { PlayerStatus, STATUS_OPTIONS } from '@/lib/world/emotes';
import styles from './WorldSocial.module.css';

interface StatusPickerProps {
  status: PlayerStatus;
  onChange: (status: PlayerStatus) => void;
  /** Hide the label on narrow layouts (icon only). */
  compact?: boolean;
}

export function StatusPicker({ status, onChange, compact = false }: StatusPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const current = STATUS_OPTIONS.find((o) => o.id === status) || STATUS_OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={styles.anchor}>
      <button
        type="button"
        className={styles.statusButton}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Status: ${current.label}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden="true">{current.icon}</span>
        {!compact && <span>{current.label}</span>}
      </button>
      {open && (
        <div className={`${styles.popover} ${styles.statusMenu}`} role="menu" aria-label="Set status">
          {STATUS_OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              role="menuitemradio"
              aria-checked={o.id === status}
              className={`${styles.statusOption} ${o.id === status ? styles.statusOptionOn : ''}`}
              onClick={() => {
                onChange(o.id);
                setOpen(false);
              }}
            >
              <span aria-hidden="true">{o.icon}</span>
              <span className={styles.statusText}>
                {o.label}
                <small>{o.hint}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
