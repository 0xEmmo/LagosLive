'use client';

import { usePathname } from 'next/navigation';
import AppHeader from '@/components/home/HomeNavbar';
import Footer from '@/components/Footer';
import BottomNav from '@/components/BottomNav';
import HostBottomNav from '@/components/HostBottomNav';

type Placement = 'header' | 'footer' | 'bottom';

export default function GlobalChrome({ placement }: { placement: Placement }) {
  const pathname = usePathname() ?? '/';
  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/');
  const isHost = pathname === '/host' || pathname.startsWith('/host/');
  const isCheckIn = pathname.includes('/check-in');
  const isAuthPage = pathname === '/login' || pathname === '/signup';
  const dashboardOwnsChrome = isAdmin || isHost || isCheckIn;
  const pageOwnsChrome = dashboardOwnsChrome || isAuthPage;

  if (placement === 'header') return pageOwnsChrome ? null : <AppHeader />;
  if (placement === 'footer') return pageOwnsChrome ? null : <Footer />;
  if (isHost && !isCheckIn) return <HostBottomNav />;
  if (pageOwnsChrome) return null;
  return <BottomNav />;
}
