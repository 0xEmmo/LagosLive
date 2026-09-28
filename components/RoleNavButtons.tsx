'use client';

import Link from 'next/link';
import { ShieldCheck, CalendarDays } from 'lucide-react';
import { useLagosLiveStore } from '@/lib/store';
import type { User } from '@/lib/store';

const ADMIN_DASHBOARD_ROLES: User['role'][] = ['super_admin', 'admin', 'finance', 'support'];
const HOST_DASHBOARD_ROLES: User['role'][] = ['organizer', 'admin', 'super_admin'];

type Variant = 'stack' | 'inline';

export default function RoleNavButtons({ variant = 'stack' }: { variant?: Variant }) {
  const user = useLagosLiveStore((state) => state.user);
  if (!user) return null;

  const isAdmin = ADMIN_DASHBOARD_ROLES.includes(user.role);
  const isHost = HOST_DASHBOARD_ROLES.includes(user.role);
  if (!isAdmin && !isHost) return null;

  if (variant === 'inline') {
    return (
      <div className="ll-role-nav ll-role-nav--inline">
        {isAdmin && <Link href="/admin/dashboard"><ShieldCheck size={14} /> Admin</Link>}
        {isHost && <Link href="/host/events"><CalendarDays size={14} /> My Events</Link>}
      </div>
    );
  }

  return (
    <div className="ll-role-nav ll-role-nav--stack">
      {isAdmin && <Link href="/admin/dashboard"><ShieldCheck size={15} /> Admin dashboard <span>→</span></Link>}
      {isHost && <Link href="/host/events"><CalendarDays size={15} /> View my events <span>→</span></Link>}
    </div>
  );
}
