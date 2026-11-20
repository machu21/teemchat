'use client';

import React, { useState } from 'react';
import { NeoButton } from '@/components/neo/NeoButton';
import { NeoModal } from '@/components/neo/NeoModal';
import { NeoInput } from '@/components/neo/NeoInput';
import { AppIcon } from '@/components/icons/AppIcon';
import { supabase } from '@/lib/supabase';
import styles from './DeleteAccount.module.css';

const CONFIRM_PHRASE = 'DELETE';

/** The "Delete account" link shown in account settings. */
export function DeleteAccountTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className={styles.trigger} onClick={onClick}>
      <AppIcon name="trash" /> Delete account
    </button>
  );
}

interface DeleteAccountDialogProps {
  open: boolean;
  onClose: () => void;
  /** Runs after the server deleted the account: clear local state and leave. */
  onDeleted: () => void | Promise<void>;
}

/**
 * Confirmation dialog for deleting your account, required by the App Store and Google
 * Play for apps with sign-up. Calls /api/account/delete with the user's token.
 */
export function DeleteAccountDialog({ open, onClose, onDeleted }: DeleteAccountDialogProps) {
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const close = () => {
    if (busy) return;
    onClose();
    setPhrase('');
    setError('');
  };

  const confirmed = phrase.trim().toUpperCase() === CONFIRM_PHRASE;

  const deleteAccount = async () => {
    if (!confirmed) {
      setError(`Type ${CONFIRM_PHRASE} to confirm.`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Your session expired. Sign in again, then try again.');
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ confirm: CONFIRM_PHRASE }),
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(body.message || 'We could not delete your account. Try again later.');
      await onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not delete your account. Try again later.');
      setBusy(false);
    }
  };

  return (
    <>
      <NeoModal isOpen={open} onClose={close} title="Delete your account?">
        <div className={styles.body}>
          <p className={styles.text}>
            This permanently deletes your profile, spaces, messages, friends, AI companion and saved survivors.
            It can&apos;t be undone.
          </p>
          <p className={styles.text}>
            If you have a paid plan, it&apos;s cancelled right away and won&apos;t renew.
          </p>
          <NeoInput
            label={`Type ${CONFIRM_PHRASE} to confirm`}
            value={phrase}
            onChange={(e) => {
              setPhrase(e.target.value);
              if (error) setError('');
            }}
            autoCapitalize="characters"
            autoComplete="off"
            disabled={busy}
          />
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <div className={styles.actions}>
            <NeoButton variant="secondary" size="md" onClick={close} disabled={busy}>
              Cancel
            </NeoButton>
            <NeoButton variant="danger" size="md" onClick={deleteAccount} disabled={busy}>
              {busy ? 'Deleting…' : 'Delete account'}
            </NeoButton>
          </div>
        </div>
      </NeoModal>
    </>
  );
}
