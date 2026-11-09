'use client';

import { useEffect, useId } from 'react';
import { TEXT_SCALES, TextScale, useAccessibilityStore } from '@/stores/accessibility';
import styles from './AccessibilitySettings.module.css';

interface AccessibilitySettingsProps {
  /** When set, changes are also saved (best-effort) to the user's server preferences. */
  userId?: string | null;
}

const SCALE_LABEL: Record<TextScale, string> = { 1: '100%', 1.15: '115%', 1.3: '130%' };

interface ToggleRowProps {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}

function ToggleRow({ label, hint, checked, onChange }: ToggleRowProps) {
  const id = useId();
  return (
    <div className={styles.row}>
      <label className={styles.rowLabel} htmlFor={id}>
        {label}
        <small>{hint}</small>
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        className={`${styles.switch} ${checked ? styles.switchOn : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className={styles.knob} aria-hidden="true" />
        <span className={styles.switchText}>{checked ? 'On' : 'Off'}</span>
      </button>
    </div>
  );
}

/** Self-contained accessibility panel (not a modal) for embedding in settings UIs. */
export function AccessibilitySettings({ userId }: AccessibilitySettingsProps) {
  const textScale = useAccessibilityStore((s) => s.textScale);
  const highContrast = useAccessibilityStore((s) => s.highContrast);
  const reducedMotion = useAccessibilityStore((s) => s.reducedMotion);
  const hydrate = useAccessibilityStore((s) => s.hydrate);
  const setTextScale = useAccessibilityStore((s) => s.setTextScale);
  const setHighContrast = useAccessibilityStore((s) => s.setHighContrast);
  const setReducedMotion = useAccessibilityStore((s) => s.setReducedMotion);
  const reset = useAccessibilityStore((s) => s.reset);
  const syncToServer = useAccessibilityStore((s) => s.syncToServer);
  const groupId = useId();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const after = (fn: () => void) => () => {
    fn();
    if (userId) void syncToServer(userId);
  };

  return (
    <div className={styles.panel}>
      <p className={styles.lead}>Make TeemChat easier to read and calmer to use. Saved on this device.</p>

      <div className={styles.group}>
        <span className={styles.groupTitle} id={groupId}>
          Text size
        </span>
        <div className={styles.segmented} role="radiogroup" aria-labelledby={groupId}>
          {TEXT_SCALES.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={textScale === s}
              className={`${styles.segment} ${textScale === s ? styles.segmentOn : ''}`}
              onClick={after(() => setTextScale(s))}
            >
              {SCALE_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.group}>
        <span className={styles.groupTitle}>Display</span>
        <ToggleRow
          label="High contrast"
          hint="Stronger text, borders and focus outlines"
          checked={highContrast}
          onChange={(on) => after(() => setHighContrast(on))()}
        />
        <ToggleRow
          label="Reduce motion"
          hint="Turns off UI animations and transitions"
          checked={reducedMotion}
          onChange={(on) => after(() => setReducedMotion(on))()}
        />
      </div>

      <button type="button" className={styles.reset} onClick={after(reset)}>
        Reset to defaults
      </button>
    </div>
  );
}

/** Mount once near the app root: applies saved accessibility prefs on first load. */
export function AccessibilityBoot() {
  const hydrate = useAccessibilityStore((s) => s.hydrate);
  useEffect(() => {
    hydrate();
  }, [hydrate]);
  return null;
}

export default AccessibilitySettings;
