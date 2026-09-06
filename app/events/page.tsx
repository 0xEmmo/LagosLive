'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search as SearchIcon, SlidersHorizontal, X, RefreshCw, AlertTriangle } from 'lucide-react';
import PartyCard from '@/components/PartyCard';
import { SearchSkeleton } from '@/components/ui/loaders-skeleton';
import { useParties } from '@/lib/hooks/useParties';
import { filterAndSortParties } from '@/lib/filters';
import { VC } from '@/lib/data';
import type { DateFilter, PartyFilters, PriceFilter, SortBy, Vibe } from '@/lib/types';

const DATE_OPTS = ['Tonight', 'This Week', 'This Weekend', 'Next Week'] as const;
const PRICE_OPTS = ['Free', 'Under ₦5K', '₦5K - ₦20K', 'Over ₦20K'] as const;
const VIBE_OPTS = ['Club', 'Rooftop', 'House Party', 'Lounge', 'Festival', 'Concert'] as const;
const DIST_OPTS = ['0-5km', '5-10km', '10km+'] as const;
const LOCATION_OPTS = ['Victoria Island', 'Lekki', 'Ikoyi', 'Yaba', 'Ikeja', 'Surulere', 'Ajah', 'Eko Atlantic'] as const;

const EMPTY_FILTERS: PartyFilters = { date: null, price: null, vibe: null, distance: null, location: null };

