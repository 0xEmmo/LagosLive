'use client';

import Link from 'next/link';
import { ShieldCheck, CalendarDays } from 'lucide-react';
import { useLagosLiveStore } from '@/lib/store';
import type { User } from '@/lib/store';

const ADMIN_DASHBOARD_ROLES: User['role'][] = ['super_admin', 'admin', 'finance', 'support'];

type Variant = 'stack' | 'inline';

export default function RoleNavButtons({ variant = 'stack' }: { variant?: Variant }) {
  const user = useLagosLiveStore((s) => s.user);

  if (!user) return null;
  const role = user.role;

  const isAdminUser = ADMIN_DASHBOARD_ROLES.includes(role);
  const isHost = role === 'organizer';
  if (!isAdminUser && !isHost) return null;

  if (variant === 'inline') {
    return (
      <div className="flex items-center gap-2">
        {isAdminUser && (
          <Link
            href="/admin/dashboard"
            className="flex h-[38px] items-center gap-1.5 rounded-full px-3.5 font-semibold transition-all duration-200 hover:shadow-glow-pink"
            style={{ background: 'linear-gradient(135deg,#FF2D95,#8A2BE2)', color: '#FFFFFF' }}
          >
            <ShieldCheck size={14} strokeWidth={2.2} />
            <span className="text-[12px]">Admin</span>
          </Link>
        )}
        {isHost && (
          <Link
            href="/host/events"
            className="flex h-[38px] items-center gap-1.5 rounded-full px-3.5 font-semibold transition-all duration-200"
            style={{ background: 'rgba(0,245,212,0.12)', border: '1px solid rgba(0,245,212,0.3)', color: '#00F5D4' }}
          >
            <CalendarDays size={14} strokeWidth={2.2} />
            <span className="text-[12px]">My Events</span>
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="mb-4 flex flex-col gap-2.5">
      {isAdminUser && (
        <Link
          href="/admin/dashboard"
          className="flex w-full items-center justify-between rounded-2xl px-4 py-[15px] font-semibold transition-all duration-200 active:scale-[0.98] shadow-glow-pink"
          style={{ background: 'linear-gradient(135deg,#FF2D95,#8A2BE2)', color: '#FFFFFF' }}
        >
          <span className="flex items-center gap-2.5 text-sm">
            <ShieldCheck size={16} strokeWidth={2.2} />
            Admin Dashboard
          </span>
          <span style={{ color: 'rgba(255,255,255,0.85)' }}>→</span>
        </Link>
      )}
      {isHost && (
        <Link
          href="/host/events"
          className="flex w-full items-center justify-between rounded-2xl px-4 py-[15px] font-semibold transition-all duration-200 active:scale-[0.98]"
          style={{ background: 'rgba(0,245,212,0.1)', border: '1px solid rgba(0,245,212,0.3)', color: '#FFFFFF' }}
        >
          <span className="flex items-center gap-2.5 text-sm" style={{ color: '#00F5D4' }}>
            <CalendarDays size={16} strokeWidth={2.2} />
            View My Events
          </span>
          <span style={{ color: '#00F5D4' }}>→</span>
        </Link>
      )}
    </div>
  );
}
