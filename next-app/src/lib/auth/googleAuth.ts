import { Capacitor } from '@capacitor/core';
import { supabase } from '../supabase';

/**
 * Deep link the Android/iOS apps register (see AndroidManifest.xml and Info.plist).
 * Google blocks sign-in inside app WebViews, so the apps open Google in the system
 * browser and Supabase sends the user back here with a one-time ?code=.
 * Must also be listed under Supabase Auth → URL Configuration → Redirect URLs.
 */
export const NATIVE_AUTH_CALLBACK = 'com.antigravity.virtualworld://auth/callback';

/** Web return page; must be listed under Supabase Auth redirect URLs too. */
export const WEB_AUTH_CALLBACK_PATH = '/auth/callback';

const FALLBACK_ERROR = 'Google sign-in is unavailable right now. Please try again.';

function isNativePlatform(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Starts "Continue with Google". New Google users get an account automatically,
 * so this is both sign-in and sign-up. On the web the page navigates to Google;
 * in the apps Google opens in the system browser and the deep link brings the
 * user back (handled by completeNativeGoogleSignIn).
 */
export async function startGoogleSignIn(): Promise<{ error?: string }> {
  try {
    if (isNativePlatform()) {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: NATIVE_AUTH_CALLBACK, skipBrowserRedirect: true },
      });
      if (error || !data?.url) return { error: error?.message || FALLBACK_ERROR };
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url: data.url, presentationStyle: 'popover' });
      return {};
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${WEB_AUTH_CALLBACK_PATH}` },
    });
    return error ? { error: error.message || FALLBACK_ERROR } : {};
  } catch (e) {
    console.warn('Google sign-in error:', e);
    return { error: FALLBACK_ERROR };
  }
}

export type AuthCallbackResult = { code: string } | { error: string } | null;

/**
 * Reads the result Supabase appends to a callback URL. Returns null when the URL
 * is not an auth callback at all.
 */
export function parseAuthCallback(url: string, expectedPrefix: string): AuthCallbackResult {
  if (!url.startsWith(expectedPrefix)) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { error: FALLBACK_ERROR };
  }
  const hash = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  const get = (key: string) => parsed.searchParams.get(key) || hash.get(key);

  const error = get('error_description') || get('error');
  if (error) return { error: error.replace(/\+/g, ' ') };
  const code = get('code');
  return code ? { code } : { error: FALLBACK_ERROR };
}

/**
 * Finishes Google sign-in after the app's deep link fires. Returns an error
 * message, or nothing on success (the session store then picks up the login
 * through onAuthStateChange).
 */
export async function completeNativeGoogleSignIn(url: string): Promise<{ error?: string } | null> {
  const result = parseAuthCallback(url, NATIVE_AUTH_CALLBACK);
  if (!result) return null;

  try {
    const { Browser } = await import('@capacitor/browser');
    await Browser.close();
  } catch {
    // Browser already closed (Android closes it when the app comes back).
  }

  if ('error' in result) return { error: result.error };
  const { error } = await supabase.auth.exchangeCodeForSession(result.code);
  return error ? { error: error.message || FALLBACK_ERROR } : {};
}
