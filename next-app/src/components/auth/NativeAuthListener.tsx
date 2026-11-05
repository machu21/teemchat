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

    import('@capacitor/app')
      .then(({ App }) =>
        App.addListener('appUrlOpen', async ({ url }) => {
          const result = await completeNativeGoogleSignIn(url);
          if (!result) return; // not an auth link
          if (result.error) {
            routerRef.current.replace(`/auth/callback?error_description=${encodeURIComponent(result.error)}`);
          } else {
            routerRef.current.replace('/dashboard');
          }
        })
      )
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
