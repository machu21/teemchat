'use client';

import React, { useEffect, useState } from 'react';
import { NeoModal } from '@/components/neo/NeoModal';
import { NeoInput } from '@/components/neo/NeoInput';
import { NeoButton } from '@/components/neo/NeoButton';
import { AppIcon } from '@/components/icons/AppIcon';
import { E2EEManager } from '@/lib/services/e2eeManager';
import styles from '@/components/safety/Safety.module.css';

interface KeyBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  onSuccess?: () => void;
}

/**
 * Lets users wrap and back up their private E2EE key with a 6-digit Security PIN
 * (or passphrase), or restore an existing zero-knowledge backup on a new device.
 */
export function KeyBackupModal({ isOpen, onClose, userId, onSuccess }: KeyBackupModalProps) {
  const [mode, setMode] = useState<'backup' | 'restore'>('backup');
  const [hasBackup, setHasBackup] = useState(false);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !userId) return;
    let cancelled = false;
    E2EEManager.hasCloudBackup(userId)
      .then((exists) => {
        if (cancelled) return;
        setHasBackup(exists);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isOpen, userId]);

  const handleClose = () => {
    setPin('');
    setConfirmPin('');
    setError(null);
    setStatusMessage(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatusMessage(null);

    // New backups need 8+ characters (OWASP A04/A07); restores still accept older 6-character PINs.
    const minLength = mode === 'backup' ? 8 : 6;
    if (pin.trim().length < minLength) {
      setError(`Please enter a Security PIN or passphrase of at least ${minLength} characters.`);
      return;
    }

    if (mode === 'backup' && pin !== confirmPin) {
      setError('The Security PIN entries do not match.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'backup') {
        const ok = await E2EEManager.backupPrivateKey(pin);
        if (!ok) {
          setError('Could not save encrypted key backup. Please make sure you are signed in.');
          return;
        }
        setHasBackup(true);
        setStatusMessage('Encrypted key backup saved. You can now restore messages on other devices.');
        onSuccess?.();
      } else {
        const ok = await E2EEManager.restorePrivateKey(userId, pin);
        if (!ok) {
          setError('Could not unlock backup. Double-check your Security PIN or password.');
          return;
        }
        setStatusMessage('Encryption key restored on this device.');
        onSuccess?.();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <NeoModal isOpen={isOpen} onClose={handleClose} title="Encryption Key Sync" maxWidth="440px">
      <div className={styles.stack}>
        <p className={styles.muted}>
          <AppIcon name="shield" /> Your private key is encrypted on your device using PBKDF2-SHA-256 before
          syncing. TeemChat cannot read your PIN or messages.
        </p>

        <div style={{ display: 'flex', gap: '8px' }}>
          <NeoButton
            type="button"
            size="sm"
            variant={mode === 'backup' ? 'primary' : 'secondary'}
            onClick={() => {
              setMode('backup');
              setError(null);
              setStatusMessage(null);
            }}
          >
            <AppIcon name="lock" /> {hasBackup ? 'Update Backup PIN' : 'Set Backup PIN'}
          </NeoButton>
          {hasBackup && (
            <NeoButton
              type="button"
              size="sm"
              variant={mode === 'restore' ? 'primary' : 'secondary'}
              onClick={() => {
                setMode('restore');
                setError(null);
                setStatusMessage(null);
              }}
            >
              <AppIcon name="unlock" /> Restore Key
            </NeoButton>
          )}
        </div>

        <form className={styles.stack} onSubmit={handleSubmit}>
          <NeoInput
            label={mode === 'backup' ? 'Security PIN or Passphrase (8+ chars)' : 'Enter Security PIN or Password'}
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder={mode === 'backup' ? 'Minimum 8 characters' : 'Your PIN or password'}
            autoComplete={mode === 'backup' ? 'new-password' : 'current-password'}
          />

          {mode === 'backup' && (
            <NeoInput
              label="Confirm Security PIN"
              type="password"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value)}
              placeholder="Re-enter your PIN"
              autoComplete="new-password"
            />
          )}

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          {statusMessage && (
            <p className={styles.success} role="status">
              <AppIcon name="checkCircle" /> {statusMessage}
            </p>
          )}

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <NeoButton type="button" variant="secondary" onClick={handleClose}>
              Close
            </NeoButton>
            <NeoButton type="submit" variant="primary" disabled={busy}>
              {busy ? 'Working…' : mode === 'backup' ? 'Save Encrypted Backup' : 'Restore Key'}
            </NeoButton>
          </div>
        </form>
      </div>
    </NeoModal>
  );
}
