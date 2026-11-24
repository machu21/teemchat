'use client';

import { useEffect, useRef, useState } from 'react';
import { AppIcon } from '@/components/icons/AppIcon';
import { useIsNativeApp } from '@/lib/platform/nativeApp';
import { useSafetyStore } from '@/stores/safety';
import { useAdMode } from '@/lib/ads/useAdMode';
import { ADSENSE_CLIENT, ADSENSE_SLOTS, type AdPlacement } from '@/lib/ads/adSettings';
import { initNativeAds, removeNativeBanner, showNativeBanner } from '@/lib/ads/nativeAds';
import styles from './AdSlot.module.css';

type AdsByGoogle = Array<Record<string, unknown>> & { requestNonPersonalizedAds?: 0 | 1 };

declare global {
  interface Window {
    adsbygoogle?: AdsByGoogle;
  }
}

const ADSENSE_SCRIPT_ID = 'adsbygoogle-js';

/** Adds the AdSense loader once per page. The adsbygoogle queue works before it loads. */
function ensureAdSenseScript() {
  if (document.getElementById(ADSENSE_SCRIPT_ID)) return;
  const script = document.createElement('script');
  script.id = ADSENSE_SCRIPT_ID;
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(ADSENSE_CLIENT)}`;
  document.head.appendChild(script);
}

interface AdSlotProps {
  placement: AdPlacement;
  /** Opens the upgrade flow ("Remove ads"). */
  onRemoveAds?: () => void;
}

/**
 * A banner ad for Free and Guest viewers. Renders nothing for paying accounts,
 * under-13s, while ads are switched off, or before eligibility is known.
 * Web: AdSense in a fixed-height Neo card. Native: an AdMob banner pinned to the
 * bottom of the screen, removed on unmount.
 */
export function AdSlot({ placement, onRemoveAds }: AdSlotProps) {
  const isNative = useIsNativeApp();
  if (isNative) return <NativeBannerSlot />;
  return <WebAdSlot placement={placement} onRemoveAds={onRemoveAds} />;
}

function WebAdSlot({ placement, onRemoveAds }: AdSlotProps) {
  const mode = useAdMode(true);
  const slot = ADSENSE_SLOTS[placement];
  const pushed = useRef(false);
  const insRef = useRef<HTMLModElement | null>(null);

  const active = mode !== 'none' && Boolean(ADSENSE_CLIENT) && Boolean(slot);

  useEffect(() => {
    if (!active || pushed.current || !insRef.current) return;
    pushed.current = true;
    try {
      ensureAdSenseScript();
      const queue = (window.adsbygoogle = window.adsbygoogle || ([] as unknown as AdsByGoogle));
      queue.requestNonPersonalizedAds = mode === 'personalized' ? 0 : 1;
      queue.push({});
    } catch {
      // Blocked by an ad blocker or not loaded yet: leave the slot empty.
    }
  }, [active, mode]);

  if (!active) return null;

  return (
    <aside className={styles.card} aria-label="Advertisement">
      <div className={styles.header}>
        <span className={styles.label}>Ad</span>
        {onRemoveAds && (
          <button type="button" className={styles.remove} onClick={onRemoveAds}>
            <AppIcon name="crown" /> Remove ads
          </button>
        )}
      </div>
      <div className={styles.frame}>
        <ins
          ref={insRef}
          className={`adsbygoogle ${styles.ins}`}
          data-ad-client={ADSENSE_CLIENT}
          data-ad-slot={slot}
          data-ad-format="horizontal"
          data-full-width-responsive="true"
          {...(process.env.NODE_ENV !== 'production' ? { 'data-adtest': 'on' } : {})}
        />
      </div>
    </aside>
  );
}

function NativeBannerSlot() {
  const ageBand = useSafetyStore((s) => s.ageBand);
  const [consent, setConsent] = useState<boolean | null>(null);
  // Consent only switches personalized on/off; it never turns 'none' into an ad.
  const mode = useAdMode(consent === true);
  const eligible = mode !== 'none';

  useEffect(() => {
    if (!eligible) return;
    let active = true;
    initNativeAds(ageBand).then((ok) => {
      if (active) setConsent(ok);
    });
    return () => {
      active = false;
    };
  }, [ageBand, eligible]);

  const ready = consent !== null && eligible;

  useEffect(() => {
    if (!ready) return;
    showNativeBanner(mode !== 'personalized');
    return () => {
      removeNativeBanner();
    };
  }, [ready, mode]);

  // Reserve room so the pinned banner never covers the last row of content.
  return ready ? <div className={styles.nativeSpacer} aria-hidden="true" /> : null;
}
