'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Plus, UserRound } from 'lucide-react';
import { SiteLogo } from '@/components/Logo';
import RoleNavButtons from '@/components/RoleNavButtons';
import { useLagosLiveStore } from '@/lib/store';
import { hostStartHref } from '@/lib/data';

// Global desktop header. Rendered from the root layout; shows on md+ screens
// (the mobile experience uses the bottom nav instead). Home / Events / Map are
// the primary destinations; Host (create event) + Profile / Sign in sit on the
// right, switching on auth state like the bottom nav.
const NAV_LINKS = [
  { label: 'Home', href: '/', match: '/' },
  { label: 'Events', href: '/events', match: '/events' },
  { label: 'Map', href: '/map', match: '/map' },
];

export default function AppHeader() {
  const user = useLagosLiveStore((s) => s.user);
  const pathname = usePathname();

  return (
    <div
      className="sticky top-0 z-40 hidden border-b backdrop-blur-[22px] backdrop-saturate-150 md:block"
      style={{ background: 'var(--c-header)', borderColor: 'rgba(255,255,255,0.04)' }}
    >
      <div className="mx-auto flex max-w-[1080px] items-center justify-between gap-3 px-5 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center" aria-label="Lagos Live — home">
            <SiteLogo />
          </Link>
          <nav className="flex items-center gap-1" aria-label="Primary">
            {NAV_LINKS.map((l) => {
              const active = l.match === '/' ? pathname === '/' : pathname.startsWith(l.match);
              return (
                <Link
                  key={l.label}
                  href={l.href}
                  className="rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors duration-200"
                  style={{ color: active ? '#FFFFFF' : '#A7A8B5', background: active ? 'rgba(255,255,255,0.06)' : 'transparent' }}
                >
                  <span className="transition-colors hover:text-white">{l.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <RoleNavButtons variant="inline" />

        <div className="flex items-center gap-2">
          <Link
            href={user ? '/profile' : '/login'}
            aria-label={user ? 'Profile' : 'Sign in'}
            className="flex h-[38px] items-center gap-1.5 rounded-full px-4 text-[12.5px] font-semibold transition-all duration-200 hover:shadow-glow-pink"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#A7A8B5' }}
          >
            <UserRound size={15} strokeWidth={2} />
            <span className="hidden lg:inline">{user ? (user.name || 'Profile').split(' ')[0] : 'Sign in'}</span>
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
