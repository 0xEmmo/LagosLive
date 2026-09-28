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
  const dashboardOwnsChrome = isAdmin || isHost || isCheckIn;

  if (placement === 'header') return dashboardOwnsChrome ? null : <AppHeader />;
  if (placement === 'footer') return dashboardOwnsChrome ? null : <Footer />;
  if (isHost && !isCheckIn) return <HostBottomNav />;
  if (dashboardOwnsChrome) return null;
  return <BottomNav />;
}
