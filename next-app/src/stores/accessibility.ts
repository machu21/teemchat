'use client';

import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

export const A11Y_STORAGE_KEY = 'teemchat-a11y-v1';

export const TEXT_SCALES = [1, 1.15, 1.3] as const;
export type TextScale = (typeof TEXT_SCALES)[number];

export interface AccessibilityPrefs {
  textScale: TextScale;
  highContrast: boolean;
  reducedMotion: boolean;
}

export const DEFAULT_A11Y: AccessibilityPrefs = {
  textScale: 1,
  highContrast: false,
  reducedMotion: false,
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function toTextScale(v: unknown): TextScale {
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) return 1;
  return TEXT_SCALES.find((s) => Math.abs(s - n) < 0.001) ?? 1;
}

/** Coerce anything (corrupt storage, server rows) into valid prefs. */
export function sanitizeA11y(raw: unknown): AccessibilityPrefs {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_A11Y };
  const r = raw as Record<string, unknown>;
  return {
    textScale: toTextScale(r.textScale),
    highContrast: r.highContrast === true,
    reducedMotion: r.reducedMotion === true,
  };
}

/** Reflect prefs as attributes on <html> so globals.css can react. */
export function applyA11yAttributes(p: AccessibilityPrefs) {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  if (p.textScale === 1) el.removeAttribute('data-text-scale');
  else el.setAttribute('data-text-scale', String(p.textScale));
  if (p.highContrast) el.setAttribute('data-contrast', 'high');
  else el.removeAttribute('data-contrast');
  if (p.reducedMotion) el.setAttribute('data-reduced-motion', 'true');
  else el.removeAttribute('data-reduced-motion');
}

function save(p: AccessibilityPrefs) {
  try {
    localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify(p));
  } catch {
    // Private mode / blocked storage: prefs still apply for this visit
  }
}

interface AccessibilityState extends AccessibilityPrefs {
  hydrated: boolean;
  /** Load saved prefs (call from an effect: storage isn't available during SSR). */
  hydrate: () => void;
  setTextScale: (s: TextScale) => void;
  setHighContrast: (on: boolean) => void;
  setReducedMotion: (on: boolean) => void;
  reset: () => void;
  /** Best-effort upsert to user_preferences; errors are ignored. */
  syncToServer: (userId: string | null | undefined) => Promise<void>;
  /** Best-effort load from user_preferences; local prefs are kept on failure. */
  loadFromServer: (userId: string | null | undefined) => Promise<void>;
}

const prefsOf = (s: AccessibilityPrefs): AccessibilityPrefs => ({
  textScale: s.textScale,
  highContrast: s.highContrast,
  reducedMotion: s.reducedMotion,
});

export const useAccessibilityStore = create<AccessibilityState>((set, get) => {
  const commit = (patch: Partial<AccessibilityPrefs>) => {
    const next = sanitizeA11y({ ...prefsOf(get()), ...patch });
    set(next);
    applyA11yAttributes(next);
    save(next);
  };

  return {
    ...DEFAULT_A11Y,
    hydrated: false,

    hydrate: () => {
      if (get().hydrated || typeof window === 'undefined') return;
      let loaded = { ...DEFAULT_A11Y };
      try {
        const raw = localStorage.getItem(A11Y_STORAGE_KEY);
        if (raw) loaded = sanitizeA11y(JSON.parse(raw));
      } catch {
        loaded = { ...DEFAULT_A11Y };
      }
      set({ ...loaded, hydrated: true });
      applyA11yAttributes(loaded);
    },

    setTextScale: (textScale) => commit({ textScale: toTextScale(textScale) }),
    setHighContrast: (highContrast) => commit({ highContrast }),
    setReducedMotion: (reducedMotion) => commit({ reducedMotion }),
    reset: () => commit({ ...DEFAULT_A11Y }),

    syncToServer: async (userId) => {
      if (!userId || !UUID_RE.test(userId)) return;
      const p = prefsOf(get());
      try {
        await supabase.from('user_preferences').upsert(
          {
            user_id: userId,
            text_scale: p.textScale,
            high_contrast: p.highContrast,
            reduced_motion: p.reducedMotion,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        );
      } catch {
        // Columns may not be migrated yet / offline: local prefs remain the source of truth
      }
    },

    loadFromServer: async (userId) => {
      if (!userId || !UUID_RE.test(userId)) return;
      try {
        const { data, error } = await supabase
          .from('user_preferences')
          .select('text_scale, high_contrast, reduced_motion')
          .eq('user_id', userId)
          .maybeSingle();
        if (error || !data) return;
        const row = data as { text_scale?: unknown; high_contrast?: unknown; reduced_motion?: unknown };
        commit({
          textScale: toTextScale(row.text_scale),
          highContrast: row.high_contrast === true,
          reducedMotion: row.reduced_motion === true,
        });
      } catch {
        // Ignore: keep local prefs
      }
    },
  };
});
