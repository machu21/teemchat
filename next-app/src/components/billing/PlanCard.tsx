'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { NeoButton } from '@/components/neo/NeoButton';
import { AppIcon } from '@/components/icons/AppIcon';
import { supabase } from '@/lib/supabase';
import { useIsNativeApp } from '@/lib/platform/nativeApp';
import {
  BETA_FREE_MEMBERSHIP,
  PLAN_LIMITS,
  PLAN_NAMES,
  PLAN_PRICES,
  actualPlan,
  effectivePlan,
  membershipLabel,
  type BillingInterval,
  type PaidPlanId,
} from '@/lib/membership';
import { openBillingPortal, startPlanCheckout } from '@/lib/services/billing';
import type { UserSession } from '@/lib/models/user';
import styles from './PlanCard.module.css';

type MembershipSubRow = {
  membership_plan: string;
  membership_status: string | null;
  membership_stripe_subscription_id: string | null;
  is_founding_member: boolean;
};

interface PlanCardProps {
  session: UserSession;
}

/** View and upgrade the user's TeemChat membership plan (Free, Plus, Host). */
export function PlanCard({ session }: PlanCardProps) {
  const isNativeApp = useIsNativeApp();
  const [sub, setSub] = useState<MembershipSubRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  // Read ?billing= in the state initializer so it is captured before AiAddonCard strips it.
  const [billingReturn] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('billing')
  );

  const notice =
    billingReturn === 'success'
      ? 'Payment received. Your plan limits are updating now.'
      : billingReturn === 'cancel'
        ? 'Checkout canceled. You have not been charged.'
        : '';

  useEffect(() => {
    if (session.isGuest) return;
    let cancelled = false;
    supabase
      .from('user_subscriptions')
      .select('membership_plan, membership_status, membership_stripe_subscription_id, is_founding_member')
      .eq('user_id', session.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setSub((data as MembershipSubRow | null) ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [session.id, session.isGuest]);

  if (session.isGuest) return null;

  const realPlan = actualPlan(session);
  const activePlan = effectivePlan(session);
  const limits = PLAN_LIMITS[activePlan];
  const hasStripeMembership = Boolean(
    sub?.membership_stripe_subscription_id &&
      ['active', 'trialing', 'past_due'].includes(sub.membership_status ?? '')
  );

  const runCheckout = async (plan: PaidPlanId, interval: BillingInterval) => {
    setError('');
    setBusy(`${plan}_${interval}`);
    try {
      await startPlanCheckout(plan, interval);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const runPortal = async () => {
    setError('');
    setBusy('portal');
    try {
      await openBillingPortal();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  let actions: React.ReactNode = null;
  if (hasStripeMembership) {
    actions = isNativeApp ? (
      <p className={styles.muted}>Manage your plan in the web dashboard.</p>
    ) : (
      <NeoButton variant="secondary" size="md" fullWidth onClick={runPortal} disabled={busy !== null}>
        {busy === 'portal' ? 'Opening…' : 'Manage plan billing'}
      </NeoButton>
    );
  } else if (isNativeApp) {
    actions = <p className={styles.muted}>Plan upgrades are coming to the app soon.</p>;
  } else {
    actions = (
      <>
        {BETA_FREE_MEMBERSHIP && realPlan === 'free' && (
          <p className={styles.muted}>
            Plus is free during the beta — as a Founding Member you&apos;ll lock in 50% off for life at launch.
          </p>
        )}

        <div className={styles.planGroup}>
          <span className={styles.planRowLabel}>
            Plus · {PLAN_LIMITS.plus.maps} maps · {PLAN_LIMITS.plus.capacity} players · call video
          </span>
          <div className={styles.actions}>
            <NeoButton
              variant="accent"
              size="sm"
              fullWidth
              onClick={() => runCheckout('plus', 'month')}
              disabled={busy !== null}
            >
              {busy === 'plus_month' ? 'Opening…' : `$${PLAN_PRICES.plus.month} / mo`}
            </NeoButton>
            <NeoButton
              variant="secondary"
              size="sm"
              fullWidth
              onClick={() => runCheckout('plus', 'year')}
              disabled={busy !== null}
            >
              {busy === 'plus_year' ? 'Opening…' : `$${PLAN_PRICES.plus.year} / yr · save 25%`}
            </NeoButton>
          </div>
        </div>

        <div className={styles.planGroup}>
          <span className={styles.planRowLabel}>
            Host · {PLAN_LIMITS.host.maps} maps · {PLAN_LIMITS.host.capacity} players · moderation
          </span>
          <div className={styles.actions}>
            <NeoButton
              variant="primary"
              size="sm"
              fullWidth
              onClick={() => runCheckout('host', 'month')}
              disabled={busy !== null}
            >
              {busy === 'host_month' ? 'Opening…' : `$${PLAN_PRICES.host.month} / mo`}
            </NeoButton>
            <NeoButton
              variant="secondary"
              size="sm"
              fullWidth
              onClick={() => runCheckout('host', 'year')}
              disabled={busy !== null}
            >
              {busy === 'host_year' ? 'Opening…' : `$${PLAN_PRICES.host.year} / yr · save 25%`}
            </NeoButton>
          </div>
        </div>

        <p className={styles.fineprint}>
          Renews automatically. Cancel anytime. <Link href="/terms">Terms</Link> · <Link href="/refunds">Cancellation</Link>
        </p>
      </>
    );
  }

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className={styles.title}>
          <AppIcon name="star" /> {membershipLabel(session)}
        </span>
        <span className={styles.badge}>
          {BETA_FREE_MEMBERSHIP && realPlan === 'free' ? 'Beta · Plus' : PLAN_NAMES[activePlan]}
        </span>
      </div>
      <p className={styles.body}>
        Up to {limits.maps} {limits.maps === 1 ? 'map' : 'maps'} · {limits.capacity} players/room ·{' '}
        {limits.callVideo ? 'Video & screen share in calls' : 'Voice-only calls'}
      </p>
      {notice && <p className={styles.notice}>{notice}</p>}
      {error && <p className={styles.error}>{error}</p>}
      {actions}
    </div>
  );
}
