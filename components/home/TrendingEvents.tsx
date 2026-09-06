'use client';

import Link from 'next/link';
import { Compass, ArrowRight } from 'lucide-react';
import PartyCard from '@/components/PartyCard';
import { EventCardGridSkeleton } from '@/components/ui/loaders-skeleton';
import type { TrendingEventEntry } from '@/lib/queries';
import type { Party } from '@/lib/types';

interface TrendingEventsProps {
  entries: TrendingEventEntry[];
  loading: boolean;
}

// Admin-curated "Trending now" strip. The layout is content-driven: the number
// of curated events decides how they arrange so there are never awkward gaps or
// empty placeholders. Events sag past their start, get suspended or deleted are
// already filtered out of `entries` by the query, so we only ever render what
// the admin actually chose and can still publish.
export default function TrendingEvents({ entries, loading }: TrendingEventsProps) {
  const parties = entries.map((e) => e.party);
  const count = parties.length;

  if (loading) {
    return (
      <section className="mx-auto max-w-[1080px] px-5 pb-10 pt-6 md:pt-10">
        <SectionHeader />
        <EventCardGridSkeleton count={3} />
      </section>
    );
  }

  if (count === 0) {
    return (
      <section className="mx-auto max-w-[1080px] px-5 pb-10 pt-6 md:pt-10">
        <SectionHeader />
        <div className="flex flex-col items-center gap-4 rounded-[20px] border px-6 py-[52px] text-center" style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.015)' }}>
          <div className="flex h-[64px] w-[64px] items-center justify-center rounded-full" style={{ background: 'rgba(255,45,149,0.08)', border: '1px solid rgba(255,45,149,0.18)' }}>
            <Compass size={28} strokeWidth={1.5} color="#FF2D95" />
          </div>
          <div className="font-display text-[26px] tracking-[1px]" style={{ color: '#FFFFFF' }}>
            Discover what&apos;s happening in Lagos
          </div>
          <div className="max-w-[300px] text-sm" style={{ color: '#A7A8B5' }}>
            Browse the full lineup of live events across the city and grab your tickets.
          </div>
          <Link
            href="/events"
            className="flex items-center gap-2 rounded-[14px] px-6 py-3 text-sm font-bold text-white transition-all duration-200 active:scale-95"
            style={{ background: 'linear-gradient(135deg,#FF2D95,#8A2BE2)' }}
          >
            Explore Events
            <ArrowRight size={15} strokeWidth={2.5} />
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-[1080px] px-5 pb-10 pt-6 md:pt-10">
      <SectionHeader />
      <TrendingGrid parties={parties} />
    </section>
  );
}

function SectionHeader() {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="mb-2 flex items-center gap-2">
          <div className="h-5 w-[3px] rounded-sm" style={{ background: 'linear-gradient(to bottom, #FF2D95, #8A2BE2)' }} />
          <span className="text-xs font-bold uppercase tracking-[2px]" style={{ color: '#FF2D95' }}>
            Trending now
          </span>
        </div>
        <h2 className="font-display text-[34px] leading-[1] tracking-[1px] md:text-[46px]" style={{ color: '#FFFFFF' }}>
          Curated by <span className="gradient-text">Lagos Live</span>
        </h2>
      </div>
      <Link
        href="/events"
        className="hidden items-center gap-1.5 rounded-full px-5 py-2.5 text-[13px] font-bold transition-all duration-200 active:scale-95 md:inline-flex"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#00F5D4' }}
      >
        Explore all events
      </Link>
    </div>
  );
}

function TrendingGrid({ parties }: { parties: Party[] }) {
  const count = parties.length;

  // One featured / wide hero card.
  if (count === 1) {
    return (
      <div className="mx-auto max-w-[520px]">
        <PartyCard party={parties[0]} index={0} imageHeight={260} />
      </div>
    );
  }

  // Two strong cards.
  if (count === 2) {
    return (
      <div className="mx-auto grid max-w-[680px] gap-4 sm:grid-cols-2">
        {parties.map((p, i) => (
          <PartyCard key={p.id} party={p} index={i} />
        ))}
      </div>
    );
  }

  // Three → three columns (stack on small screens).
  if (count === 3) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {parties.map((p, i) => (
          <PartyCard key={p.id} party={p} index={i} />
        ))}
      </div>
    );
  }

  // Four → 2 + 2.
  if (count === 4) {
    return <RowedBlock parties={parties} rowSize={2} />;
  }

  // Five → 3 + 2 (balanced). Six → 3 + 3.
  const rowSizes: [number, number] = count === 5 ? [3, 2] : [3, 3];
  return <TwoRowBlock parties={parties} rowSizes={rowSizes} />;
}

function RowedBlock({ parties, rowSize }: { parties: Party[]; rowSize: number }) {
  const rows: Party[][] = [];
  for (let i = 0; i < parties.length; i += rowSize) rows.push(parties.slice(i, i + rowSize));
  return (
    <div className="flex flex-col gap-4">
      {rows.map((row, r) => (
        <div key={r} className="grid gap-4 md:grid-cols-2">
          {row.map((p, i) => (
            <PartyCard key={p.id} party={p} index={r * rowSize + i} />
          ))}
        </div>
      ))}
    </div>
  );
}

function TwoRowBlock({
  parties,
  rowSizes,
}: {
  parties: Party[];
  rowSizes: [number, number];
}) {
  const first = parties.slice(0, rowSizes[0]);
  const second = parties.slice(rowSizes[0], rowSizes[0] + rowSizes[1]);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        {first.map((p, i) => (
          <PartyCard key={p.id} party={p} index={i} />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {second.map((p, i) => (
          <PartyCard key={p.id} party={p} index={rowSizes[0] + i} />
        ))}
      </div>
    </div>
  );
}
