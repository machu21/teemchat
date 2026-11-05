'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import styles from './callback.module.css';

const TIMEOUT_MS = 15_000;

/**
 * Google sign-in returns here (web) with ?code=. The Supabase client exchanges it
 * automatically (detectSessionInUrl + PKCE); this page waits for the session and
 * opens the dashboard, or shows what went wrong.
 */
function AuthCallback() {
  const router = useRouter();
  const params = useSearchParams();
  const urlError = params.get('error_description') || params.get('error');
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (urlError) return;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      router.replace('/dashboard');
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) finish();
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) finish();
    });
    const timer = setTimeout(() => setTimedOut(true), TIMEOUT_MS);

    return () => {
      done = true;
      sub.subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, [urlError, router]);

  const error = urlError
    ? urlError.replace(/\+/g, ' ')
    : timedOut
      ? 'Sign-in is taking too long. Please try again.'
      : '';

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        {error ? (
          <>
            <h1 className={styles.title}>Couldn&apos;t sign you in</h1>
            <p className={styles.text}>{error}</p>
            <Link href="/" className={styles.button}>
              Back to TeemChat
            </Link>
          </>
        ) : (
          <>
            <h1 className={styles.title}>Signing you in…</h1>
            <p className={styles.text}>Finishing your Google sign-in. This only takes a moment.</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <AuthCallback />
    </Suspense>
  );
}
