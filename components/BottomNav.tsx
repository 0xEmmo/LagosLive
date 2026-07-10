'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Search, Map as MapIcon, Heart, User } from 'lucide-react';
import { useLagosLiveStore } from '@/lib/store';

const ITEMS = [
  { href: '/', match: '/', label: 'Home', Icon: Home },
  { href: '/search', match: '/search', label: 'Search', Icon: Search },
  { href: '/map', match: '/map', label: 'Map', Icon: MapIcon },
  { href: '/saved', match: '/saved', label: 'Saved', Icon: Heart },
  { href: '/profile', match: '/profile', label: 'Profile', Icon: User },
];

const HIDDEN_PREFIXES = ['/login', '/signup', '/checkout'];

export default function BottomNav() {
  const pathname = usePathname();
  const user = useLagosLiveStore((s) => s.user);

  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 border-t backdrop-blur-[28px]"
      style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border2)' }}
    >
      <div className="flex items-center justify-around px-0 pb-[10px] pt-2">
        {ITEMS.map(({ href, match, label, Icon }) => {
          const finalHref = label === 'Profile' && !user ? '/login' : href;
          const active = match === '/' ? pathname === '/' : pathname.startsWith(match);
          return (
            <Link
              key={href}
              href={finalHref}
              className="flex min-w-[52px] flex-col items-center gap-0.5 py-1.5 font-body text-[10px] transition-colors"
              style={{
                color: active ? '#552CB7' : 'var(--c-text-dim)',
                fontWeight: active ? 600 : 400,
              }}
            >
              <Icon size={22} strokeWidth={1.8} fill={active && Icon === Home ? 'currentColor' : 'none'} />
              <span>{label}</span>
              <div
                className="h-[3px] rounded-full transition-all"
                style={{
                  width: active ? '14px' : '4px',
                  background: active ? '#552CB7' : 'transparent',
                }}
              />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
