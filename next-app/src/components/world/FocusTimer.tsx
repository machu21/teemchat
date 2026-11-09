'use client';

import React, { useEffect, useState } from 'react';
import { FocusTimerState, TIMER_PRESETS, formatClock, remaining } from '@/lib/world/focusTimer';
import styles from './WorldSocial.module.css';

interface FocusTimerProps {
  timer: FocusTimerState | null;
  onAction: (action: 'start' | 'pause' | 'resume' | 'skip' | 'stop', preset?: { focusMin: number; breakMin: number }) => void;
  autoFocusStatus: boolean;
  onToggleAutoFocus: () => void;
}

/** Shared Pomodoro for the private room you're in. Counts down locally (no network per tick). */
export function FocusTimer({ timer, onAction, autoFocusStatus, onToggleAutoFocus }: FocusTimerProps) {
  const [now, setNow] = useState(() => Date.now());
  const [preset, setPreset] = useState(0);

  useEffect(() => {
    if (!timer?.running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timer?.running]);

  if (!timer) {
    return (
      <div className={styles.roomBadge}>
        <span>⏱️ Focus timer</span>
        <select
          className={styles.hudBtn}
          aria-label="Timer length"
          value={preset}
          onChange={(e) => setPreset(Number(e.target.value))}
        >
          {TIMER_PRESETS.map((p, i) => (
            <option key={p.label} value={i}>
              {p.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={`${styles.hudBtn} ${styles.hudBtnPrimary}`}
          onClick={() => onAction('start', TIMER_PRESETS[preset])}
        >
          ▶ Start for the room
        </button>
      </div>
    );
  }

  // The parent keys this component on the timer, so `now` starts fresh on every change.
  const left = remaining(timer, now);
  const isFocus = timer.phase === 'focus';

  return (
    <div className={styles.roomBadge} role="timer" aria-label={`${isFocus ? 'Focus' : 'Break'} ${formatClock(left)} left`}>
      <span>
        {isFocus ? '🎯 Focus' : '☕ Break'} · <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formatClock(left)}</strong>
        {timer.round > 0 && ` · round ${timer.round + (isFocus ? 1 : 0)}`}
      </span>
      {timer.running ? (
        <button type="button" className={styles.hudBtn} onClick={() => onAction('pause')}>
          ⏸ Pause
        </button>
      ) : (
        <button type="button" className={`${styles.hudBtn} ${styles.hudBtnPrimary}`} onClick={() => onAction('resume')}>
          ▶ Resume
        </button>
      )}
      <button type="button" className={styles.hudBtn} onClick={() => onAction('skip')}>
        ⏭ {isFocus ? 'Break' : 'Focus'}
      </button>
      <button type="button" className={styles.hudBtn} onClick={() => onAction('stop')} aria-label="Stop timer">
        ⏹
      </button>
      <label className={styles.hudBtn} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
        <input type="checkbox" checked={autoFocusStatus} onChange={onToggleAutoFocus} />
        🎧 auto Focus
      </label>
    </div>
  );
}
