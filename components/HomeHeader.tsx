'use client';

import Link from 'next/link';
import { Search } from 'lucide-react';
import { LogoMark, Wordmark } from './Logo';
import { useLagosLiveStore } from '@/lib/store';

export default function HomeHeader() {
  const theme = useLagosLiveStore((s) => s.theme);
  const toggleTheme = useLagosLiveStore((s) => s.toggleTheme);

  return (
    <div
      className="sticky top-0 z-40 flex items-center justify-between border-b px-5 py-4 backdrop-blur-[22px] backdrop-saturate-150"
      style={{ background: 'var(--c-header)', borderColor: 'rgba(255,255,255,0.04)' }}
    >
      <div className="flex items-center gap-[9px]">
        <LogoMark size={33} />
        <Wordmark size={24} />
      </div>
      <div className="flex gap-2">
        <Link
          href="/search"
          className="flex h-[38px] w-[38px] items-center justify-center rounded-full glass glass-hover transition-all duration-200 hover:shadow-glow-pink"
          style={{ color: '#A7A8B5' }}
        >
          <Search size={17} strokeWidth={2} />
        </Link>
      </div>
    </div>
  );
}
