'use client';

import { useEffect, useState } from 'react';
import { useSessionStore } from '@/stores/session';
import { useSafetyStore } from '@/stores/safety';
import { adModeFor, type AdMode } from './eligibility';
import { fetchAdsEnabled } from './adSettings';

/**
 * The ad mode for the current viewer. Returns 'none' on the server and until
 * the kill switch and the viewer's age band have both loaded, so the first
 * client render matches the server and nothing flashes for children.
 *
 * `personalizedConsent` comes from the consent platform: on the web Google's
 * CMP (bundled with AdSense) gates personalization itself, so adults pass true;
 * the native wrapper passes the UMP result.
 */
export function useAdMode(personalizedConsent = true): AdMode {
  const session = useSessionStore((s) => s.session);
  const ageBand = useSafetyStore((s) => s.ageBand);
  const safetyLoaded = useSafetyStore((s) => s.loaded);
  const safetyUserId = useSafetyStore((s) => s.userId);
  const [adsEnabled, setAdsEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    fetchAdsEnabled().then((enabled) => {
      if (active) setAdsEnabled(enabled);
    });
    return () => {
      active = false;
    };
  }, []);

  return adModeFor({
    session,
    ageBand,
    ageBandLoaded: Boolean(session) && safetyLoaded && safetyUserId === session?.id,
    adsEnabled,
    personalizedConsent,
  });
}
