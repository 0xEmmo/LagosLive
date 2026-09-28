'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { ShieldCheck } from 'lucide-react';
import AdminDashboardNav, { ADMIN_NAV_GROUPS, filterAdminNav, type AdminNavItem } from '@/components/AdminDashboardNav';
import ThemeToggle from '@/components/ThemeToggle';
import { useLagosLiveStore } from '@/lib/store';

export { type AdminNavItem, ADMIN_NAV } from '@/components/AdminDashboardNav';

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const user = useLagosLiveStore((s) => s.user);
  const items = useMemo(() => filterAdminNav(user), [user]);
  const byHref = new Map(items.map((item) => [item.href, item]));
  const groups = ADMIN_NAV_GROUPS
    .map((group) => ({
      label: group.label,
      items: group.hrefs.map((href) => byHref.get(href)).filter((item): item is AdminNavItem => !!item),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="ll-admin-shell flex min-h-screen flex-col md:flex-row" style={{ paddingBottom: 0 }}>
      <aside
        className="sticky top-0 z-40 hidden w-full shrink-0 border-b backdrop-blur-[22px] md:flex md:h-[100dvh] md:w-[244px] md:flex-col md:border-b-0 md:border-r"
        style={{ background: 'var(--c-header)', borderColor: 'rgba(255,255,255,0.08)' }}
      >
        <div className="hidden items-center gap-3 px-5 py-6 md:flex">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'linear-gradient(135deg,#1F5FFF,#6E8DFF)', boxShadow: '0 8px 24px rgba(43,104,255,0.22)' }}>
            <ShieldCheck size={19} strokeWidth={2.2} color="#FFFFFF" />
          </div>
          <div className="min-w-0">
            <div className="font-heading text-[13px] font-bold uppercase tracking-[1px]" style={{ color: '#FFFFFF' }}>Admin</div>
            <div className="mt-0.5 truncate text-[10px]" style={{ color: '#8D95A3' }}>{user?.name ?? 'Platform workspace'}</div>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-3" aria-label="Admin navigation">
          {groups.map((group) => (
            <div key={group.label}>
              <div className="mb-1.5 px-3 text-[9px] font-bold uppercase tracking-[1.3px]" style={{ color: '#697383' }}>{group.label}</div>
              <div className="flex flex-col gap-1">
                {group.items.map((item) => {
                  const active = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className="flex min-h-[40px] items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2 text-[12px] font-semibold transition-all duration-150"
                      style={active
                        ? { background: 'rgba(43,104,255,0.14)', color: '#80A9FF', border: '1px solid rgba(86,136,255,0.22)' }
                        : { color: '#A5ACB8', border: '1px solid transparent' }}
                    >
                      <Icon size={15} strokeWidth={2.1} />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="hidden items-center justify-between border-t px-5 py-4 md:flex" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <Link href="/" className="flex items-center gap-2 text-[12px] font-semibold transition-colors hover:text-white" style={{ color: '#828B99' }}>
            ← Back to site
          </Link>
          <ThemeToggle className="theme-toggle-wrap--compact" />
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <AdminDashboardNav />
        {children}
      </main>
    </div>
  );
}
