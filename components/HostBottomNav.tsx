'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, ListOrdered, Wallet, BarChart3, Settings } from 'lucide-react';

const HOST_ITEMS = [
  { href: '/host', match: '/host', exact: true, label: 'Home', Icon: LayoutDashboard },
  { href: '/host/orders', match: '/host/orders', label: 'Orders', Icon: ListOrdered },
  { href: '/host/payouts', match: '/host/payouts', label: 'Payouts', Icon: Wallet },
  { href: '/host/analytics', match: '/host/analytics', label: 'Analytics', Icon: BarChart3 },
  { href: '/host/settings', match: '/host/settings', label: 'Settings', Icon: Settings },
];

// Mobile-only bottom navigation for the host dashboard. Rendered as an overlay
// on the host's compact max-w-[600px] pages; hidden on md+ where the sticky
// header links are used instead.
export default function HostBottomNav() {
  const pathname = usePathname();

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 border-t backdrop-blur-[28px] backdrop-saturate-150 md:hidden"
      style={{ background: 'var(--c-nav)', borderColor: 'rgba(255,255,255,0.06)' }}
    >
      <div className="mx-auto flex max-w-[600px] items-center justify-around px-0 pb-[10px] pt-2">
        {HOST_ITEMS.map(({ href, match, exact, label, Icon }) => {
          const active = exact ? pathname === match : pathname.startsWith(match);
          return (
            <Link
              key={href}
              href={href}
              className="flex min-w-[56px] flex-col items-center gap-0.5 py-1.5 font-body text-[10px] transition-all duration-200 active:scale-90"
              style={{ color: active ? '#FF2D95' : '#6B6C80' }}
            >
              <Icon size={21} strokeWidth={active ? 2.2 : 1.6} />
              <span className={active ? 'font-semibold' : ''}>{label}</span>
              <div
                className="h-[3px] rounded-full transition-all duration-300 ease-out"
                style={{
                  width: active ? '18px' : '0px',
                  background: active ? 'linear-gradient(90deg, #FF2D95, #8A2BE2)' : 'transparent',
                }}
              />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