function Pill<T extends string>({
  label,
  active,
  onClick,
  accent,
}: {
  label: T;
  active: boolean;
  onClick: () => void;
  accent?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="whitespace-nowrap rounded-full px-3.5 py-[7px] text-[13px] font-medium outline-none transition-all duration-300 active:scale-95"
      style={{
        background: active ? (accent ? `${accent}20` : 'rgba(255,45,149,0.12)') : 'rgba(255,255,255,0.04)',
        border: '1px solid',
        borderColor: active ? (accent ? `${accent}40` : 'rgba(255,45,149,0.3)') : 'rgba(255,255,255,0.08)',
        color: active ? accent || '#FF2D95' : '#A7A8B5',
        boxShadow: active ? `0 0 20px ${accent || '#FF2D95'}22` : 'none',
      }}
    >
      {label}
    </button>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.9px]" style={{ color: '#6B6C80' }}>
        {title}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function EventsPageContent() {
  const searchParams = useSearchParams();
  const { parties, loading, error, retry } = useParties();
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<PartyFilters>(EMPTY_FILTERS);
  const [sortBy, setSortBy] = useState<SortBy>('trending');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const initedRef = useRef(false);

  // Prefill + autofocus the search box from ?q= (e.g. the homepage hero search),
  // and apply any URL filter params so shared /events links behave like the
  // marketplace you'd expect.
  useEffect(() => {
    const q = searchParams.get('q');
    const date = searchParams.get('date') as DateFilter | null;
    const price = searchParams.get('price') as PriceFilter | null;
    const vibe = searchParams.get('vibe') as Vibe | null;
    const location = searchParams.get('location');
    if (q) setSearchQuery(q);
    if (date || price || vibe || location)
      setFilters((f) => ({
        ...f,
        date: date ?? f.date,
        price: price ?? f.price,
        vibe: vibe ?? f.vibe,
        location: location ?? f.location,
      }));
    if (q || date || price || vibe || location) setDrawerOpen(true);
    if (q && !initedRef.current) {
      initedRef.current = true;
      requestAnimationFrame(() => inputRef.current?.focus());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setFilter = <K extends keyof PartyFilters>(key: K, val: NonNullable<PartyFilters[K]>) => {
    setFilters((f) => ({ ...f, [key]: f[key] === val ? null : val }));
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setSearchQuery('');
  };

  const filtered = useMemo(
    () => filterAndSortParties(parties, searchQuery, filters, sortBy),
    [parties, searchQuery, filters, sortBy]
  );

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <div className="animate-fade-in pb-6">
      <div
        className="sticky top-0 z-40 border-b px-4 py-3 backdrop-blur-[22px] backdrop-saturate-150"
        style={{ background: 'var(--c-header)', borderColor: 'rgba(255,255,255,0.04)' }}
      >
        <div className="mx-auto max-w-[1080px]">
          <div className="mb-3 flex items-center gap-2.5">
            <div>
              <h1 className="font-display text-[26px] leading-none tracking-[0.5px]" style={{ color: '#FFFFFF' }}>
                Events
              </h1>
              <div className="mt-1 text-[11px]" style={{ color: '#6B6C80' }}>
                The full Lagos Live marketplace
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => setDrawerOpen((o) => !o)}
                className="flex flex-shrink-0 items-center gap-1.5 rounded-[10px] px-3 py-2 text-[13px] font-medium outline-none transition-all duration-200"
                style={{
                  background: activeFilterCount > 0 ? 'rgba(255,45,149,0.1)' : 'rgba(255,255,255,0.04)',
                  border: '1px solid',
                  borderColor: activeFilterCount > 0 ? 'rgba(255,45,149,0.3)' : 'rgba(255,255,255,0.08)',
                  color: activeFilterCount > 0 ? '#FF2D95' : '#A7A8B5',
                }}
              >
                <SlidersHorizontal size={14} strokeWidth={2} />
                Filters
                {activeFilterCount > 0 && (
                  <span className="flex h-[17px] w-[17px] flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: '#FF2D95' }}>
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          <div className="relative">
            <SearchIcon size={15} strokeWidth={2} style={{ color: '#6B6C80' }} className="absolute left-[11px] top-1/2 -translate-y-1/2" />
            <input
              ref={inputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search events, venues, DJs..."
              className="w-full rounded-[10px] py-2.5 pl-[34px] pr-3.5 text-sm outline-none font-heading transition-all duration-200"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#FFFFFF',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255,45,149,0.3)';
                e.currentTarget.style.boxShadow = '0 0 20px rgba(255,45,149,0.08)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
          </div>

          <div
            className="grid transition-[grid-template-rows] duration-300 ease-out"
            style={{ gridTemplateRows: drawerOpen ? '1fr' : '0fr' }}
          >
            <div className="overflow-hidden">
              <div
                className="flex flex-col gap-3 pt-3.5 transition-opacity duration-200 ease-out"
                style={{ opacity: drawerOpen ? 1 : 0 }}
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="flex flex-col gap-3">
                    <FilterGroup title="Date">
                      {DATE_OPTS.map((opt) => (
                        <Pill key={opt} label={opt} active={filters.date === opt} onClick={() => setFilter('date', opt)} />
                      ))}
                    </FilterGroup>
                    <FilterGroup title="Price Range">
                      {PRICE_OPTS.map((opt) => (
                        <Pill key={opt} label={opt} active={filters.price === opt} onClick={() => setFilter('price', opt)} />
                      ))}
                    </FilterGroup>
                  </div>
                  <div className="flex flex-col gap-3">
                    <FilterGroup title="Vibe / Type">
                      {VIBE_OPTS.map((opt) => (
                        <Pill key={opt} label={opt} active={filters.vibe === opt} onClick={() => setFilter('vibe', opt)} accent={VC[opt as Vibe]} />
                      ))}
                    </FilterGroup>
                    <FilterGroup title="Distance">
                      {DIST_OPTS.map((opt) => (
                        <Pill key={opt} label={opt} active={filters.distance === opt} onClick={() => setFilter('distance', opt)} />
                      ))}
                    </FilterGroup>
                    <FilterGroup title="Location / Area">
                      {LOCATION_OPTS.map((opt) => (
                        <Pill key={opt} label={opt} active={filters.location === opt} onClick={() => setFilter('location', opt)} />
                      ))}
                    </FilterGroup>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={clearFilters}
                    className="rounded-lg px-4 py-[7px] text-[13px] font-medium transition-all duration-200 active:scale-95"
                    style={{
                      background: 'rgba(255,45,149,0.1)',
                      border: '1px solid rgba(255,45,149,0.28)',
                      color: '#FF2D95',
                    }}
                  >
                    <X size={12} className="mr-1 inline" strokeWidth={2} />
                    Clear all filters
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1080px]">
        <div className="flex items-center justify-between border-b px-5 py-[11px]" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
          <span className="text-[13px]" style={{ color: '#6B6C80' }}>
            Showing <span style={{ color: '#FF2D95', fontWeight: 600 }}>{filtered.length}</span> events
          </span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="cursor-pointer rounded-lg px-2.5 py-[5px] text-xs outline-none transition-all duration-200"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#A7A8B5',
            }}
          >
            <option value="trending">Trending</option>
            <option value="date">Date ↑</option>
            <option value="price-asc">Price Low → High</option>
            <option value="distance">Nearest First</option>
          </select>
        </div>

        {loading ? (
          <div className="px-5 py-4">
            <SearchSkeleton count={6} />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-4 px-6 py-[72px] text-center">
            <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full" style={{ background: 'rgba(255,45,149,0.08)', border: '1px solid rgba(255,45,149,0.18)' }}>
              <AlertTriangle size={32} strokeWidth={1.5} color="#FF2D95" />
            </div>
            <div className="font-display text-[30px] tracking-[1px]" style={{ color: '#FFFFFF' }}>
              Couldn&apos;t load events
            </div>
            <div className="max-w-[260px] text-center text-sm" style={{ color: '#A7A8B5' }}>
              Something went wrong fetching events. Try again in a moment.
            </div>
            <button onClick={retry} className="btn-primary flex items-center gap-2 px-7 py-3 text-sm font-semibold">
              <RefreshCw size={14} strokeWidth={2.5} />
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-4 px-6 py-[72px]">
            <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full" style={{ background: 'rgba(255,45,149,0.08)', border: '1px solid rgba(255,45,149,0.18)' }}>
              <SearchIcon size={32} strokeWidth={1.5} color="#FF2D95" />
            </div>
            <div className="font-display text-[30px] tracking-[1px]" style={{ color: '#FFFFFF' }}>
              No events found
            </div>
            <div className="max-w-[260px] text-center text-sm" style={{ color: '#A7A8B5' }}>
              Try different search terms or adjust your filters
            </div>
            <button onClick={clearFilters} className="btn-primary px-7 py-3 text-sm font-semibold">
              Clear filters
            </button>
          </div>
        ) : (
          <div
            className="grid gap-4 px-5 py-4"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}
          >
            {filtered.map((party, i) => (
              <PartyCard key={party.id} party={party} showReminder={false} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function EventsPage() {
  return (
    <Suspense fallback={null}>
      <EventsPageContent />
    </Suspense>
  );
}
