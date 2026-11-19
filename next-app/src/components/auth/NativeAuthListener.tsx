'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { completeNativeGoogleSignIn } from '@/lib/auth/googleAuth';

/**
 * In the Android/iOS apps, catches the deep link Google sign-in returns to
 * (com.antigravity.virtualworld://auth/callback?code=…), finishes the login and
 * opens the dashboard. Renders nothing; does nothing on the web.
 */
const HANDLED_URL_KEY = 'teem_native_auth_handled_url';

export function NativeAuthListener() {
  const router = useRouter();
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    let native = false;
    try {
      native = Capacitor.isNativePlatform();
    } catch {
      native = false;
    }
    if (!native) return;

    let handle: PluginListenerHandle | null = null;
    let disposed = false;

    const handleUrl = async (url: string) => {
      // The same link can arrive twice (launch URL + appUrlOpen); a code works only once.
      try {
        if (sessionStorage.getItem(HANDLED_URL_KEY) === url) return;
        sessionStorage.setItem(HANDLED_URL_KEY, url);
      } catch {
        // Storage unavailable: worst case the second exchange fails harmlessly.
      }
      const result = await completeNativeGoogleSignIn(url);
      if (!result || disposed) return; // not an auth link
      if (result.error) {
        routerRef.current.replace(`/auth/callback?error_description=${encodeURIComponent(result.error)}`);
      } else {
        routerRef.current.replace('/dashboard');
      }
    };

    import('@capacitor/app')
      .then(async ({ App }) => {
        // Android may kill the app while Google is open in the browser. The deep
        // link then cold-starts the app, and appUrlOpen never fires for it.
        const launch = await App.getLaunchUrl().catch(() => undefined);
        if (launch?.url) void handleUrl(launch.url);
        return App.addListener('appUrlOpen', ({ url }) => void handleUrl(url));
      })
      .then((h) => {
        if (disposed) void h.remove();
        else handle = h;
      })
      .catch((e) => console.warn('Deep link listener unavailable:', e));

    return () => {
      disposed = true;
      void handle?.remove();
    };
  }, []);

  return null;
}
