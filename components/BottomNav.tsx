'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Map as MapIcon, User, CalendarDays, LogIn } from 'lucide-react';
import { useLagosLiveStore } from '@/lib/store';

// Mobile bottom nav — hidden on desktop (md+), where the global header takes
// over. Always exactly four destinations:
//   signed out: Home | Events | Map | Sign in
//   signed in:  Home | Events | Map | Profile
// Saved and Tickets deliberately live inside Profile, not as first-class items.

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
  const user = useLagosLiveStore((s) => s.user);

  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  const items = [...BASE_ITEMS, user ? AUTH_ITEM : GUEST_ITEM];

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 border-t backdrop-blur-[28px] backdrop-saturate-150 md:hidden"
      style={{ background: 'var(--c-nav)', borderColor: 'rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-center justify-around px-0 pb-[10px] pt-2">
        {items.map(({ href, match, label, Icon }) => {
          const active = match === '/' ? pathname === '/' : pathname.startsWith(match);
          return (
            <Link
              key={href}
              href={href}
              className="group flex min-w-[52px] flex-col items-center gap-0.5 py-1.5 font-body text-[10px] transition-all duration-200 active:scale-90"
              style={{ color: active ? '#FF2D95' : '#6B6C80' }}
            >
              <div className="relative">
                <Icon size={22} strokeWidth={active ? 2.2 : 1.6} />
                {active && (
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{
                      background: 'radial-gradient(circle, rgba(255,45,149,0.2) 0%, transparent 70%)',
                      filter: 'blur(4px)',
                    }}
                  />
                )}
              </div>
              <span className={active ? 'font-semibold' : ''}>{label}</span>
              <div
                className="h-[3px] rounded-full transition-all duration-300 ease-out"
                style={{
                  width: active ? '20px' : '0px',
                  background: active ? 'linear-gradient(90deg, #FF2D95, #8A2BE2)' : 'transparent',
                  boxShadow: active ? '0 0 10px rgba(255,45,149,0.5)' : 'none',
                }}
              />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
