'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  CalendarDays,
  Flame,
  Users,
  UserCog,
  ShoppingBag,
  Wallet,
  BarChart3,
  MessageSquareQuote,
  Tag,
  IdCard,
  Shield,
  LifeBuoy,
  ScrollText,
  Settings,
  Home,
  Menu,
  X,
  Moon,
  Sun,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import { useLagosLiveStore, type User } from '@/lib/store';
import { isAdmin, type Role } from '@/lib/authz';
import { rolePermissions } from '@/lib/rbac';

export interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles?: Role[];
  permissions?: readonly string[];
}

export const ADMIN_NAV: AdminNavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'super_admin'] },
  { href: '/admin/events', label: 'Events', icon: CalendarDays, permissions: ['events.view'] },
  { href: '/admin/trending', label: 'Trending', icon: Flame, permissions: ['events.edit'] },
  { href: '/admin/hosts', label: 'Hosts', icon: Users, permissions: ['hosts.view'] },
  { href: '/admin/users', label: 'Users', icon: UserCog, permissions: ['staff.suspend'] },
  { href: '/admin/roles', label: 'Roles', icon: Shield, permissions: ['staff.permissions'] },
  { href: '/admin/staff', label: 'Staff', icon: IdCard, permissions: ['staff.view'] },
  { href: '/admin/orders', label: 'Orders', icon: ShoppingBag, permissions: ['orders.view'] },
  { href: '/admin/reviews', label: 'Reviews', icon: MessageSquareQuote, permissions: ['reviews.view'] },
  { href: '/admin/promos', label: 'Promos', icon: Tag, permissions: ['promos.view'] },
  { href: '/admin/revenue', label: 'Revenue', icon: Wallet, permissions: ['revenue.view'] },
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart3, permissions: ['analytics.view'] },
  { href: '/admin/support', label: 'Support', icon: LifeBuoy, permissions: ['support.view'] },
  { href: '/admin/logs', label: 'Audit Logs', icon: ScrollText, permissions: ['audit.view'] },
  { href: '/admin/settings', label: 'Settings', icon: Settings, permissions: ['settings.view'] },
];

export function filterAdminNav(user: User | null): AdminNavItem[] {
  if (!user) return [];
  const effectivePerms = user.permissions ?? rolePermissions(user.role);
  return ADMIN_NAV.filter((item) => {
    const hasRole = item.roles?.length ? item.roles.includes(user.role) || isAdmin(user.role) : false;
    const hasPerm = item.permissions?.length ? item.permissions.some((p) => effectivePerms.includes(p)) : false;
    if (user.role === 'super_admin') return true;
    if (item.permissions?.length) return hasPerm;
    if (item.roles?.length) return hasRole;
    return true;
  });
}

const GROUPS: { label: string; hrefs: string[] }[] = [
  { label: 'Overview', hrefs: ['/admin'] },
  { label: 'Operations', hrefs: ['/admin/events', '/admin/trending', '/admin/hosts', '/admin/users', '/admin/orders'] },
  { label: 'Finance', hrefs: ['/admin/revenue'] },
  { label: 'Analytics & Reviews', hrefs: ['/admin/analytics', '/admin/reviews'] },
  { label: 'Promos & Marketing', hrefs: ['/admin/promos'] },
  { label: 'Staff & Roles', hrefs: ['/admin/staff', '/admin/roles'] },
  { label: 'Support', hrefs: ['/admin/support'] },
  { label: 'Settings', hrefs: ['/admin/settings', '/admin/logs'] },
];

function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || (href !== '/admin' && pathname.startsWith(href));
}

