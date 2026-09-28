'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export const THEME_STORAGE_KEY = 'lagos-live-theme';
export type AppTheme = 'dark' | 'light';

function normalizeTheme(value: string | null | undefined): AppTheme {
  return value === 'light' ? 'light' : 'dark';
}

function applyTheme(theme: AppTheme, persist = false) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;

  if (persist) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Keep the current-page theme working if storage is unavailable.
    }
  }

  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    'content',
    theme === 'light' ? '#F5F7FC' : '#050608'
  );
}

interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
}

/** A compact, animated sun/moon switch inspired by the 21st.dev reference. */
export default function ThemeToggle({ className = '', showLabel = false }: ThemeToggleProps) {
  const [theme, setTheme] = useState<AppTheme>('dark');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = (() => {
      try {
        return localStorage.getItem(THEME_STORAGE_KEY);
      } catch {
        return null;
      }
    })();
    const initial = normalizeTheme(stored ?? document.documentElement.dataset.theme);
    applyTheme(initial);
    setTheme(initial);
    setReady(true);

    const syncFromDocument = () => {
      const next = normalizeTheme(document.documentElement.dataset.theme);
      setTheme(next);
    };
    const syncFromStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
      const next = normalizeTheme(event.newValue);
      applyTheme(next);
      setTheme(next);
    };
    window.addEventListener('storage', syncFromStorage);
    window.addEventListener('lagoslive-theme-change', syncFromDocument);
    return () => {
      window.removeEventListener('storage', syncFromStorage);
      window.removeEventListener('lagoslive-theme-change', syncFromDocument);
    };
  }, []);

  const toggleTheme = () => {
    const next: AppTheme = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next, true);
    setTheme(next);
    window.dispatchEvent(new Event('lagoslive-theme-change'));
  };

  const nextLabel = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <span className={`theme-toggle-wrap ${className}`.trim()}>
      <button
        type="button"
        className="theme-toggle"
        data-theme={ready ? theme : undefined}
        aria-label={nextLabel}
        aria-pressed={ready && theme === 'light'}
        title={nextLabel}
        onClick={toggleTheme}
      >
        <span className="theme-toggle__track" aria-hidden="true">
          <span className="theme-toggle__icon theme-toggle__icon--sun"><Sun size={15} strokeWidth={2.1} /></span>
          <span className="theme-toggle__icon theme-toggle__icon--moon"><Moon size={14} strokeWidth={2.1} /></span>
          <span className="theme-toggle__thumb" />
        </span>
      </button>
      {showLabel && <span className="theme-toggle__label">{theme === 'dark' ? 'Dark mode' : 'Light mode'}</span>}
    </span>
  );
}
