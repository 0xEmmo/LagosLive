'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search as SearchIcon, RefreshCw, AlertTriangle, TrendingUp, Sparkles } from 'lucide-react';
import BackButton from '@/components/BackButton';
import PartyCard from '@/components/PartyCard';
import { SearchSkeleton } from '@/components/ui/loaders-skeleton';
import { searchUpcomingEvents, type EventSearchSort } from '@/lib/queries';
import { useLagosLiveStore } from '@/lib/store';
import type { Party } from '@/lib/types';

const SORT_OPTIONS: { value: EventSearchSort; label: string }[] = [
  { value: 'trending', label: 'Trending' },
  { value: 'newest', label: 'Newest' },
  { value: 'price', label: 'Price: Low → High' },
  { value: 'rating', label: 'Top Rated' },
];

function ExplorePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userLocation = useLagosLiveStore((s) => s.userLocation);

  const q = searchParams.get('q') ?? '';
  const sortParam = (searchParams.get('sort') ?? 'trending') as EventSearchSort;

  const [events, setEvents] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async (query: string, sort: EventSearchSort, loc: typeof userLocation) => {
    setLoading(true);
    setError(null);
    try {
      const results = await searchUpcomingEvents({ query, sortBy: sort }, loc);
      setEvents(results);
    } catch (err) {
      console.error('[explore] load error', err);
      setError(err instanceof Error ? err.message : 'Failed to search events.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(q, sortParam, userLocation);
  }, [q, sortParam, userLocation]);

  const hasQuery = q.trim().length > 0;

  const setSort = (sort: EventSearchSort) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('sort', sort);
    router.replace(`/explore?${params.toString()}`);
  };

  return (
    <div className="animate-fade-in">
      <div
        className="sticky top-0 z-40 border-b px-4 py-3 backdrop-blur-[22px] backdrop-saturate-150"
        style={{ background: 'var(--c-header)', borderColor: 'rgba(255,255,255,0.04)' }}
      >
        <div className="flex items-center gap-2.5">
          <BackButton href="/" label="" />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const input = (e.currentTarget.elements.namedItem('q') as HTMLInputElement)?.value ?? '';
              const params = new URLSearchParams();
              const clean = input.trim();
              if (clean) params.set('q', clean);
              const sort = searchParams.get('sort');
              if (sort) params.set('sort', sort);
              router.push(`/explore${params.toString() ? `?${params.toString()}` : ''}`);
            }}
            className="relative flex-1"
          >
            <SearchIcon
              size={15}
              strokeWidth={2}
              style={{ color: '#6B6C80' }}
              className="absolute left-[11px] top-1/2 -translate-y-1/2"
            />
            <input
              name="q"
              defaultValue={q}
              placeholder="Search events, venues, artists..."
              className="w-full rounded-[10px] py-2.5 pl-[34px] pr-3.5 text-sm outline-none font-heading transition-all duration-200"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#FFFFFF' }}
            />
          </form>
        </div>
      </div>

      <div className="flex items-center justify-between border-b px-5 py-[11px]" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
        <span className="flex items-center gap-1.5 text-[13px]" style={{ color: '#6B6C80' }}>
          {hasQuery ? (
            <>
              Results for <span style={{ color: '#FF2D95', fontWeight: 600 }}>“{q}”</span>
            </>
          ) : (
            <>
              <Sparkles size={13} strokeWidth={2} style={{ color: '#FF2D95' }} />
              Upcoming events
            </>
          )}
        </span>
        <select
          value={sortParam}
          onChange={(e) => setSort(e.target.value as EventSearchSort)}
          className="cursor-pointer rounded-lg px-2.5 py-[5px] text-xs outline-none transition-all duration-200"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#A7A8B5' }}
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <SearchSkeleton count={4} />
      ) : error ? (
        <div className="flex flex-col items-center gap-4 px-6 py-[72px] text-center">
          <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full" style={{ background: 'rgba(255,45,149,0.08)', border: '1px solid rgba(255,45,149,0.18)' }}>
            <AlertTriangle size={32} strokeWidth={1.5} color="#FF2D95" />
          </div>
          <div className="font-display text-[30px] tracking-[1px]" style={{ color: '#FFFFFF' }}>
            Couldn&apos;t search
          </div>
          <div className="max-w-[260px] text-center text-sm" style={{ color: '#A7A8B5' }}>
            Something went wrong. Try again in a moment.
          </div>
          <button onClick={() => load(q, sortParam, userLocation)} className="btn-primary flex items-center gap-2 px-7 py-3 text-sm font-semibold">
            <RefreshCw size={14} strokeWidth={2.5} />
            Retry
          </button>
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center gap-4 px-6 py-[72px] text-center">
          <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full" style={{ background: 'rgba(255,45,149,0.08)', border: '1px solid rgba(255,45,149,0.18)' }}>
            <SearchIcon size={32} strokeWidth={1.5} color="#FF2D95" />
          </div>
          <div className="font-display text-[30px] tracking-[1px]" style={{ color: '#FFFFFF' }}>
            {hasQuery ? 'No events found' : 'Nothing coming up yet'}
          </div>
          <div className="max-w-[280px] text-center text-sm" style={{ color: '#A7A8B5' }}>
            {hasQuery
              ? `We couldn't find anything matching “${q}”. Try a broader search or a different spelling.`
              : 'No upcoming events are live right now. Check back soon!'}
          </div>
          {hasQuery && (
            <button onClick={() => router.push('/explore')} className="btn-primary px-7 py-3 text-sm font-semibold">
              Browse All Events
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 px-5 py-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', perspective: '1500px' }}>
          {events.map((party, i) => (
            <PartyCard key={party.id} party={party} showReminder={false} index={i} />
          ))}
        </div>
      )}

      {!loading && !error && events.length > 0 && (
        <p className="flex items-center justify-center gap-1.5 pb-8 pt-2 text-xs" style={{ color: '#6B6C80' }}>
          <TrendingUp size={11} strokeWidth={2} />
          Smart-sorted: cancelled & past events are hidden automatically.
        </p>
      )}
    </div>
  );
}

export default function ExplorePage() {
  return (
    <Suspense fallback={null}>
      <ExplorePageContent />
    </Suspense>
  );
}