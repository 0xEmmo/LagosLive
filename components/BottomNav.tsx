'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Map as MapIcon, User, CalendarDays, LogIn } from 'lucide-react';
import { useLagosLiveStore } from '@/lib/store';

const BASE_ITEMS = [
  { href: '/', match: '/', label: 'Home', Icon: Home },
  { href: '/events', match: '/events', label: 'Events', Icon: CalendarDays },
  { href: '/map', match: '/map', label: 'Map', Icon: MapIcon },
];
const AUTH_ITEM = { href: '/profile', match: '/profile', label: 'Profile', Icon: User };
const GUEST_ITEM = { href: '/login', match: '/login', label: 'Sign in', Icon: LogIn };
const HIDDEN_PREFIXES = ['/login', '/signup', '/checkout'];

export default function BottomNav() {
  const pathname = usePathname();
  const user = useLagosLiveStore((state) => state.user);

  if (HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;
  const items = [...BASE_ITEMS, user ? AUTH_ITEM : GUEST_ITEM];

  return (
    <nav className="ll-bottom-nav" aria-label="Mobile navigation">
      {items.map(({ href, match, label, Icon }) => {
        const active = match === '/' ? pathname === '/' : pathname.startsWith(match);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`ll-bottom-nav__item${active ? ' is-active' : ''}`}
          >
            <Icon size={21} strokeWidth={active ? 2.2 : 1.7} aria-hidden="true" />
            <span>{label}</span>
            <i aria-hidden="true" />
          </Link>
        );
      })}
    </nav>
  );
}
