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
    const saved = localStorage.getItem('teemchat-theme') as 'light' | 'dark' | null;
    const currentAttr = document.documentElement.getAttribute('data-theme') as 'light' | 'dark' | null;
    const active = saved || currentAttr || 'light';
    document.documentElement.setAttribute('data-theme', active);
    set({ theme: active });
  },

  toggleTheme: () => {
    const next = get().theme === 'light' ? 'dark' : 'light';
    if (typeof window !== 'undefined') {
      localStorage.setItem('teemchat-theme', next);
      document.documentElement.setAttribute('data-theme', next);
    }
    set({ theme: next });
  },

  setTheme: (theme) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('teemchat-theme', theme);
      document.documentElement.setAttribute('data-theme', theme);
    }
    set({ theme });
  },
}));
