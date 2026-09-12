'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { ShieldCheck } from 'lucide-react';
import AdminDashboardNav, { filterAdminNav, type AdminNavItem } from '@/components/AdminDashboardNav';
import { useLagosLiveStore } from '@/lib/store';

export { type AdminNavItem, ADMIN_NAV } from '@/components/AdminDashboardNav';

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const user = useLagosLiveStore((s) => s.user);

  const items = useMemo(() => filterAdminNav(user), [user]);

  return (
    <div className="flex min-h-screen flex-col md:flex-row" style={{ paddingBottom: 0 }}>
      <aside
        className="sticky top-0 z-40 hidden w-full shrink-0 border-b backdrop-blur-[22px] md:flex md:h-[100dvh] md:w-[220px] md:flex-col md:border-b-0 md:border-r"
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

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
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
        <AdminDashboardNav />
        {children}
      </main>
    </div>
  );
}