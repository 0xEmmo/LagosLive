'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useLagosLiveStore } from '@/lib/store';
import { isStaff } from '@/lib/authz';

export const CARD = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.08)',
};

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="font-heading text-[22px] font-bold leading-tight" style={{ color: '#FFFFFF' }}>{title}</h1>
        {subtitle && <p className="mt-1 text-[12.5px]" style={{ color: '#A7A8B5' }}>{subtitle}</p>}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  icon: Icon,
  color,
  sub,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  color: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl p-4" style={CARD}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.9px]" style={{ color: '#6B6C80' }}>{label}</span>
        <Icon size={15} strokeWidth={2} color={color} />
      </div>
      <div className="font-display truncate text-[20px] leading-tight" style={{ color: '#FFFFFF' }}>{value}</div>
      {sub && <div className="mt-1 text-[11px]" style={{ color: '#A7A8B5' }}>{sub}</div>}
    </div>
  );
}

export function Badge({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <span className="inline-flex shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-semibold" style={{ background: bg, color }}>
      {label}
    </span>
  );
}

export function LoadingBlock() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-[120px] animate-pulse rounded-2xl" style={{ background: 'rgba(255,255,255,0.04)' }} />
      ))}
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl px-6 py-12 text-center" style={{ ...CARD, border: '1px solid rgba(255,138,0,0.25)' }}>
      <AlertTriangle size={26} strokeWidth={1.5} color="#FF8A00" />
      <div className="text-sm" style={{ color: '#A7A8B5' }}>{message ?? 'Something went wrong loading this data.'}</div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-2 rounded-[10px] px-4 py-2 text-[13px] font-semibold"
          style={{ background: 'rgba(255,138,0,0.12)', border: '1px solid rgba(255,138,0,0.3)', color: '#FF8A00' }}
        >
          <RefreshCw size={13} strokeWidth={2.5} /> Retry
        </button>
      )}
    </div>
  );
}

export function EmptyBlock({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl px-6 py-14 text-center" style={CARD}>
      <div className="font-display text-[24px] tracking-[1px]" style={{ color: '#FFFFFF' }}>{title}</div>
      {subtitle && <div className="max-w-[300px] text-sm" style={{ color: '#A7A8B5' }}>{subtitle}</div>}
    </div>
  );
}

export function TableShell({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl" style={CARD}>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
            {head.map((h) => (
              <th key={h} className="px-4 py-3 text-[10.5px] font-bold uppercase tracking-[1px]" style={{ color: '#6B6C80', whiteSpace: 'nowrap' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Cell({ children, align, className, style }: { children: ReactNode; align?: 'right'; className?: string; style?: React.CSSProperties }) {
  return (
    <td className={`border-t px-4 py-3 text-[12.5px] ${className ?? ''}`} style={{ borderColor: 'rgba(255,255,255,0.05)', color: '#D5D6E0', textAlign: align ?? 'left', ...style }}>
      {children}
    </td>
  );
}

// Redirect-guard for role-protected pages. Renders nothing (and bounces) until
// the caller's role is known.
export function useRoleGuard(minRole: 'admin' | 'finance' | 'support' | 'staff' = 'admin', redirectTo = '/login') {
  const router = useRouter();
  const user = useLagosLiveStore((s) => s.user);
  const authLoading = useLagosLiveStore((s) => s.authLoading);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace(redirectTo);
      return;
    }
    let allowed = true;
    if (minRole === 'admin') allowed = user.role === 'admin' || user.role === 'super_admin';
    else if (minRole === 'finance') allowed = user.role === 'finance' || user.role === 'admin' || user.role === 'super_admin';
    else if (minRole === 'support') allowed = ['support', 'admin', 'super_admin'].includes(user.role);
    else allowed = isStaff(user.role);
    if (!allowed) router.replace('/');
  }, [authLoading, user, router, minRole, redirectTo]);

  return { user, ready: !!user && !authLoading };
}
