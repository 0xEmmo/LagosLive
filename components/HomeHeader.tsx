'use client';

import Link from 'next/link';
import { Moon, Sun, Search } from 'lucide-react';
import { LogoMark, Wordmark } from './Logo';
import { useLagosLiveStore } from '@/lib/store';

export default function HomeHeader() {
  const theme = useLagosLiveStore((s) => s.theme);
  const toggleTheme = useLagosLiveStore((s) => s.toggleTheme);

  return (
    <div
      className="sticky top-0 z-40 flex items-center justify-between border-b px-5 py-4 backdrop-blur-[22px] backdrop-saturate-150"
      style={{ background: 'var(--c-header)', borderColor: 'var(--c-glass)' }}
    >
      <div className="flex items-center gap-[9px]">
        <LogoMark size={33} />
        <Wordmark size={24} />
      </div>
      <div className="flex gap-2">
        <button
          onClick={toggleTheme}
          className="flex h-[38px] w-[38px] items-center justify-center rounded-full border"
          style={{ background: 'var(--c-glass)', borderColor: 'var(--c-border3)', color: 'var(--c-text-faint)' }}
        >
          {theme === 'dark' ? <Moon size={16} strokeWidth={2.5} /> : <Sun size={16} strokeWidth={2.5} />}
        </button>
        <Link
          href="/search"
          className="flex h-[38px] w-[38px] items-center justify-center rounded-full border"
          style={{ background: 'var(--c-glass)', borderColor: 'var(--c-border3)', color: 'var(--c-text-faint)' }}
        >
          <Search size={17} strokeWidth={2.5} />
        </Link>
      </div>
    </div>
  );
}
