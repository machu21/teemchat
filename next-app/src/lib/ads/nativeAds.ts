'use client';

import type { AgeBand } from '@/lib/safety/ageBand';
import { isIosApp, isNativeApp } from '@/lib/platform/nativeApp';
import { interstitialDue } from './eligibility';

/**
 * AdMob for the Capacitor iOS/Android shell (AdSense is not allowed in WebViews).
 * The plugin is imported lazily so web bundles never load it.
 *
 * Unit ids come from env vars. Without them, debug builds fall back to Google's
 * published test units; release builds show nothing.
 */

const TEST_UNITS = {
  android: {
    banner: 'ca-app-pub-3940256099942544/9214589741',
    interstitial: 'ca-app-pub-3940256099942544/1033173712',
  },
  ios: {
    banner: 'ca-app-pub-3940256099942544/2435281174',
    interstitial: 'ca-app-pub-3940256099942544/4411468910',
  },
} as const;

const ENV_UNITS = {
  android: {
    banner: process.env.NEXT_PUBLIC_ADMOB_ANDROID_BANNER?.trim() || '',
    interstitial: process.env.NEXT_PUBLIC_ADMOB_ANDROID_INTERSTITIAL?.trim() || '',
  },
  ios: {
    banner: process.env.NEXT_PUBLIC_ADMOB_IOS_BANNER?.trim() || '',
    interstitial: process.env.NEXT_PUBLIC_ADMOB_IOS_INTERSTITIAL?.trim() || '',
  },
} as const;

const IS_TESTING = process.env.NODE_ENV !== 'production';

type Unit = 'banner' | 'interstitial';

function unitId(unit: Unit): { adId: string; isTesting: boolean } | null {
  const platform = isIosApp() ? 'ios' : 'android';
  const real = ENV_UNITS[platform][unit];
  if (real) return { adId: real, isTesting: IS_TESTING };
  if (IS_TESTING) return { adId: TEST_UNITS[platform][unit], isTesting: true };
  return null;
}

type AdMobModule = typeof import('@capacitor-community/admob');

let modulePromise: Promise<AdMobModule> | null = null;
function loadAdMob(): Promise<AdMobModule> {
  if (!modulePromise) modulePromise = import('@capacitor-community/admob');
  return modulePromise;
}

let initFor: AgeBand | null = null;
let initPromise: Promise<boolean> | null = null;

/**
 * Initializes AdMob once with the right audience tags, then runs the UMP
 * consent flow and (iOS) the tracking prompt. Resolves to whether the viewer
 * consented to personalized ads.
 */
export function initNativeAds(ageBand: AgeBand): Promise<boolean> {
  if (!isNativeApp() || ageBand === 'child') return Promise.resolve(false);
  if (initPromise && initFor === ageBand) return initPromise;
  initFor = ageBand;
  initPromise = (async () => {
    try {
      const { AdMob, AdmobConsentStatus, MaxAdContentRating } = await loadAdMob();
      const minor = ageBand !== 'adult';
      await AdMob.initialize({
        initializeForTesting: IS_TESTING,
        tagForChildDirectedTreatment: false,
        tagForUnderAgeOfConsent: minor,
        maxAdContentRating: minor ? MaxAdContentRating.Teen : MaxAdContentRating.ParentalGuidance,
      });
      if (minor) return false;

      let consent = await AdMob.requestConsentInfo();
      if (consent.isConsentFormAvailable && consent.status === AdmobConsentStatus.REQUIRED) {
        consent = await AdMob.showConsentForm();
      }
      if (!consent.canRequestAds) return false;

      if (isIosApp()) {
        const tracking = await AdMob.trackingAuthorizationStatus();
        if (tracking.status === 'notDetermined') await AdMob.requestTrackingAuthorization();
      }
      return (
        consent.status === AdmobConsentStatus.OBTAINED ||
        consent.status === AdmobConsentStatus.NOT_REQUIRED
      );
    } catch {
      return false;
    }
  })();
  return initPromise;
}

export async function showNativeBanner(nonPersonalized: boolean): Promise<void> {
  const unit = unitId('banner');
  if (!unit) return;
  try {
    const { AdMob, BannerAdPosition, BannerAdSize } = await loadAdMob();
    await AdMob.showBanner({
      ...unit,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: 0,
      npa: nonPersonalized,
    });
  } catch {
    // A failed ad never breaks the page.
  }
}

export async function removeNativeBanner(): Promise<void> {
  if (!modulePromise) return;
  try {
    const { AdMob } = await loadAdMob();
    await AdMob.removeBanner();
  } catch {
    // Nothing to remove.
  }
}

const LAST_INTERSTITIAL_KEY = 'teemchat:last-interstitial';

function readLastInterstitial(): number | null {
  try {
    const raw = window.localStorage.getItem(LAST_INTERSTITIAL_KEY);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

function writeLastInterstitial(at: number) {
  try {
    window.localStorage.setItem(LAST_INTERSTITIAL_KEY, String(at));
  } catch {
    // Storage blocked: the cooldown resets per launch.
  }
}

/** Shows a full-screen ad at most once per cooldown. Resolves once it closes (or is skipped). */
export async function maybeShowNativeInterstitial(nonPersonalized: boolean): Promise<void> {
  if (!interstitialDue(readLastInterstitial())) return;
  const unit = unitId('interstitial');
  if (!unit) return;
  try {
    const { AdMob } = await loadAdMob();
    await AdMob.prepareInterstitial({ ...unit, npa: nonPersonalized });
    writeLastInterstitial(Date.now());
    await AdMob.showInterstitial();
  } catch {
    // No fill or not ready: skip silently.
  }
}
