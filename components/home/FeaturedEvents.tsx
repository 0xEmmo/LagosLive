'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { Search, AlertTriangle, RefreshCw, Flame } from 'lucide-react';
import PartyCard from '@/components/PartyCard';
import { VC, hostStartHref } from '@/lib/data';
import { sortByTrending } from '@/lib/filters';
import { useLagosLiveStore } from '@/lib/store';
import { EventCardGridSkeleton } from '@/components/ui/loaders-skeleton';
import type { Party, Vibe } from '@/lib/types';

const VIBE_FILTERS: Array<'All' | Vibe> = ['All', 'Club', 'Concert', 'Festival', 'Rooftop', 'House Party', 'Lounge'];

interface FeaturedEventsProps {
  parties: Party[];
  loading: boolean;
  error: string | null;
  retry: () => void;
}

type Status = 'loading' | 'error' | 'empty' | 'ok';

export default function FeaturedEvents({ parties, loading, error, retry }: FeaturedEventsProps) {
  const user = useLagosLiveStore((s) => s.user);
  const [active, setActive] = useState<'All' | Vibe>('All');

  const { trending, status, filtered } = useMemo(() => {
    const sorted = sortByTrending(parties);
    const next: Status = loading ? 'loading' : error ? 'error' : sorted.length === 0 ? 'empty' : 'ok';
    const visible = active === 'All' ? sorted : sorted.filter((p) => p.vibe === active);
    return { trending: sorted, status: next, filtered: visible };
  }, [parties, loading, error, active]);

  // If the active filter has no events (e.g. parties changed), fall back to All.
  useEffect(() => {
    if (active !== 'All' && status === 'ok' && filtered.length === 0) setActive('All');
  }, [active, status, filtered.length]);

  return (
    <section className="mx-auto max-w-[1080px] px-5 pb-10 pt-6 md:pt-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <div className="h-5 w-[3px] rounded-sm" style={{ background: 'linear-gradient(to bottom, #FF2D95, #8A2BE2)' }} />
            <span className="text-xs font-bold uppercase tracking-[2px]" style={{ color: '#FF2D95' }}>
              Live now
            </span>
          </div>
          <h2 className="font-display text-[34px] leading-[1] tracking-[1px] md:text-[46px]" style={{ color: '#FFFFFF' }}>
            What&apos;s happening <span className="gradient-text">in Lagos</span>
          </h2>
        </div>
        <Link
          href="/explore"
          className="hidden items-center gap-1.5 rounded-full px-5 py-2.5 text-[13px] font-bold transition-all duration-200 active:scale-95 md:inline-flex"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#00F5D4' }}
        >
          <Flame size={14} strokeWidth={2} />
          Explore all events
        </Link>
      </div>

      {/* Category pills */}
      <div className="no-scrollbar mb-7 flex gap-2 overflow-x-auto pb-1">
        {VIBE_FILTERS.map((vibe) => {
          const activeFilter = active === vibe;
          return (
            <button
              key={vibe}
              type="button"
              onClick={() => setActive(vibe)}
              aria-pressed={activeFilter}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-full border px-4 py-2 text-[12.5px] font-semibold outline-none transition-all duration-300"
              style={{
                background: activeFilter ? 'linear-gradient(135deg,#FF2D95,#8A2BE2)' : 'rgba(255,255,255,0.05)',
                borderColor: activeFilter ? 'transparent' : 'rgba(255,255,255,0.08)',
                color: activeFilter ? '#FFFFFF' : '#A7A8B5',
                boxShadow: activeFilter ? '0 6px 18px rgba(255,45,149,0.3)' : 'none',
              }}
            >
              {vibe !== 'All' && <span className="h-[6px] w-[6px] rounded-full" style={{ background: activeFilter ? '#FFFFFF' : VC[vibe as Vibe] }} />}
              {vibe}
            </button>
          );
        })}
      </div>

      {status === 'loading' && <EventCardGridSkeleton count={4} />}

      {status === 'error' && (
        <div className="flex flex-col items-center gap-4 rounded-[20px] border px-6 py-[56px] text-center" style={{ borderColor: 'rgba(255,138,0,0.15)', background: 'rgba(255,138,0,0.05)' }}>
          <div className="flex h-[64px] w-[64px] items-center justify-center rounded-full" style={{ background: 'rgba(255,138,0,0.08)', border: '1px solid rgba(255,138,0,0.15)' }}>
            <AlertTriangle size={28} strokeWidth={1.5} color="#FF8A00" />
          </div>
          <div className="font-display text-[26px] tracking-[1px]" style={{ color: '#FFFFFF' }}>
            Couldn&apos;t load events
          </div>
          <div className="max-w-[280px] text-sm" style={{ color: '#A7A8B5' }}>
            Something went wrong fetching events. Try again in a moment.
          </div>
          <button onClick={retry} className="btn-primary flex items-center gap-2 px-6 py-3 text-sm font-semibold">
            <RefreshCw size={14} strokeWidth={2.5} />
            Retry
          </button>
        </div>
      )}

      {status === 'empty' && (
        <div className="flex flex-col items-center gap-4 rounded-[20px] border px-6 py-[56px] text-center" style={{ borderColor: 'rgba(255,45,149,0.15)', background: 'rgba(255,45,149,0.05)' }}>
          <div className="flex h-[64px] w-[64px] items-center justify-center rounded-full" style={{ background: 'rgba(255,45,149,0.08)', border: '1px solid rgba(255,45,149,0.15)' }}>
            <Search size={28} strokeWidth={1.5} color="#FF2D95" />
          </div>
          <div className="font-display text-[26px] tracking-[1px]" style={{ color: '#FFFFFF' }}>
            Nothing listed yet
          </div>
          <div className="max-w-[280px] text-sm" style={{ color: '#A7A8B5' }}>
            No events are live right now. Check back soon — or list your own event.
          </div>
          <Link href={hostStartHref(user)} className="btn-primary px-6 py-3 text-sm font-semibold">
            List Your Event
          </Link>
        </div>
      )}

      {status === 'ok' &&
        (filtered.length > 0 ? (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
            {filtered.slice(0, 8).map((party, i) => (
              <PartyCard key={party.id} party={party} index={i} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3.5 rounded-[20px] border border-solid px-6 py-[48px] text-center" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
            <div className="text-sm" style={{ color: '#A7A8B5' }}>
              No {active} events live right now.
            </div>
            <button onClick={() => setActive('All')} className="rounded-full px-5 py-2 text-[13px] font-bold" style={{ background: 'rgba(255,255,255,0.06)', color: '#FF2D95' }}>
              Show all events
            </button>
          </div>
        ))}

      <div className="mt-8 flex justify-center md:hidden">
        <Link
          href="/explore"
          className="rounded-full px-6 py-3 text-[13px] font-bold transition-all duration-200 active:scale-95"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#00F5D4' }}
        >
          Explore all events →
        </Link>
      </div>
    </section>
  );
}