'use client';

import { create } from 'zustand';

interface ThemeState {
  theme: 'light' | 'dark';
  initTheme: () => void;
  toggleTheme: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: 'light',

  initTheme: () => {
    if (typeof window === 'undefined') return;
    let saved: 'light' | 'dark' | null = null;
    try {
      const raw = localStorage.getItem('teemchat-theme');
      if (raw === 'light' || raw === 'dark') saved = raw;
    } catch {
      // Ignore storage access errors in restricted contexts
    }
    const currentAttr = document.documentElement.getAttribute('data-theme');
    const attrTheme = currentAttr === 'dark' || currentAttr === 'light' ? currentAttr : null;
    const active = saved || attrTheme || 'light';
    document.documentElement.setAttribute('data-theme', active);
    set({ theme: active });
  },

  toggleTheme: () => {
    const next = get().theme === 'light' ? 'dark' : 'light';
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('teemchat-theme', next);
      } catch {
        // Ignore storage access errors
      }
      document.documentElement.setAttribute('data-theme', next);
    }
    set({ theme: next });
  },

  setTheme: (theme) => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('teemchat-theme', theme);
      } catch {
        // Ignore storage access errors
      }
      document.documentElement.setAttribute('data-theme', theme);
    }
    set({ theme });
  },
}));
