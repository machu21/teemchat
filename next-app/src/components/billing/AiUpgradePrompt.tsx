'use client';

import { useState } from 'react';
import Link from 'next/link';
import { NeoButton } from '@/components/neo/NeoButton';
import { useIsIosApp } from '@/lib/platform/nativeApp';
import { AI_ADDON_PRICES, AiAddonInterval, startAiAddonCheckout } from '@/lib/services/billing';
import styles from './AiUpgradePrompt.module.css';

/**
 * Payment buttons shown under the companion's reply when the account has no paid
 * AI add-on. Opens Stripe Checkout (system browser in the Android app); hidden in
 * the iOS app, where Apple requires in-app purchase.
 */
export function AiUpgradePrompt() {
  const isIosApp = useIsIosApp();
  const [busy, setBusy] = useState<AiAddonInterval | null>(null);
  const [error, setError] = useState('');

  if (isIosApp) {
    return <p className={styles.note}>The AI add-on is coming to the iOS app soon.</p>;
  }

  const buy = async (interval: AiAddonInterval) => {
    setError('');
    setBusy(interval);
    try {
      await startAiAddonCheckout(interval);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={styles.prompt}>
      <div className={styles.actions}>
        <NeoButton variant="accent" size="sm" fullWidth onClick={() => buy('month')} disabled={busy !== null}>
          {busy === 'month' ? 'Opening…' : `Get AI · $${AI_ADDON_PRICES.month}/mo`}
        </NeoButton>
        <NeoButton variant="secondary" size="sm" fullWidth onClick={() => buy('year')} disabled={busy !== null}>
          {busy === 'year' ? 'Opening…' : `$${AI_ADDON_PRICES.year}/yr · save 25%`}
        </NeoButton>
      </div>
      {error && <p className={styles.error}>{error}</p>}
      <p className={styles.fineprint}>
        Renews automatically. Cancel anytime. <Link href="/terms">Terms</Link> · <Link href="/refunds">Refunds</Link>
      </p>
    </div>
  );
}
