'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, CalendarDays, ListOrdered, Wallet, BarChart3 } from 'lucide-react';

const HOST_ITEMS = [
  { href: '/host/dashboard', match: '/host/dashboard', exact: true, label: 'Home', Icon: LayoutDashboard },
  { href: '/host/events', match: '/host/events', label: 'Events', Icon: CalendarDays },
  { href: '/host/orders', match: '/host/orders', label: 'Orders', Icon: ListOrdered },
  { href: '/host/payouts', match: '/host/payouts', label: 'Payouts', Icon: Wallet },
  { href: '/host/analytics', match: '/host/analytics', label: 'Analytics', Icon: BarChart3 },
];

// Mobile-only host navigation. Settings and support remain available in the
// host menu; this bottom bar prioritizes daily event and sales operations.
export default function HostBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t backdrop-blur-[28px] backdrop-saturate-150 md:hidden"
      style={{ background: 'var(--c-nav)', borderColor: 'rgba(255,255,255,0.08)', paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}
      aria-label="Organizer dashboard navigation"
    >
      <div className="mx-auto flex max-w-[720px] items-center justify-around px-1 pt-2">
        {HOST_ITEMS.map(({ href, match, exact, label, Icon }) => {
          const active = exact ? pathname === match : pathname.startsWith(match);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className="flex min-h-[52px] min-w-[56px] flex-col items-center justify-center gap-0.5 py-1.5 font-body text-[10px] transition-all duration-200 active:scale-90"
              style={{ color: active ? '#75A1FF' : '#788292' }}
            >
              <Icon size={20} strokeWidth={active ? 2.2 : 1.6} />
              <span className={active ? 'font-semibold' : ''}>{label}</span>
              <span
                className="h-[3px] rounded-full transition-all duration-300 ease-out"
                style={{ width: active ? '18px' : '0px', background: active ? 'linear-gradient(90deg,#2B68FF,#75A1FF)' : 'transparent' }}
              />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
