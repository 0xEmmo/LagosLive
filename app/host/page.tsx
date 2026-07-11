'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, CalendarPlus, ShieldCheck } from 'lucide-react';
import BackButton from '@/components/BackButton';
import { fetchPartiesByOwner, fetchOrganizerOrderStats, type OrganizerPartyStats } from '@/lib/queries';
import { formatNaira } from '@/lib/filters';
import { useLagosLiveStore } from '@/lib/store';
import type { Party, PartyStatus } from '@/lib/types';

const STATUS_STYLE: Record<PartyStatus, { label: string; bg: string; color: string }> = {
  pending: { label: 'Pending Review', bg: 'rgba(255,197,103,0.22)', color: '#9A6A00' },
  approved: { label: 'Live', bg: 'rgba(0,153,94,0.14)', color: '#00995E' },
  rejected: { label: 'Rejected', bg: 'rgba(214,64,44,0.12)', color: '#D6402C' },
  suspended: { label: 'Suspended', bg: 'rgba(214,64,44,0.12)', color: '#D6402C' },
};

export default function HostDashboardPage() {
  const router = useRouter();
  const user = useLagosLiveStore((s) => s.user);
  const authLoading = useLagosLiveStore((s) => s.authLoading);
  const [parties, setParties] = useState<Party[]>([]);
  const [stats, setStats] = useState<Record<number, OrganizerPartyStats>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchPartiesByOwner(user.id)
      .then(async (data) => {
        if (cancelled) return;
        setParties(data);
        const s = await fetchOrganizerOrderStats(data.map((p) => p.id));
        if (!cancelled) setStats(s);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user) return null;

  return (
    <div className="mx-auto max-w-[600px] animate-fade-in">
      <div
        className="sticky top-0 z-40 flex items-center justify-between border-b px-5 py-3.5 backdrop-blur-[22px] backdrop-saturate-150"
        style={{ background: 'var(--c-header)', borderColor: 'var(--c-border)' }}
      >
        <div className="flex items-center gap-3">
          <BackButton href="/profile" />
          <span className="font-heading text-[13px] font-bold uppercase tracking-[1px]" style={{ color: 'var(--c-text)' }}>
            Your Events
          </span>
        </div>
        <div className="flex items-center gap-2">
          {user.isAdmin && (
            <Link
              href="/admin"
              className="flex items-center gap-1.5 rounded-[10px] border px-3 py-2 text-[13px] font-semibold"
              style={{ background: 'var(--c-glass)', borderColor: 'var(--c-border3)', color: 'var(--c-text-muted)' }}
            >
              <ShieldCheck size={14} strokeWidth={2.5} />
              Admin
            </Link>
          )}
          <Link
            href="/host/new"
            className="flex items-center gap-1.5 rounded-[10px] border-2 px-3.5 py-2 text-[13px] font-semibold text-white transition-transform duration-150 active:scale-95"
            style={{ background: 'linear-gradient(135deg,#552CB7,#FB7DA8)', borderColor: '#1A140F' }}
          >
            <Plus size={14} strokeWidth={2.5} />
            New
          </Link>
        </div>
      </div>

      {!loading && parties.length === 0 && (
        <div className="flex flex-col items-center gap-4 px-6 py-[72px] text-center">
          <div
            className="flex h-[72px] w-[72px] items-center justify-center rounded-full border"
            style={{ background: 'rgba(85,44,183,0.1)', borderColor: 'rgba(85,44,183,0.16)' }}
          >
            <CalendarPlus size={32} strokeWidth={1.5} color="#552CB7" />
          </div>
          <div className="font-display text-[28px] tracking-[1px]" style={{ color: 'var(--c-text)' }}>
            No events yet
          </div>
          <div className="max-w-[260px] text-sm" style={{ color: 'var(--c-text-faint)' }}>
            List your own party or event to get it in front of the Lagos Live crowd. New listings need a quick admin review before they go live.
          </div>
          <Link
            href="/host/new"
            className="rounded-xl border-none px-7 py-3 font-semibold text-white"
            style={{ background: 'linear-gradient(135deg,#552CB7,#FB7DA8)' }}
          >
            List Your First Event
          </Link>
        </div>
      )}

      <div className="flex flex-col gap-2.5 p-5">
        {parties.map((p) => {
          const s = stats[p.id];
          const statusStyle = STATUS_STYLE[p.status];
          return (
            <Link
              key={p.id}
              href={`/host/${p.id}/edit`}
              className="rounded-xl border p-4"
              style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}
            >
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-heading text-sm font-bold" style={{ color: 'var(--c-text)' }}>{p.title}</div>
                  <div className="text-xs" style={{ color: 'var(--c-text-faint)' }}>{p.date} · {p.time}</div>
                </div>
                <span
                  className="flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                  style={{ background: statusStyle.bg, color: statusStyle.color }}
                >
                  {statusStyle.label}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--c-text-faint)' }}>
                <span>{p.spotsLeft} / {p.capacity} spots left</span>
                <span>{s?.ticketsSold ?? 0} tickets sold</span>
                <span className="font-semibold" style={{ color: '#552CB7' }}>{formatNaira(s?.revenue ?? 0)}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