export default function AdminDashboardNav() {
  const router = useRouter();
  const pathname = usePathname();
  const user = useLagosLiveStore((s) => s.user);
  const theme = useLagosLiveStore((s) => s.theme);
  const toggleTheme = useLagosLiveStore((s) => s.toggleTheme);
  const logout = useLagosLiveStore((s) => s.logout);
  const [open, setOpen] = useState(false);

  const items = useMemo(() => filterAdminNav(user), [user]);
  const byHref = new Map(items.map((i) => [i.href, i]));

  const groups = GROUPS.map((g) => ({
    label: g.label,
    items: g.hrefs.map((href) => byHref.get(href)).filter((x): x is AdminNavItem => !!x),
  })).filter((g) => g.items.length > 0);

  const signOut = async () => {
    setOpen(false);
    try {
      await logout();
    } finally {
      router.push('/');
    }
  };

  return (
    <div
      className="sticky top-0 z-40 border-b backdrop-blur-[22px] backdrop-saturate-150 md:hidden"
      style={{ background: 'var(--c-header)', borderColor: 'rgba(255,255,255,0.04)' }}
    >
      <div className="flex items-center gap-2.5 px-4 py-3">
        <Link
          href="/"
          aria-label="Home"
          className="flex h-[40px] w-[40px] flex-shrink-0 items-center justify-center rounded-[10px] transition-all duration-200 active:scale-90"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#A7A8B5' }}
        >
          <Home size={17} strokeWidth={2} />
        </Link>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: 'linear-gradient(135deg,#FF2D95,#8A2BE2)' }}>
            <ShieldCheck size={14} strokeWidth={2.2} color="#FFFFFF" />
          </div>
          <span className="font-heading text-[12px] font-bold uppercase tracking-[1px]" style={{ color: '#FFFFFF' }}>
            Admin Dashboard
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={toggleTheme}
            aria-label="Toggle dark mode"
            className="flex h-[38px] w-[38px] items-center justify-center rounded-full transition-all duration-200"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#A7A8B5' }}
          >
            {theme === 'dark' ? <Sun size={17} strokeWidth={2} className="text-[#00D9FF]" /> : <Moon size={17} strokeWidth={2} />}
          </button>
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label="Toggle menu"
            aria-expanded={open}
            className="flex h-[38px] w-[38px] items-center justify-center rounded-full transition-all duration-200"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFFFFF' }}
          >
            {open ? <X size={18} strokeWidth={2.2} /> : <Menu size={18} strokeWidth={2.2} />}
          </button>
        </div>
      </div>

      {open && (
        <div
          className="animate-fade-in absolute left-0 right-0 top-full border-b"
          style={{ background: 'var(--c-header)', borderColor: 'rgba(255,255,255,0.06)' }}
        >
          <div className="flex max-h-[72vh] flex-col overflow-y-auto px-4 py-3">
            {groups.map((group) => (
              <div key={group.label} className="mb-1">
                <div className="mb-1 px-4 pt-2 text-[10px] font-bold uppercase tracking-[1.2px]" style={{ color: '#6B6C80' }}>
                  {group.label}
                </div>
                <div className="flex flex-col gap-0.5">
                  {group.items.map((item) => {
                    const active = isActivePath(pathname, item.href);
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className="flex min-h-[48px] items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-200 active:scale-[0.98]"
                        style={
                          active
                            ? { background: 'rgba(255,45,149,0.1)', color: '#FF2D95' }
                            : { color: '#A7A8B5' }
                        }
                      >
                        <Icon size={17} strokeWidth={2.1} />
                        <span className="flex-1">{item.label}</span>
                        {active && <span className="h-[16px] w-[3px] rounded-full" style={{ background: '#FF2D95' }} />}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="my-2 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />

            <Link
              href="/"
              onClick={() => setOpen(false)}
              className="flex min-h-[48px] items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-200 active:scale-[0.98]"
              style={{ color: '#A7A8B5' }}
            >
              <Home size={17} strokeWidth={2.1} />
              Back to site
            </Link>
            <button
              onClick={signOut}
              className="flex min-h-[48px] items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-200 active:scale-[0.98]"
              style={{ color: '#FF2D95' }}
            >
              <LogOut size={17} strokeWidth={2.1} />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}