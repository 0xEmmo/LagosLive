'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, CalendarPlus, RefreshCw, AlertTriangle, Plus } from 'lucide-react';
import HostDashboardNav from '@/components/HostDashboardNav';
import PartyPhoto from '@/components/PartyPhoto';
import { partyPhoto } from '@/lib/data';
import { fetchPartiesByOwner } from '@/lib/queries';
import { useLagosLiveStore } from '@/lib/store';
import type { Party } from '@/lib/types';

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: 'Draft', color: '#D5D6E0', bg: 'rgba(255,255,255,0.08)' },
  pending: { label: 'Pending review', color: '#FFD600', bg: 'rgba(255,214,0,0.1)' },
  approved: { label: 'Live', color: '#00F5D4', bg: 'rgba(0,245,212,0.1)' },
  rejected: { label: 'Rejected', color: '#FF8A00', bg: 'rgba(255,138,0,0.1)' },
  suspended: { label: 'Suspended', color: '#FF8A00', bg: 'rgba(255,138,0,0.1)' },
};

export default function HostEventsPage() {
  const user = useLagosLiveStore((s) => s.user);
  const authLoading = useLagosLiveStore((s) => s.authLoading);
  const [events, setEvents] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchPartiesByOwner(user.id)
      .then((rows) => { if (!cancelled) setEvents(rows); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load your events.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user, attempt]);

  if (authLoading || !user) return null;

  return (
    <div className="mx-auto min-h-screen max-w-[600px] animate-fade-in pb-24 md:max-w-[1000px]">
      <HostDashboardNav title="My Events" action={<Link href="/host/new" className="btn-primary inline-flex items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-[13px] font-semibold"><Plus size={14} /> New event</Link>} />
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between"><div><h1 className="font-display text-2xl" style={{ color: '#FFFFFF' }}>Your events</h1><p className="mt-1 text-sm" style={{ color: '#A7A8B5' }}>Manage listings, edits, and event operations.</p></div><span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: 'rgba(43,104,255,0.12)', color: '#8EACFF' }}>{events.length}</span></div>
        {loading ? <div className="flex flex-col gap-3">{[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl" style={{ background: 'rgba(255,255,255,0.04)' }} />)}</div> : error ? <div className="flex flex-col items-center gap-3 rounded-2xl px-6 py-12 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,138,0,0.2)' }}><AlertTriangle size={25} color="#FF8A00" /><p className="text-sm" style={{ color: '#A7A8B5' }}>Couldn&apos;t load your events. Check your connection and try again.</p><button onClick={() => setAttempt((value) => value + 1)} className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold" style={{ background: 'rgba(255,138,0,0.12)', color: '#FF8A00' }}><RefreshCw size={14} /> Retry</button></div> : events.length === 0 ? <div className="flex flex-col items-center gap-4 rounded-2xl px-6 py-16 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}><CalendarPlus size={34} color="#2B68FF" /><div><h2 className="font-display text-xl" style={{ color: '#FFFFFF' }}>No events yet</h2><p className="mt-1 text-sm" style={{ color: '#A7A8B5' }}>Create your first event and submit it for review.</p></div><Link href="/host/new" className="btn-primary rounded-xl px-5 py-3 text-sm font-semibold">Create event</Link></div> : <div className="flex flex-col gap-3">{events.map((event) => { const status = STATUS[event.status] ?? STATUS.draft; return <Link key={event.id} href={`/host/${event.id}`} className="flex items-center gap-3 rounded-2xl p-3 transition-transform active:scale-[0.99]" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}><div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl" style={{ background: event.gradient }}><PartyPhoto src={partyPhoto(event.id, event.coverUrl)} alt={event.title} gradient={event.gradient} sizes="80px" /></div><div className="min-w-0 flex-1"><div className="truncate text-sm font-bold" style={{ color: '#FFFFFF' }}>{event.title}</div><div className="mt-1 text-xs" style={{ color: '#A7A8B5' }}>{event.date} · {event.time}</div><span className="mt-2 inline-flex rounded-full px-2 py-1 text-[10px] font-semibold" style={{ color: status.color, background: status.bg }}>{status.label}</span></div><CalendarDays size={17} color="#6E8DFF" /></Link>; })}</div>}
      </div>
    </div>
  );
}
