'use client';

import { useEffect } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { useThemeStore } from '@/stores/theme';

interface ThemeBarsPlugin {
  apply(options: { dark: boolean; color?: string }): Promise<void>;
}

/** Native helper in android/app/.../ThemeBarsPlugin.java (Android only). */
const ThemeBars = registerPlugin<ThemeBarsPlugin>('ThemeBars');

/** `rgb(24, 13, 38)` → `#180d26`; null for transparent or unparseable values. */
export function cssColorToHex(value: string): string | null {
  const m = value.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\s*\)/);
  if (!m) return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;
  if (m[4] !== undefined && Number(m[4]) === 0) return null;
  return '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('');
}

/**
 * Keeps the Android status/navigation bars in step with TeemChat's own light/dark
 * toggle: bar icons stay readable and the strip behind the bars matches the page.
 * Renders nothing; no-op on the web and iOS.
 */
export function NativeThemeBars() {
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    let isAndroid = false;
    try {
      isAndroid = Capacitor.getPlatform() === 'android';
    } catch {
      isAndroid = false;
    }
    if (!isAndroid) return;

    const apply = () => {
      const dark = document.documentElement.getAttribute('data-theme') === 'dark';
      // Read the theme token, not body's background: that one fades between themes,
      // so mid-transition it is still the old colour.
      const token = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
      const color =
        cssColorToHex(token) ?? cssColorToHex(getComputedStyle(document.body).backgroundColor) ?? undefined;
      ThemeBars.apply({ dark, color }).catch(() => {
        // Older app build without the native helper: nothing to do.
      });
    };

    // Wait a frame so the new data-theme styles are computed.
    const raf = requestAnimationFrame(apply);
    const onVisible = () => {
      if (document.visibilityState === 'visible') apply();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [theme]);

  return null;
}
