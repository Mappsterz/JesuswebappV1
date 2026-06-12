'use client';

import { useCallback, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

const THEME_KEY = 'wwm-theme';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    // Read persisted theme after mount to avoid a hydration mismatch.
    const saved = localStorage.getItem(THEME_KEY) as Theme | null;
    if (saved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTheme(saved);
      document.documentElement.setAttribute('data-theme', saved);
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem(THEME_KEY, next);

      /* Crossfade the whole page between themes instead of swapping tokens
         instantly. Same feature-detection idiom as chat switching in page.tsx. */
      const apply = () => document.documentElement.setAttribute('data-theme', next);
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!reduceMotion && 'startViewTransition' in document) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (document as any).startViewTransition(apply);
      } else {
        apply();
      }
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
