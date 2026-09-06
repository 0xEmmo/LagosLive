'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Plus, UserRound, Menu, X, Moon, Sun } from 'lucide-react';
import { SiteLogo } from '@/components/Logo';
import RoleNavButtons from '@/components/RoleNavButtons';
import { useLagosLiveStore } from '@/lib/store';
import { hostStartHref } from '@/lib/data';

// Global header. On md+ screens it renders the full desktop navbar; on mobile it
// becomes a compact bar with the logo + theme toggle + hamburger menu (the
// primary destinations stay in the bottom tab bar via BottomNav). The hamburger
// holds quick actions: Host an Event, role dashboard links, and sign in.
const NAV_LINKS = [
  { label: 'Home', href: '/', match: '/' },
  { label: 'Events', href: '/events', match: '/events' },
  { label: 'Map', href: '/map', match: '/map' },
];

export default function AppHeader() {
  const user = useLagosLiveStore((s) => s.user);
  const theme = useLagosLiveStore((s) => s.theme);
  const toggleTheme = useLagosLiveStore((s) => s.toggleTheme);
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Desktop + mobile top bar */}
      <div
        className="sticky top-0 z-40 border-b backdrop-blur-[22px] backdrop-saturate-150"
        style={{ background: 'var(--c-header)', borderColor: 'rgba(255,255,255,0.04)' }}
      >
        <div className="mx-auto flex max-w-[1080px] items-center justify-between gap-3 px-4 py-3 md:px-5 md:py-3">
          <Link href="/" className="flex items-center" aria-label="Lagos Live — home">
            <SiteLogo />
          </Link>

          {/* Desktop nav links */}
          <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
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

          <div className="hidden md:block">
            <RoleNavButtons variant="inline" />
          </div>

          <div className="flex items-center gap-2">
            {/* Theme toggle — visible on all sizes */}
            <button
              onClick={toggleTheme}
              aria-label="Toggle dark mode"
              className="flex h-[38px] w-[38px] items-center justify-center rounded-full transition-all duration-200"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#A7A8B5' }}
            >
              {theme === 'dark' ? (
                <Sun size={17} strokeWidth={2} className="text-[#00D9FF]" />
              ) : (
                <Moon size={17} strokeWidth={2} />
              )}
            </button>

            {/* Desktop sign in + host */}
            <Link
              href={user ? '/profile' : '/login'}
              aria-label={user ? 'Profile' : 'Sign in'}
              className="hidden h-[38px] items-center gap-1.5 rounded-full px-4 text-[12.5px] font-semibold transition-all duration-200 hover:shadow-glow-pink md:flex"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#A7A8B5' }}
            >
              <UserRound size={15} strokeWidth={2} />
              <span className="hidden lg:inline">{user ? (user.name || 'Profile').split(' ')[0] : 'Sign in'}</span>
            </Link>
            <Link
              href={hostStartHref(user)}
              className="hidden h-[38px] items-center gap-1.5 rounded-full px-4 text-[12.5px] font-bold text-white transition-all duration-200 hover:shadow-glow-pink active:opacity-80 md:flex"
              style={{ background: 'linear-gradient(135deg,#FF2D95,#8A2BE2)', boxShadow: '0 6px 20px rgba(255,45,149,0.25)' }}
            >
              <Plus size={14} strokeWidth={2.5} />
              Host an Event
            </Link>

            {/* Mobile hamburger */}
            <button
              onClick={() => setIsOpen(!isOpen)}
              aria-label="Toggle menu"
              aria-expanded={isOpen}
              className="flex h-[38px] w-[38px] items-center justify-center rounded-full transition-all duration-200 md:hidden"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFFFFF' }}
            >
              {isOpen ? <X size={18} strokeWidth={2.2} /> : <Menu size={18} strokeWidth={2.2} />}
            </button>
          </div>
        </div>

        {/* Mobile dropdown menu */}
        {isOpen && (
          <div
            className="absolute left-0 right-0 top-full border-b md:hidden"
            style={{ background: 'var(--c-header)', borderColor: 'rgba(255,255,255,0.06)' }}
          >
            <div className="px-4 py-3">
              <Link
                href={hostStartHref(user)}
                onClick={() => setIsOpen(false)}
                className="mb-3 flex w-full items-center justify-center gap-2 rounded-full px-4 py-3 text-[13px] font-bold text-white transition-all duration-200 active:opacity-80"
                style={{ background: 'linear-gradient(135deg,#FF2D95,#8A2BE2)', boxShadow: '0 6px 20px rgba(255,45,149,0.25)' }}
              >
                <Plus size={16} strokeWidth={2.5} />
                Host an Event
              </Link>

              {user && (
                <>
                  <Link
                    href="/host/events"
                    onClick={() => setIsOpen(false)}
                    className="flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold transition-all duration-200 active:scale-[0.98]"
                    style={{ background: 'rgba(0,245,212,0.1)', border: '1px solid rgba(0,245,212,0.3)', color: '#00F5D4' }}
                  >
                    My Events
                    <span style={{ color: '#00F5D4' }}>→</span>
                  </Link>
                  {user.isAdmin && (
                    <Link
                      href="/admin/dashboard"
                      onClick={() => setIsOpen(false)}
                      className="mt-2 flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold transition-all duration-200 active:scale-[0.98] shadow-glow-pink"
                      style={{ background: 'linear-gradient(135deg,#FF2D95,#8A2BE2)', color: '#FFFFFF' }}
                    >
                      Admin Dashboard
                      <span style={{ color: 'rgba(255,255,255,0.85)' }}>→</span>
                    </Link>
                  )}
                </>
              )}

              <Link
                href={user ? '/profile' : '/login'}
                onClick={() => setIsOpen(false)}
                className="mt-2 flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold transition-all duration-200 active:scale-[0.98]"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#A7A8B5' }}
              >
                {user ? 'Profile' : 'Sign In'}
                <span style={{ color: '#A7A8B5' }}>→</span>
              </Link>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
