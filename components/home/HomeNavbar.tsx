'use client';

import Link from 'next/link';
import { Search, Plus, UserRound } from 'lucide-react';
import { SiteLogo } from '@/components/Logo';
import RoleNavButtons from '@/components/RoleNavButtons';
import { useLagosLiveStore } from '@/lib/store';
import { hostStartHref } from '@/lib/data';

const NAV_LINKS = [
  { label: 'Events', href: '/explore' },
  { label: 'For Hosts', href: '#for-hosts' },
  { label: 'Pricing', href: '#pricing' },
];

export default function HomeNavbar() {
  const user = useLagosLiveStore((s) => s.user);

  return (
    <div
      className="sticky top-0 z-40 border-b backdrop-blur-[22px] backdrop-saturate-150"
      style={{ background: 'var(--c-header)', borderColor: 'rgba(255,255,255,0.04)' }}
    >
      <div className="mx-auto flex max-w-[1080px] items-center justify-between gap-3 px-5 py-3">
        <div className="flex items-center gap-5">
          <Link href="/" className="flex items-center" aria-label="Lagos Live — home">
            <SiteLogo />
          </Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.label}
                href={l.href}
                className="rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors duration-200"
                style={{ color: '#A7A8B5' }}
              >
                <span className="transition-colors hover:text-white">{l.label}</span>
              </Link>
            ))}
          </nav>
        </div>

        <RoleNavButtons variant="inline" />

        <div className="flex items-center gap-2">
          <Link
            href="/explore"
            className="hidden items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold transition-all duration-200 sm:flex"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#00F5D4' }}
          >
            Explore Events
          </Link>
          <Link
            href="/search"
            aria-label="Search"
            className="flex h-[38px] w-[38px] items-center justify-center rounded-full glass glass-hover transition-all duration-200 hover:shadow-glow-pink md:hidden"
            style={{ color: '#A7A8B5' }}
          >
            <Search size={17} strokeWidth={2} />
          </Link>
          <Link
            href={user ? '/profile' : '/login'}
            aria-label={user ? 'Profile' : 'Sign in'}
            className="hidden h-[38px] w-[38px] items-center justify-center rounded-full glass glass-hover transition-all duration-200 hover:shadow-glow-pink sm:flex"
            style={{ color: '#A7A8B5' }}
          >
            <UserRound size={17} strokeWidth={2} />
          </Link>
          <Link
            href={hostStartHref(user)}
            className="flex h-[38px] items-center gap-1.5 rounded-full px-4 text-[12.5px] font-bold text-white transition-all duration-200 hover:shadow-glow-pink active:opacity-80"
            style={{ background: 'linear-gradient(135deg,#FF2D95,#8A2BE2)', boxShadow: '0 6px 20px rgba(255,45,149,0.25)' }}
          >
            <Plus size={14} strokeWidth={2.5} />
            Host an Event
          </Link>
        </div>
      </div>
    </div>
  );
}