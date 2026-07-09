'use client';

import { useEffect } from 'react';
import { useLagosLiveStore } from '@/lib/store';

export default function ThemeEffect() {
  const theme = useLagosLiveStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return null;
}
