'use client';

import { useCallback } from 'react';
import { useIsNativeApp } from '@/lib/platform/nativeApp';
import { useSafetyStore } from '@/stores/safety';
import { useAdMode } from './useAdMode';
import { initNativeAds, maybeShowNativeInterstitial } from './nativeAds';

/**
 * Returns a fire-and-forget call for the moment a viewer leaves a space.
 * Native app only (AdSense has no programmatic interstitials), Free/Guest only,
 * never for under-13s, at most once per INTERSTITIAL_COOLDOWN_MS. Never shown
 * during play: callers trigger it on the way out, without waiting for it.
 */
export function useExitInterstitial(): () => void {
  const isNative = useIsNativeApp();
  const mode = useAdMode(false);
  const ageBand = useSafetyStore((s) => s.ageBand);

  return useCallback(() => {
    if (!isNative || mode === 'none') return;
    void initNativeAds(ageBand).then((consent) =>
      maybeShowNativeInterstitial(!(consent && ageBand === 'adult'))
    );
  }, [isNative, mode, ageBand]);
}
