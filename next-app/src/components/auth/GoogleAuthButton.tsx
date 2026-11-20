'use client';

import { useState } from 'react';
import { startAppleSignIn, startGoogleSignIn } from '@/lib/auth/googleAuth';
import styles from './GoogleAuthButton.module.css';

interface GoogleAuthButtonProps {
  /** "Sign in with Google" or "Sign up with Google". */
  label: string;
  disabled?: boolean;
}

/** Google's multicolour "G" mark. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/** Apple logo for the Sign in with Apple button (Apple's button guidelines require it). */
function AppleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor">
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  );
}

/**
 * "Continue with Apple" and "Continue with Google" for the login and sign-up
 * popups. Each covers both: a new user gets an account automatically. Apple is
 * required on iOS whenever Google is offered (App Store guideline 4.8).
 */
export function GoogleAuthButton({ label, disabled }: GoogleAuthButtonProps) {
  const [busy, setBusy] = useState<'google' | 'apple' | null>(null);
  const [error, setError] = useState('');

  const start = async (provider: 'google' | 'apple') => {
    setError('');
    setBusy(provider);
    const res = provider === 'apple' ? await startAppleSignIn() : await startGoogleSignIn();
    // On the web a successful start navigates away; only errors land here.
    if (res.error) setError(res.error);
    setBusy(null);
  };

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={`${styles.button} ${styles.apple}`}
        onClick={() => start('apple')}
        disabled={disabled || busy !== null}
      >
        <AppleMark />
        <span>{busy === 'apple' ? 'Opening Apple…' : label.replace('Google', 'Apple')}</span>
      </button>
      <button type="button" className={styles.button} onClick={() => start('google')} disabled={disabled || busy !== null}>
        <GoogleMark />
        <span>{busy === 'google' ? 'Opening Google…' : label}</span>
      </button>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.divider} aria-hidden="true">
        <span>or use email</span>
      </div>
    </div>
  );
}
