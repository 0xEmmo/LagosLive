'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search as SearchIcon, SlidersHorizontal, X, RefreshCw, AlertTriangle } from 'lucide-react';
import BackButton from '@/components/BackButton';
import PartyCard from '@/components/PartyCard';
import { useParties } from '@/lib/hooks/useParties';
import { filterAndSortParties } from '@/lib/filters';
import { VC, VCB, VCT } from '@/lib/data';
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
        background: active
          ? accent
            ? `${accent}20`
            : 'rgba(255,90,46,0.12)'
          : 'rgba(255,255,255,0.04)',
        border: '1px solid',
        borderColor: active
          ? accent
            ? `${accent}40`
            : 'rgba(255,90,46,0.3)'
          : 'rgba(255,255,255,0.08)',
        color: active
          ? accent || '#FF5A2E'
          : '#A7A8B5',
        boxShadow: active ? `0 0 20px ${accent || '#FF5A2E'}22` : 'none',
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

function SearchPageContent() {
  const searchParams = useSearchParams();
  const { parties, loading, error, retry } = useParties();
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<PartyFilters>(EMPTY_FILTERS);
  const [sortBy, setSortBy] = useState<SortBy>('trending');
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const date = searchParams.get('date') as DateFilter | null;
    const price = searchParams.get('price') as PriceFilter | null;
    const vibe = searchParams.get('vibe') as Vibe | null;
    const location = searchParams.get('location');
    if (date || price || vibe || location) {
      setFilters((f) => ({
        ...f,
        date: date ?? f.date,
        price: price ?? f.price,
        vibe: vibe ?? f.vibe,
        location: location ?? f.location,
      }));
      setDrawerOpen(true);
    }
  }, [searchParams]);

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
    <div className="animate-fade-in">
      <div
        className="sticky top-0 z-40 border-b px-4 py-3 backdrop-blur-[22px] backdrop-saturate-150"
        style={{ background: 'var(--c-header)', borderColor: 'rgba(255,255,255,0.04)' }}
      >
        <div className="flex items-center gap-2.5">
          <BackButton href="/" label="" />
          <div className="relative flex-1">
            <SearchIcon
              size={15}
              strokeWidth={2}
              style={{ color: '#6B6C80' }}
              className="absolute left-[11px] top-1/2 -translate-y-1/2"
            />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search parties, venues, DJs..."
              className="w-full rounded-[10px] py-2.5 pl-[34px] pr-3.5 text-sm outline-none font-heading transition-all duration-200"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#FFFFFF',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255,90,46,0.3)';
                e.currentTarget.style.boxShadow = '0 0 20px rgba(255,90,46,0.08)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
          </div>
          <button
            onClick={() => setDrawerOpen((o) => !o)}
            className="flex flex-shrink-0 items-center gap-1.5 rounded-[10px] px-3 py-2 text-[13px] font-medium outline-none transition-all duration-200"
            style={{
              background: activeFilterCount > 0 ? 'rgba(255,90,46,0.1)' : 'rgba(255,255,255,0.04)',
              border: '1px solid',
              borderColor: activeFilterCount > 0 ? 'rgba(255,90,46,0.3)' : 'rgba(255,255,255,0.08)',
              color: activeFilterCount > 0 ? '#FF5A2E' : '#A7A8B5',
            }}
          >
            <SlidersHorizontal size={14} strokeWidth={2} />
            Filters
            {activeFilterCount > 0 && (
              <span
                className="flex h-[17px] w-[17px] flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                style={{ background: '#FF5A2E' }}
              >
                {activeFilterCount}
              </span>
            )}
          </button>
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
              <FilterGroup title="Vibe / Type">
                {VIBE_OPTS.map((opt) => (
                  <Pill
                    key={opt}
                    label={opt}
                    active={filters.vibe === opt}
                    onClick={() => setFilter('vibe', opt)}
                    accent={VC[opt as Vibe]}
                  />
                ))}
              </FilterGroup>
              <FilterGroup title="Distance">
                {DIST_OPTS.map((opt) => (
                  <Pill
                    key={opt}
                    label={opt}
                    active={filters.distance === opt}
                    onClick={() => setFilter('distance', opt)}
                  />
                ))}
              </FilterGroup>
              <FilterGroup title="Location / Area">
                {LOCATION_OPTS.map((opt) => (
                  <Pill
                    key={opt}
                    label={opt}
                    active={filters.location === opt}
                    onClick={() => setFilter('location', opt)}
                  />
                ))}
              </FilterGroup>
              {activeFilterCount > 0 && (
                <button
                  onClick={clearFilters}
                  className="self-start rounded-lg px-4 py-[7px] text-[13px] font-medium transition-all duration-200 active:scale-95"
                  style={{
                    background: 'rgba(255,90,46,0.1)',
                    border: '1px solid rgba(255,90,46,0.28)',
                    color: '#FF5A2E',
                  }}
                >
                  <X size={12} className="mr-1 inline" strokeWidth={2} />
                  Clear all filters
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-b px-5 py-[11px]" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
        <span className="text-[13px]" style={{ color: '#6B6C80' }}>
          Showing <span style={{ color: '#FF5A2E', fontWeight: 600 }}>{filtered.length}</span> parties
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
        <div
          className="grid gap-4 px-5 py-4"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}
        >
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="animate-pulse overflow-hidden rounded-[20px]"
              style={{ background: '#1A1A1D', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div className="h-[200px]" style={{ background: 'rgba(255,255,255,0.04)' }} />
              <div className="p-4">
                <div className="mb-2 h-4 w-3/4 rounded" style={{ background: 'rgba(255,255,255,0.08)' }} />
                <div className="h-3 w-1/2 rounded" style={{ background: 'rgba(255,255,255,0.06)' }} />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-4 px-6 py-[72px] text-center">
          <div
            className="flex h-[72px] w-[72px] items-center justify-center rounded-full"
            style={{ background: 'rgba(255,90,46,0.08)', border: '1px solid rgba(255,90,46,0.18)' }}
          >
            <AlertTriangle size={32} strokeWidth={1.5} color="#FF5A2E" />
          </div>
          <div className="font-display text-[30px] tracking-[1px]" style={{ color: '#FFFFFF' }}>
            Couldn&apos;t load events
          </div>
          <div className="max-w-[260px] text-center text-sm" style={{ color: '#A7A8B5' }}>
            Something went wrong fetching events. Try again in a moment.
          </div>
          <button
            onClick={retry}
            className="btn-primary flex items-center gap-2 px-7 py-3 text-sm font-semibold"
          >
            <RefreshCw size={14} strokeWidth={2.5} />
            Retry
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-4 px-6 py-[72px]">
          <div
            className="flex h-[72px] w-[72px] items-center justify-center rounded-full"
            style={{ background: 'rgba(255,90,46,0.08)', border: '1px solid rgba(255,90,46,0.18)' }}
          >
            <SearchIcon size={32} strokeWidth={1.5} color="#FF5A2E" />
          </div>
          <div className="font-display text-[30px] tracking-[1px]" style={{ color: '#FFFFFF' }}>
            No parties found
          </div>
          <div className="max-w-[260px] text-center text-sm" style={{ color: '#A7A8B5' }}>
            Try different search terms or adjust your filters
          </div>
          <button
            onClick={clearFilters}
            className="btn-primary px-7 py-3 text-sm font-semibold"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div
          className="grid gap-4 px-5 py-4"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', perspective: '1500px' }}
        >
          {filtered.map((party, i) => (
            <PartyCard key={party.id} party={party} showReminder={false} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchPageContent />
    </Suspense>
  );
}
