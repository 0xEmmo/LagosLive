'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import {
  Home,
  Plus,
  Menu,
  X,
  ChevronLeft,
  Moon,
  Sun,
  LayoutDashboard,
  CalendarDays,
  ListOrdered,
  Wallet,
  BarChart3,
  Settings,
  LifeBuoy,
  LogOut,
} from 'lucide-react';
import { useLagosLiveStore } from '@/lib/store';

const HOST_LINKS = [
  { href: '/host', match: '/host', exact: true, label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/host/events', match: '/host/events', label: 'My Events', Icon: CalendarDays },
  { href: '/host/orders', match: '/host/orders', label: 'Orders', Icon: ListOrdered },
  { href: '/host/payouts', match: '/host/payouts', label: 'Payouts', Icon: Wallet },
  { href: '/host/analytics', match: '/host/analytics', label: 'Analytics', Icon: BarChart3 },
  { href: '/host/settings', match: '/host/settings', label: 'Settings', Icon: Settings },
];

interface HostDashboardNavProps {
  title?: string;
  backHref?: string;
  /** Page-specific actions (e.g. View / Edit / Check-in). Rendered inline on md+, inside the mobile menu panel on small screens. */
  action?: ReactNode;
}

export default function HostDashboardNav({ title = 'Host Dashboard', backHref, action }: HostDashboardNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const theme = useLagosLiveStore((s) => s.theme);
  const toggleTheme = useLagosLiveStore((s) => s.toggleTheme);
  const logout = useLagosLiveStore((s) => s.logout);
  const [open, setOpen] = useState(false);

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  const signOut = async () => {
    setOpen(false);
    try {
      await logout();
    } finally {
      router.push('/');
    }
  };

  return (
    <>
      <div
        className="sticky top-0 z-40 border-b backdrop-blur-[22px] backdrop-saturate-150"
        style={{ background: 'var(--c-header)', borderColor: 'rgba(255,255,255,0.04)' }}
      >
        <div className="mx-auto flex max-w-[1000px] items-center gap-2 px-4 py-3">
          <Link
            href="/"
            aria-label="Home"
            className="flex h-[40px] w-[40px] flex-shrink-0 items-center justify-center rounded-[10px] transition-all duration-200 active:scale-90"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#A7A8B5' }}
          >
            <Home size={17} strokeWidth={2} />
          </Link>

          {backHref && backHref !== '/' && (
            <Link
              href={backHref}
              aria-label="Back"
              className="flex h-[40px] w-[40px] flex-shrink-0 items-center justify-center rounded-[10px] transition-all duration-200 active:scale-90"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#A7A8B5' }}
            >
              <ChevronLeft size={18} strokeWidth={2} />
            </Link>
          )}

          <span
            className="min-w-0 flex-1 truncate font-heading text-[13px] font-bold uppercase tracking-[1px] md:flex-none"
            style={{ color: '#FFFFFF' }}
          >
            {title}
          </span>

          {/* Desktop inline nav */}
          <nav className="ml-auto hidden items-center gap-1 md:flex" aria-label="Host dashboard">
            {HOST_LINKS.map(({ href, match, exact, label, Icon }) => {
              const active = isActive(exact ? href : match, exact);
              return (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-[12.5px] font-semibold transition-all duration-150"
                  style={active ? { background: 'rgba(255,45,149,0.12)', color: '#FF2D95' } : { color: '#A7A8B5' }}
                >
                  <Icon size={14} strokeWidth={2.2} />
                  <span>{label}</span>
                  {active && (
                    <span className="h-[3px] w-[14px] rounded-full" style={{ background: 'linear-gradient(90deg,#FF2D95,#8A2BE2)' }} />
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2 md:ml-2">
            {action && <div className="hidden md:block">{action}</div>}

            <Link
              href="/host/new"
              className="flex h-[38px] items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-bold text-white transition-all duration-200 hover:shadow-glow-pink active:scale-95"
              style={{ background: 'linear-gradient(135deg,#FF2D95,#8A2BE2)', boxShadow: '0 6px 20px rgba(255,45,149,0.25)' }}
            >
              <Plus size={14} strokeWidth={2.5} />
              <span className="hidden sm:inline">New Event</span>
              <span className="sm:hidden">New</span>
            </Link>

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
              className="flex h-[38px] w-[38px] items-center justify-center rounded-full transition-all duration-200 md:hidden"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFFFFF' }}
            >
              {open ? <X size={18} strokeWidth={2.2} /> : <Menu size={18} strokeWidth={2.2} />}
            </button>
          </div>
        </div>

        {/* Mobile dropdown menu */}
        {open && (
          <div
            className="animate-fade-in absolute left-0 right-0 top-full border-b md:hidden"
            style={{ background: 'var(--c-header)', borderColor: 'rgba(255,255,255,0.06)' }}
          >
            <div className="flex max-h-[72vh] flex-col overflow-y-auto px-4 py-3">
              {action && <div className="mb-2 flex gap-2">{action}</div>}

              <div className="flex flex-col gap-1">
                {HOST_LINKS.map(({ href, match, exact, label, Icon }) => {
                  const active = isActive(exact ? href : match, exact);
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setOpen(false)}
                      className="flex min-h-[48px] items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-200 active:scale-[0.98]"
                      style={
                        active
                          ? { background: 'rgba(255,45,149,0.1)', color: '#FF2D95' }
                          : { color: '#A7A8B5' }
                      }
                    >
                      <Icon size={17} strokeWidth={2.1} />
                      <span className="flex-1">{label}</span>
                      {active && <span className="h-[16px] w-[3px] rounded-full" style={{ background: '#FF2D95' }} />}
                    </Link>
                  );
                })}
              </div>

              <div className="my-2 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />

              <Link
                href="/support"
                onClick={() => setOpen(false)}
                className="flex min-h-[48px] items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-200 active:scale-[0.98]"
                style={{ color: '#A7A8B5' }}
              >
                <LifeBuoy size={17} strokeWidth={2.1} />
                Help
              </Link>
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
    </>
  );
}