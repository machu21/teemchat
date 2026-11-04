'use client';

import React, { useState } from 'react';
import styles from './ScreenHelpBar.module.css';
import { NeoModal } from '@/components/neo/NeoModal';
import { NeoButton } from '@/components/neo/NeoButton';
import { MonitorIcon } from '@/components/icons/DockIcons';

const CONSENT_KEY = 'teemchat:screen-help-consent';

function hasStoredConsent(): boolean {
  try {
    return window.localStorage.getItem(CONSENT_KEY) === '1';
  } catch {
    return false;
  }
}

function storeConsent() {
  try {
    window.localStorage.setItem(CONSENT_KEY, '1');
  } catch {
    // Storage unavailable (private mode etc.) — we'll just ask again next time.
  }
}

interface ScreenHelpBarProps {
  active: boolean;
  starting: boolean;
  onStart: () => void;
  onStop: () => void;
}

/**
 * Share / stop control and live indicator for Companion Screen Help.
 * Render only where `ScreenHelpSession.isSupported()` is true.
 */
export function ScreenHelpBar({ active, starting, onStart, onStop }: ScreenHelpBarProps) {
  const [consentOpen, setConsentOpen] = useState(false);

  const handleShareClick = () => {
    if (hasStoredConsent()) {
      onStart();
    } else {
      setConsentOpen(true);
    }
  };

  const handleAgree = () => {
    storeConsent();
    setConsentOpen(false);
    onStart();
  };

  return (
    <>
      {active ? (
        <div className={styles.liveBanner} role="status">
          <span className={styles.liveDot} aria-hidden="true" />
          <span className={styles.liveText}>Companion can see your screen</span>
          <button type="button" className={styles.stopBtn} onClick={onStop}>
            Stop
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={styles.shareBtn}
          onClick={handleShareClick}
          disabled={starting}
        >
          <MonitorIcon size={16} />
          {starting ? 'Waiting for screen…' : 'Share screen for help'}
        </button>
      )}

      <NeoModal isOpen={consentOpen} onClose={() => setConsentOpen(false)} title="Share your screen?" maxWidth="440px">
        <div className={styles.consentBody}>
          <p>
            Your companion will see a screenshot of your screen each time you send it a message, so it can
            guide you step by step. It can&apos;t click or type for you.
          </p>
          <ul className={styles.consentList}>
            <li>Only you choose what to share, and nobody else in the room sees it.</li>
            <li>Screenshots aren&apos;t saved or added to your companion&apos;s memory.</li>
            <li>
              <strong>Close windows with passwords, banking or private messages first.</strong>
            </li>
          </ul>
          <div className={styles.consentActions}>
            <NeoButton variant="ghost" size="sm" onClick={() => setConsentOpen(false)}>
              Cancel
            </NeoButton>
            <NeoButton variant="primary" size="sm" onClick={handleAgree}>
              Choose screen
            </NeoButton>
          </div>
        </div>
      </NeoModal>
    </>
  );
}
