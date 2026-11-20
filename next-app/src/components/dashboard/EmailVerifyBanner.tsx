'use client';

import React, { useEffect, useState } from 'react';
import styles from './EmailVerifyBanner.module.css';
import { NeoButton } from '@/components/neo/NeoButton';
import { AppIcon } from '@/components/icons/AppIcon';
import {
  UNVERIFIED_ACCOUNT_DAYS,
  confirmVerificationCode,
  refreshEmailVerification,
  sendVerificationCode,
  useEmailVerificationStore,
} from '@/lib/auth/emailVerification';

interface EmailVerifyBannerProps {
  /** Signed-in account id; the banner never shows for guests. */
  userId: string;
  isGuest: boolean;
}

/**
 * Shown to email/password accounts that have not proven they own their email.
 * Sends a 6-digit code and verifies it in place, without leaving the dashboard.
 */
export function EmailVerifyBanner({ userId, isGuest }: EmailVerifyBannerProps) {
  const status = useEmailVerificationStore((s) => s.status);
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (isGuest) return;
    // Also records verification when this session came from the emailed magic link.
    void refreshEmailVerification();
  }, [userId, isGuest]);

  if (isGuest || status !== 'unverified') return null;

  const sendCode = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    const res = await sendVerificationCode();
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setCodeSentTo(res.email ?? null);
    setCode('');
    setNotice('Code sent. Check your inbox and spam folder.');
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    const res = await confirmVerificationCode(code);
    setBusy(false);
    if (res.error) setError(res.error);
  };

  return (
    <form className={styles.banner} onSubmit={verify} aria-live="polite">
      <span className={styles.icon} aria-hidden="true">
        <AppIcon name="mail" />
      </span>
      <div className={styles.text}>
        <p className={styles.title}>Verify your email</p>
        <p className={styles.detail}>
          {codeSentTo
            ? `Enter the 6-digit code we sent to ${codeSentTo}.`
            : `Unlock friend requests and messages. Unverified accounts are deleted ${UNVERIFIED_ACCOUNT_DAYS} days after sign-up.`}
        </p>
      </div>

      <div className={styles.actions}>
        {codeSentTo ? (
          <>
            <input
              className={styles.codeInput}
              aria-label="Verification code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
            />
            <NeoButton type="submit" variant="secondary" size="sm" disabled={busy || code.length !== 6}>
              {busy ? 'Checking...' : 'Verify'}
            </NeoButton>
            <button type="button" className={styles.linkBtn} onClick={sendCode} disabled={busy}>
              Send a new code
            </button>
          </>
        ) : (
          <NeoButton type="button" variant="secondary" size="sm" onClick={sendCode} disabled={busy}>
            {busy ? 'Sending...' : 'Send code'}
          </NeoButton>
        )}
      </div>

      {(error || notice) && (
        <p className={styles.message} role={error ? 'alert' : 'status'}>
          {error || notice}
        </p>
      )}
    </form>
  );
}
