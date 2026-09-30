'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CalendarDays, CalendarPlus, Plus, RefreshCw } from 'lucide-react';
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

function EventCard({ event }: { event: Party }) {
  const status = STATUS[event.status] ?? STATUS.draft;
  return (
    <Link href={`/host/${event.id}`} className="group flex min-w-0 items-center gap-3 rounded-2xl p-3 transition-colors hover:bg-white/[0.06] active:scale-[0.99]" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl" style={{ background: event.gradient }}>
        <PartyPhoto src={partyPhoto(event.id, event.coverUrl)} alt={event.title} gradient={event.gradient} sizes="80px" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold" style={{ color: '#FFFFFF' }}>{event.title}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" style={{ color: '#A7A8B5' }}>
          <span>{event.date}</span><span aria-hidden="true">·</span><span>{event.time}</span>
        </div>
        <span className="mt-2 inline-flex rounded-full px-2 py-1 text-[10px] font-semibold" style={{ color: status.color, background: status.bg }}>{status.label}</span>
      </div>
      <CalendarDays className="flex-shrink-0" size={17} color="#6E8DFF" />
    </Link>
  );
}

function EventSection({ title, events, emptyText }: { title: string; events: Party[]; emptyText: string }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[11px] font-bold uppercase tracking-[1.2px]" style={{ color: '#A7A8B5' }}>{title}</h2>
        <span className="text-[11px]" style={{ color: '#6B6C80' }}>{events.length}</span>
      </div>
      {events.length > 0 ? <div className="grid gap-3 md:grid-cols-2">{events.map((event) => <EventCard key={event.id} event={event} />)}</div> : <div className="rounded-2xl px-4 py-5 text-sm" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', color: '#6B6C80' }}>{emptyText}</div>}
    </section>
  );
}

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

  const { upcoming, previous } = useMemo(() => {
    const now = Date.now();
    const sorted = [...events].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
    return {
      upcoming: sorted.filter((event) => new Date(event.startsAt).getTime() >= now),
      previous: sorted.filter((event) => new Date(event.startsAt).getTime() < now).reverse(),
    };
  }, [events]);

  if (authLoading || !user) return null;

  return (
    <div className="mx-auto min-h-screen max-w-[600px] animate-fade-in pb-24 md:max-w-[1000px]">
      <HostDashboardNav title="My Events" action={<Link href="/host/new" className="btn-primary inline-flex items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-[13px] font-semibold"><Plus size={14} /> New event</Link>} />
      <div className="flex flex-col gap-6 p-5">
        <div className="flex items-start justify-between gap-4"><div><h1 className="font-display text-2xl" style={{ color: '#FFFFFF' }}>Your events</h1><p className="mt-1 text-sm" style={{ color: '#A7A8B5' }}>Upcoming events appear first. Open any event to manage it.</p></div><span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: 'rgba(43,104,255,0.12)', color: '#8EACFF' }}>{events.length}</span></div>
        {loading ? <div className="grid gap-3 md:grid-cols-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl" style={{ background: 'rgba(255,255,255,0.04)' }} />)}</div> : error ? <div className="flex flex-col items-center gap-3 rounded-2xl px-6 py-12 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,138,0,0.2)' }}><AlertTriangle size={25} color="#FF8A00" /><p className="text-sm" style={{ color: '#A7A8B5' }}>Couldn&apos;t load your events. Check your connection and try again.</p><button onClick={() => setAttempt((value) => value + 1)} className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold" style={{ background: 'rgba(255,138,0,0.12)', color: '#FF8A00' }}><RefreshCw size={14} /> Retry</button></div> : events.length === 0 ? <div className="flex flex-col items-center gap-4 rounded-2xl px-6 py-16 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}><CalendarPlus size={34} color="#2B68FF" /><div><h2 className="font-display text-xl" style={{ color: '#FFFFFF' }}>No events yet</h2><p className="mt-1 text-sm" style={{ color: '#A7A8B5' }}>Create your first event and submit it for review.</p></div><Link href="/host/new" className="btn-primary rounded-xl px-5 py-3 text-sm font-semibold">Create event</Link></div> : <div className="flex flex-col gap-7"><EventSection title="Upcoming events" events={upcoming} emptyText="You have no upcoming events." /><EventSection title="Previous events" events={previous} emptyText="Your completed events will appear here." /></div>}
      </div>
    </div>
  );
}
