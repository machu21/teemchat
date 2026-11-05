'use client';

import { useSyncExternalStore } from 'react';
import { Capacitor } from '@capacitor/core';

/**
 * Token appended to the WebView user agent by the Capacitor shell
 * (see `appendUserAgent` in capacitor.config.ts). The middleware uses it to
 * serve the app entry screen instead of the marketing landing page.
 * Keep in sync with NATIVE_APP_UA_TOKEN in src/middleware.ts.
 */
export const NATIVE_APP_UA_TOKEN = 'TeemChatApp';

/** True when running inside the Capacitor iOS/Android shell. */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (Capacitor.isNativePlatform()) return true;
  } catch {
    // Capacitor bridge unavailable — fall through to UA check.
  }
  return navigator.userAgent.includes(NATIVE_APP_UA_TOKEN);
}

const noopSubscribe = () => () => {};

/** Hydration-safe hook: always false on the server, real value on the client. */
export function useIsNativeApp(): boolean {
  return useSyncExternalStore(noopSubscribe, isNativeApp, () => false);
}

/**
 * True inside the Capacitor iOS shell. Apple requires in-app purchase for
 * digital subscriptions, so web checkout is not offered there.
 */
export function isIosApp(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (Capacitor.getPlatform() === 'ios') return true;
  } catch {
    // Capacitor bridge unavailable — fall through to UA check.
  }
  return isNativeApp() && /iPhone|iPad|iPod/.test(navigator.userAgent);
}

/** Hydration-safe hook: always false on the server, real value on the client. */
export function useIsIosApp(): boolean {
  return useSyncExternalStore(noopSubscribe, isIosApp, () => false);
}
