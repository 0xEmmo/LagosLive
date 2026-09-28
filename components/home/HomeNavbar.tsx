'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Plus, UserRound, Menu, X } from 'lucide-react';
import RoleNavButtons from '@/components/RoleNavButtons';
import { useLagosLiveStore } from '@/lib/store';
import { hostStartHref } from '@/lib/data';
import { SiteLogo } from '@/components/Logo';

const NAV_LINKS = [
  { label: 'Home', href: '/', match: '/' },
  { label: 'Events', href: '/events', match: '/events' },
  { label: 'Map', href: '/map', match: '/map' },
  { label: 'About', href: '/about', match: '/about' },
];

export default function AppHeader() {
  const user = useLagosLiveStore((state) => state.user);
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="ll-site-header sticky top-0 z-40">
      <div className="ll-site-header__inner">
        <Link href="/" className="ll-site-wordmark" aria-label="Lagos Live — home">
          <SiteLogo priority />
        </Link>

        <nav className="ll-site-nav" aria-label="Primary navigation">
          {NAV_LINKS.map((link) => {
            const active = link.match === '/' ? pathname === '/' : pathname.startsWith(link.match);
            return (
              <Link
                key={link.label}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={`ll-site-nav__link${active ? ' is-active' : ''}`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="ll-site-header__desktop-actions">
          <RoleNavButtons variant="inline" />
          <Link href={user ? '/profile' : '/login'} className="ll-site-signin">
            <UserRound size={14} strokeWidth={2} />
            <span>{user ? (user.name || 'Profile').split(' ')[0] : 'Sign in'}</span>
          </Link>
          <Link href={hostStartHref(user)} className="ll-site-host">
            <Plus size={14} strokeWidth={2.5} /> Host an event
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-label={isOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={isOpen}
          aria-controls="ll-mobile-menu"
          className="ll-site-menu-toggle"
        >
          {isOpen ? <X size={19} /> : <Menu size={19} />}
        </button>
      </div>

      {isOpen && (
        <div id="ll-mobile-menu" className="ll-mobile-menu">
          <nav aria-label="Mobile navigation">
            {NAV_LINKS.map((link) => (
              <Link key={link.label} href={link.href} onClick={() => setIsOpen(false)}>
                {link.label}
              </Link>
            ))}
          </nav>
          {user && <RoleNavButtons variant="stack" />}
          <div className="ll-mobile-menu__actions">
            <Link href={hostStartHref(user)} onClick={() => setIsOpen(false)} className="ll-site-host">
              <Plus size={15} /> Host an event
            </Link>
            <Link href={user ? '/profile' : '/login'} onClick={() => setIsOpen(false)} className="ll-site-signin">
              <UserRound size={15} /> {user ? 'Profile' : 'Sign in'}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
