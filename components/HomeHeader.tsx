'use client';

import Link from 'next/link';
import { Search, Plus } from 'lucide-react';
import { SiteLogo } from './Logo';
import { useLagosLiveStore } from '@/lib/store';

export default function HomeHeader() {
  const user = useLagosLiveStore((s) => s.user);

  return (
    <div
      className="sticky top-0 z-40 flex items-center justify-between border-b px-5 py-3 backdrop-blur-[22px] backdrop-saturate-150"
      style={{ background: 'var(--c-header)', borderColor: 'rgba(255,255,255,0.04)' }}
    >
      <Link href="/" className="flex items-center">
        <SiteLogo />
      </Link>
      <div className="flex items-center gap-2">
        <Link
          href="/search"
          className="flex h-[38px] w-[38px] items-center justify-center rounded-full glass glass-hover transition-all duration-200 hover:shadow-glow-pink"
          style={{ color: '#A7A8B5' }}
        >
          <Search size={17} strokeWidth={2} />
        </Link>
        <Link
          href={user ? '/host/new' : '/host'}
          className="flex h-[38px] items-center gap-1.5 rounded-full px-3.5 glass glass-hover transition-all duration-200 hover:shadow-glow-pink"
          style={{ color: '#FF2D95' }}
        >
          <Plus size={14} strokeWidth={2.5} />
          <span className="text-[12px] font-semibold">Host</span>
        </Link>
      </div>
    </div>
  );
}
