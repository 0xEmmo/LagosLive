'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  ShoppingBag,
  Wallet,
  BarChart3,
  Settings,
  LifeBuoy,
  ScrollText,
  Shield,
  ShieldCheck,
  MessageSquareQuote,
  Activity,
} from 'lucide-react';
import { useLagosLiveStore } from '@/lib/store';
import { isAdmin, type Role } from '@/lib/authz';

export interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles?: Role[];
}

const NAV: AdminNavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'super_admin'] },
  { href: '/admin/events', label: 'Events', icon: CalendarDays, roles: ['admin', 'super_admin'] },
  { href: '/admin/hosts', label: 'Hosts', icon: Users, roles: ['admin', 'super_admin'] },
  { href: '/admin/users', label: 'Users', icon: Users, roles: ['support', 'admin', 'super_admin'] },
  { href: '/admin/roles', label: 'Roles', icon: Shield, roles: ['admin', 'super_admin'] },
  { href: '/admin/orders', label: 'Orders', icon: ShoppingBag, roles: ['finance', 'admin', 'super_admin'] },
  { href: '/admin/reviews', label: 'Reviews', icon: MessageSquareQuote, roles: ['support', 'admin', 'super_admin'] },
  { href: '/admin/revenue', label: 'Revenue', icon: Wallet, roles: ['finance', 'admin', 'super_admin'] },
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart3, roles: ['admin', 'super_admin'] },
  { href: '/admin/support', label: 'Support', icon: LifeBuoy, roles: ['support', 'admin', 'super_admin'] },
  { href: '/admin/logs', label: 'Audit Logs', icon: ScrollText, roles: ['admin', 'super_admin'] },
  { href: '/admin/settings', label: 'Settings', icon: Settings, roles: ['admin', 'super_admin'] },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const user = useLagosLiveStore((s) => s.user);

  const items = useMemo(
    () => NAV.filter((i) => !i.roles || (user && (i.roles.includes(user.role) || isAdmin(user.role)))),
    [user]
  );

  return (
    <div className="flex min-h-screen flex-col md:flex-row" style={{ paddingBottom: 0 }}>
      <aside
        className="sticky top-0 z-40 flex w-full shrink-0 border-b backdrop-blur-[22px] md:h-[100dvh] md:w-[220px] md:flex-col md:border-b-0 md:border-r"
        style={{ background: 'var(--c-header)', borderColor: 'rgba(255,255,255,0.06)' }}
      >
        <div className="hidden items-center gap-2.5 px-5 py-5 md:flex">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: 'linear-gradient(135deg,#FF2D95,#8A2BE2)' }}>
            <ShieldCheck size={18} strokeWidth={2.2} color="#FFFFFF" />
          </div>
          <div>
            <div className="font-heading text-[13px] font-bold uppercase tracking-[1px]" style={{ color: '#FFFFFF' }}>Admin</div>
            <div className="text-[10px]" style={{ color: '#A7A8B5' }}>{user?.name ?? '—'}</div>
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 py-2.5 md:flex-1 md:flex-col md:gap-1 md:overflow-visible md:px-3 md:py-2">
          {items.map((item) => {
            const active = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2.5 whitespace-nowrap rounded-[10px] px-3 py-2 text-[12.5px] font-semibold transition-all duration-150"
                style={
                  active
                    ? { background: 'rgba(255,45,149,0.12)', color: '#FF2D95' }
                    : { color: '#A7A8B5' }
                }
              >
                <Icon size={15} strokeWidth={2.2} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="hidden border-t px-5 py-4 md:block" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <Link href="/" className="flex items-center gap-2 text-[12px] font-semibold" style={{ color: '#6B6C80' }}>
            ← Back to site
          </Link>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <div className="md:hidden sticky top-0 z-30 flex items-center gap-3 border-b px-4 py-3 backdrop-blur-[22px]" style={{ background: 'var(--c-header)', borderColor: 'rgba(255,255,255,0.04)' }}>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: 'linear-gradient(135deg,#FF2D95,#8A2BE2)' }}>
              <ShieldCheck size={14} strokeWidth={2.2} color="#FFFFFF" />
            </div>
            <span className="font-heading text-[12px] font-bold uppercase tracking-[1px]" style={{ color: '#FFFFFF' }}>Admin</span>
          </div>
          <Link href="/" className="ml-auto text-[11px] font-semibold" style={{ color: '#6B6C80' }}>Back to site</Link>
        </div>
        {children}
      </main>
    </div>
  );
}
