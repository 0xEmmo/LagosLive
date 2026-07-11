'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search as SearchIcon, SlidersHorizontal, X } from 'lucide-react';
import BackButton from '@/components/BackButton';
import PartyCard from '@/components/PartyCard';
import { useParties } from '@/lib/hooks/useParties';
import { filterAndSortParties } from '@/lib/filters';
import type { DateFilter, PartyFilters, PriceFilter, SortBy, Vibe } from '@/lib/types';

const DATE_OPTS = ['Tonight', 'This Week', 'This Weekend', 'Next Week'] as const;
const PRICE_OPTS = ['Free', '₦5k-10k', '₦10k-20k', '₦20k+'] as const;
const VIBE_OPTS = ['Club', 'Rooftop', 'House Party', 'Lounge', 'Festival', 'Concert'] as const;
const DIST_OPTS = ['0-5km', '5-10km', '10km+'] as const;

const EMPTY_FILTERS: PartyFilters = { date: null, price: null, vibe: null, distance: null };

function Pill<T extends string>({
  label,
  active,
  onClick,
}: {
  label: T;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="whitespace-nowrap rounded-[20px] border px-3.5 py-[7px] text-[13px] font-medium outline-none transition duration-150 ease-out active:scale-95"
      style={{
        background: active ? 'rgba(85,44,183,0.16)' : 'var(--c-surface2)',
        borderColor: active ? '#1A140F' : 'var(--c-border2)',
        color: active ? '#552CB7' : 'var(--c-text-muted)',
      }}
    >
      {label}
    </button>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.9px]" style={{ color: 'var(--c-text-faint)' }}>
        {title}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function SearchPageContent() {
  const searchParams = useSearchParams();
  const { parties } = useParties();
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<PartyFilters>(EMPTY_FILTERS);
  const [sortBy, setSortBy] = useState<SortBy>('trending');
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Lets the home page's quick-filter pills (and anything else) deep-link
  // straight into a pre-applied filter, e.g. /search?vibe=Rooftop.
  useEffect(() => {
    const date = searchParams.get('date') as DateFilter | null;
    const price = searchParams.get('price') as PriceFilter | null;
    const vibe = searchParams.get('vibe') as Vibe | null;
    if (date || price || vibe) {
      setFilters((f) => ({ ...f, date: date ?? f.date, price: price ?? f.price, vibe: vibe ?? f.vibe }));
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
        style={{ background: 'var(--c-header)', borderColor: 'var(--c-border)' }}
      >
        <div className="flex items-center gap-2.5">
          <BackButton href="/" label="" />
          <div className="relative flex-1">
            <SearchIcon
              size={15}
              strokeWidth={2.5}
              color="var(--c-text-dim)"
              className="absolute left-[11px] top-1/2 -translate-y-1/2"
            />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search parties, venues, DJs..."
              className="w-full rounded-[10px] border py-2.5 pl-[34px] pr-3.5 text-sm outline-none font-heading"
              style={{ background: 'var(--c-glass)', borderColor: 'var(--c-border3)', color: 'var(--c-text)' }}
            />
          </div>
          <button
            onClick={() => setDrawerOpen((o) => !o)}
            className="flex flex-shrink-0 items-center gap-1.5 rounded-[10px] border px-3 py-2 text-[13px] font-medium outline-none"
            style={{
              background: activeFilterCount > 0 ? 'rgba(85,44,183,0.14)' : 'var(--c-glass)',
              borderColor: activeFilterCount > 0 ? '#1A140F' : 'var(--c-border3)',
              color: activeFilterCount > 0 ? '#552CB7' : 'var(--c-text-muted)',
            }}
          >
            <SlidersHorizontal size={14} strokeWidth={2.5} />
            Filters
            {activeFilterCount > 0 && (
              <span
                className="flex h-[17px] w-[17px] flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                style={{ background: '#FB7DA8' }}
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
                  <Pill key={opt} label={opt} active={filters.vibe === opt} onClick={() => setFilter('vibe', opt)} />
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
              {activeFilterCount > 0 && (
                <button
                  onClick={clearFilters}
                  className="self-start rounded-lg border px-4 py-[7px] text-[13px] font-medium transition-transform duration-150 active:scale-95"
                  style={{ background: 'rgba(214,64,44,0.1)', borderColor: 'rgba(214,64,44,0.3)', color: '#D6402C' }}
                >
                  <X size={12} className="mr-1 inline" strokeWidth={2.5} />
                  Clear all filters
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-b px-5 py-[11px]" style={{ borderColor: 'var(--c-glass)' }}>
        <span className="text-[13px]" style={{ color: 'var(--c-text-faint)' }}>
          Showing <span style={{ color: '#552CB7', fontWeight: 600 }}>{filtered.length}</span> parties
        </span>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="cursor-pointer rounded-lg border px-2.5 py-[5px] text-xs outline-none"
          style={{ background: 'var(--c-glass)', borderColor: 'var(--c-border3)', color: 'var(--c-text-muted)' }}
        >
          <option value="trending">Trending</option>
          <option value="date">Date ↑</option>
          <option value="price-asc">Price Low → High</option>
          <option value="distance">Nearest First</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-4 px-6 py-[72px]">
          <div
            className="flex h-[72px] w-[72px] items-center justify-center rounded-full border"
            style={{ background: 'rgba(85,44,183,0.1)', borderColor: 'rgba(85,44,183,0.16)' }}
          >
            <SearchIcon size={32} strokeWidth={1.5} color="#552CB7" />
          </div>
          <div className="font-display text-[30px] tracking-[1px]" style={{ color: 'var(--c-text)' }}>
            No parties found
          </div>
          <div className="max-w-[260px] text-center text-sm" style={{ color: 'var(--c-text-faint)' }}>
            Try different search terms or adjust your filters
          </div>
          <button
            onClick={clearFilters}
            className="rounded-xl border-none px-7 py-3 font-semibold text-white"
            style={{ background: 'linear-gradient(135deg,#552CB7,#FB7DA8)' }}
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
