'use client';

import React, { useEffect } from 'react';
import styles from './ThemeToggle.module.css';
import { useThemeStore } from '@/stores/theme';

export const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme, initTheme } = useThemeStore();

  useEffect(() => {
    initTheme();
  }, [initTheme]);

  return (
    <button
      className={styles.toggle}
      onClick={toggleTheme}
      title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      aria-label="Toggle theme"
    >
      {theme === 'light' ? '🌙' : '☀️'}
    </button>
  );
};
