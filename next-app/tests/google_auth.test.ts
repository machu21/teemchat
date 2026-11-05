import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const signInWithOAuth = vi.fn();
const exchangeCodeForSession = vi.fn();
const isNativePlatform = vi.fn();
const browserOpen = vi.fn();
const browserClose = vi.fn();

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOAuth: (...args: unknown[]) => signInWithOAuth(...args),
      exchangeCodeForSession: (...args: unknown[]) => exchangeCodeForSession(...args),
    },
  },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => isNativePlatform() },
}));

vi.mock('@capacitor/browser', () => ({
  Browser: {
    open: (...args: unknown[]) => browserOpen(...args),
    close: (...args: unknown[]) => browserClose(...args),
  },
}));

import {
  NATIVE_AUTH_CALLBACK,
  completeNativeGoogleSignIn,
  parseAuthCallback,
  startGoogleSignIn,
} from '../src/lib/auth/googleAuth';

describe('Google sign-in', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('window', { location: { origin: 'https://www.teemchat.chat' } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('on the web, redirects to Google and back to /auth/callback', async () => {
    isNativePlatform.mockReturnValue(false);
    signInWithOAuth.mockResolvedValue({ data: { url: 'https://accounts.google.com/x' }, error: null });

    const res = await startGoogleSignIn();

    expect(res).toEqual({});
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'https://www.teemchat.chat/auth/callback' },
    });
    expect(browserOpen).not.toHaveBeenCalled();
  });

  it('in the apps, opens Google in the system browser with the app deep link', async () => {
    isNativePlatform.mockReturnValue(true);
    signInWithOAuth.mockResolvedValue({ data: { url: 'https://accounts.google.com/x' }, error: null });

    const res = await startGoogleSignIn();

    expect(res).toEqual({});
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: NATIVE_AUTH_CALLBACK, skipBrowserRedirect: true },
    });
    expect(browserOpen).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://accounts.google.com/x' }));
  });

  it('reports a provider error instead of throwing', async () => {
    isNativePlatform.mockReturnValue(false);
    signInWithOAuth.mockResolvedValue({ data: null, error: { message: 'Unsupported provider: provider is not enabled' } });

    expect(await startGoogleSignIn()).toEqual({ error: 'Unsupported provider: provider is not enabled' });
  });

  it('parses the code, or the error, from a callback URL', () => {
    expect(parseAuthCallback(`${NATIVE_AUTH_CALLBACK}?code=abc123`, NATIVE_AUTH_CALLBACK)).toEqual({ code: 'abc123' });
    expect(
      parseAuthCallback(`${NATIVE_AUTH_CALLBACK}?error=access_denied&error_description=User+cancelled`, NATIVE_AUTH_CALLBACK)
    ).toEqual({ error: 'User cancelled' });
    expect(parseAuthCallback('https://evil.example/auth/callback?code=abc', NATIVE_AUTH_CALLBACK)).toBeNull();
  });

  it('exchanges the deep-link code for a session and closes the browser', async () => {
    exchangeCodeForSession.mockResolvedValue({ data: {}, error: null });

    const res = await completeNativeGoogleSignIn(`${NATIVE_AUTH_CALLBACK}?code=abc123`);

    expect(res).toEqual({});
    expect(exchangeCodeForSession).toHaveBeenCalledWith('abc123');
    expect(browserClose).toHaveBeenCalled();
  });

  it('ignores links that are not auth callbacks', async () => {
    expect(await completeNativeGoogleSignIn('com.antigravity.virtualworld://space/abc')).toBeNull();
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });
});
