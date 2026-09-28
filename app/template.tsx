'use client';

import { usePathname } from 'next/navigation';

export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/';
  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/');
  const isHost = pathname === '/host' || pathname.startsWith('/host/');
  const isCheckIn = pathname.includes('/check-in');
  const scope = pathname === '/'
    ? 'home'
    : isAdmin
      ? 'admin'
      : isCheckIn && isHost
        ? 'host-checkin'
        : isCheckIn
          ? 'checkin'
          : isHost
            ? 'host'
            : 'public';

  return (
    <div className={`route-transition route-scope route-scope--${scope}`} data-route-scope={scope}>
      {children}
    </div>
  );
}
