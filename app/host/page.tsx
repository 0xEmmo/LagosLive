'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, CalendarPlus } from 'lucide-react';
import BackButton from '@/components/BackButton';
import { fetchPartiesByOwner } from '@/lib/queries';
import { useLagosLiveStore } from '@/lib/store';
import type { Party } from '@/lib/types';

export default function HostDashboardPage() {
  const router = useRouter();
  const user = useLagosLiveStore((s) => s.user);
  const authLoading = useLagosLiveStore((s) => s.authLoading);
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchPartiesByOwner(user.id)
      .then((data) => {
        if (!cancelled) setParties(data);
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
        <Link
          href="/host/new"
          className="flex items-center gap-1.5 rounded-[10px] border-2 px-3.5 py-2 text-[13px] font-semibold text-white transition-transform duration-150 active:scale-95"
          style={{ background: 'linear-gradient(135deg,#552CB7,#FB7DA8)', borderColor: '#1A140F' }}
        >
          <Plus size={14} strokeWidth={2.5} />
          New
        </Link>
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
            List your own party or event to get it in front of the Lagos Live crowd.
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
        {parties.map((p) => (
          <Link
            key={p.id}
            href={`/host/${p.id}/edit`}
            className="flex items-center justify-between rounded-xl border p-4"
            style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate font-heading text-sm font-bold" style={{ color: 'var(--c-text)' }}>{p.title}</div>
              <div className="text-xs" style={{ color: 'var(--c-text-faint)' }}>{p.date} · {p.time}</div>
              <div className="mt-0.5 text-xs" style={{ color: 'var(--c-text-faint)' }}>{p.spotsLeft} / {p.capacity} spots left</div>
            </div>
            <span className="ml-3 flex-shrink-0 text-[13px] font-medium" style={{ color: '#552CB7' }}>Edit →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
