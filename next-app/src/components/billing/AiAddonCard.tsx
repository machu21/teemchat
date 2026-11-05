'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { NeoButton } from '@/components/neo/NeoButton';
import { supabase } from '@/lib/supabase';
import { useIsIosApp } from '@/lib/platform/nativeApp';
import {
  AI_ADDON_PRICES,
  AiAddonInterval,
  openBillingPortal,
  startAiAddonCheckout,
} from '@/lib/services/billing';
import type { UserSession } from '@/lib/models/user';
import styles from './AiAddonCard.module.css';

type SubscriptionRow = {
  stripe_subscription_id: string | null;
  status: string;
  has_ai_addon: boolean;
};

interface AiAddonCardProps {
  session: UserSession;
  /** Called after Stripe sends the user back with a successful payment. */
  onPurchased?: () => void;
}

/** Buy or manage the AI Companion add-on (Stripe on web and the Android APK). */
export function AiAddonCard({ session, onPurchased }: AiAddonCardProps) {
  const isIosApp = useIsIosApp();
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [busy, setBusy] = useState<AiAddonInterval | 'portal' | null>(null);
  const [error, setError] = useState('');
  // Stripe returns to /dashboard?billing=success|cancel. This card only renders
  // client-side (inside the account panel), so reading the URL here is safe.
  const [billingReturn] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('billing')
  );
  const notice =
    billingReturn === 'success'
      ? 'Payment received. Your AI Companion is unlocking now.'
      : billingReturn === 'cancel'
        ? 'Checkout canceled. You have not been charged.'
        : '';

  useEffect(() => {
    if (!billingReturn) return;
    if (billingReturn === 'success') onPurchased?.();
    const params = new URLSearchParams(window.location.search);
    params.delete('billing');
    params.delete('session_id');
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }, [billingReturn, onPurchased]);

  useEffect(() => {
    if (session.isGuest) return;
    let cancelled = false;
    supabase
      .from('user_subscriptions')
      .select('stripe_subscription_id, status, has_ai_addon')
      .eq('user_id', session.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setSubscription((data as SubscriptionRow | null) ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [session.id, session.isGuest]);

  if (session.isGuest) return null;

  const isActive =
    session.hasAiCompanion ||
    Boolean(subscription?.has_ai_addon && ['active', 'trialing'].includes(subscription.status));
  const hasStripeBilling = Boolean(subscription?.stripe_subscription_id);

  const run = async (kind: AiAddonInterval | 'portal') => {
    setError('');
    setBusy(kind);
    try {
      if (kind === 'portal') await openBillingPortal();
      else await startAiAddonCheckout(kind);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  let actions: React.ReactNode = null;
  if (isActive) {
    if (hasStripeBilling && !isIosApp) {
      actions = (
        <NeoButton variant="secondary" size="md" fullWidth onClick={() => run('portal')} disabled={busy !== null}>
          {busy === 'portal' ? 'Opening…' : 'Manage billing'}
        </NeoButton>
      );
    } else if (!hasStripeBilling) {
      actions = <p className={styles.muted}>Included with your beta access.</p>;
    }
  } else if (isIosApp) {
    actions = <p className={styles.muted}>The AI add-on is coming to the iOS app soon.</p>;
  } else {
    actions = (
      <div className={styles.actions}>
        <NeoButton variant="accent" size="md" fullWidth onClick={() => run('month')} disabled={busy !== null}>
          {busy === 'month' ? 'Opening checkout…' : `$${AI_ADDON_PRICES.month} / month`}
        </NeoButton>
        <NeoButton variant="secondary" size="md" fullWidth onClick={() => run('year')} disabled={busy !== null}>
          {busy === 'year' ? 'Opening checkout…' : `$${AI_ADDON_PRICES.year} / year · save 25%`}
        </NeoButton>
        <p className={`${styles.fineprint} ${styles.actionsWide}`}>
          Renews automatically. Cancel anytime. <Link href="/terms">Terms</Link> · <Link href="/refunds">Refunds</Link>
        </p>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className={styles.title}>🤖 AI Companion add-on</span>
        {isActive && <span className={styles.badge}>Active</span>}
      </div>
      <p className={styles.body}>60 messages every 5 hours, memories and a custom persona.</p>
      {notice && <p className={styles.notice}>{notice}</p>}
      {error && <p className={styles.error}>{error}</p>}
      {actions}
    </div>
  );
}
