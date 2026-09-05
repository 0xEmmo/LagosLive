'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { MapPin, Search, Loader2, AlertTriangle, RefreshCw, Map as MapIcon, Megaphone } from 'lucide-react';
import HomeHeader from '@/components/HomeHeader';
import PartyCard from '@/components/PartyCard';
import Marquee from '@/components/Marquee';
import HomeSearchBar from '@/components/HomeSearchBar';
import { VC } from '@/lib/data';
import { useParties } from '@/lib/hooks/useParties';
import { useLagosLiveStore } from '@/lib/store';
import { sortByTrending } from '@/lib/filters';
import { EventCardGridSkeleton } from '@/components/ui/loaders-skeleton';
import type { Vibe } from '@/lib/types';

const QUICK_FILTERS: { label: string; href: string; icon?: typeof MapIcon }[] = [
  { label: 'Tonight', href: '/search?date=Tonight' },
  { label: 'This Weekend', href: '/search?date=This+Weekend' },
  { label: 'Free Entry', href: '/search?price=Free' },
  { label: 'Map View', href: '/map', icon: MapIcon },
];

function GridStates({
  loading,
  error,
  empty,
  retry,
  children,
}: {
  loading: boolean;
  error: string | null;
  empty: boolean;
  retry: () => void;
  children: React.ReactNode;
}) {
  if (loading) {
    return <EventCardGridSkeleton count={4} />;
  }
  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 px-6 py-[48px] text-center">
        <div
          className="flex h-[64px] w-[64px] items-center justify-center rounded-full"
          style={{ background: 'rgba(255,138,0,0.08)', border: '1px solid rgba(255,138,0,0.15)' }}
        >
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
    );
  }
  if (empty) {
    return (
      <div className="flex flex-col items-center gap-4 px-6 py-[48px] text-center">
        <div
          className="flex h-[64px] w-[64px] items-center justify-center rounded-full"
          style={{ background: 'rgba(255,45,149,0.08)', border: '1px solid rgba(255,45,149,0.15)' }}
        >
          <Search size={28} strokeWidth={1.5} color="#FF2D95" />
        </div>
        <div className="font-display text-[26px] tracking-[1px]" style={{ color: '#FFFFFF' }}>
          Nothing listed yet
        </div>
        <div className="max-w-[280px] text-sm" style={{ color: '#A7A8B5' }}>
          No events are live right now. Check back soon — or list your own event.
        </div>
        <Link href="/host/new" className="btn-primary px-6 py-3 text-sm font-semibold">
          List Your Event
        </Link>
      </div>
    );
  }
  return children;
}

export default function HomePage() {
  const { parties, loading, error, retry } = useParties();
  const locationStatus = useLagosLiveStore((s) => s.locationStatus);
  const requestLocation = useLagosLiveStore((s) => s.requestLocation);
  const locationLoading = locationStatus === 'loading';

  const trending = useMemo(() => sortByTrending(parties), [parties]);

  return (
    <div className="animate-fade-in">
      <HomeHeader />

      {/* Hero — focused on discovery */}
      <div className="relative overflow-hidden px-[22px] pb-[28px] pt-[48px]">
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 80% 60% at 20% 40%, rgba(255,45,149,0.12) 0%, transparent 60%), radial-gradient(ellipse 60% 70% at 80% 30%, rgba(138,43,226,0.10) 0%, transparent 60%), radial-gradient(ellipse 50% 50% at 50% 90%, rgba(0,191,255,0.08) 0%, transparent 60%)',
          }}
        />
        <div className="relative z-[1] max-w-[540px]">
          <div
            className="mb-[14px] inline-flex items-center gap-[7px] rounded-full px-4 py-1.5"
            style={{ background: 'rgba(255,45,149,0.1)', border: '1px solid rgba(255,45,149,0.2)' }}
          >
            <div className="h-[5px] w-[5px] rounded-full" style={{ background: '#FF2D95' }} />
            <span className="text-[11px] font-semibold uppercase tracking-[1px]" style={{ color: 'rgba(255,45,149,0.85)' }}>
              {loading ? 'Loading events…' : error ? 'Events unavailable' : `${parties.length} Events Live`}
            </span>
          </div>
          <h1
            className="font-display mb-[10px] leading-[0.9] tracking-[1px]"
            style={{ fontSize: 'clamp(48px,12vw,88px)', fontWeight: 400 }}
          >
            <span style={{ color: '#FFFFFF' }}>What&apos;s happening </span>
            <br />
            <span className="gradient-text">in Lagos?</span>
          </h1>
          <p className="mb-5 max-w-[380px] text-[15px] leading-[1.6]" style={{ color: '#A7A8B5' }}>
            Discover the hottest parties, clubs &amp; events — right now.
          </p>
        </div>
      </div>

      {/* Search bar — one box, smart defaults */}
      <HomeSearchBar />

      {/* List your event CTA */}
      <Link href="/host/new" className="block px-5 pb-4">
        <div
          className="relative overflow-hidden rounded-2xl p-5 transition-all duration-300 hover:scale-[1.01] active:scale-[0.99]"
          style={{
            background: 'linear-gradient(135deg, rgba(255,45,149,0.14), rgba(138,43,226,0.10) 55%, rgba(0,191,255,0.06))',
            border: '1px solid rgba(255,45,149,0.25)',
          }}
        >
          <div
            className="pointer-events-none absolute -right-8 -top-10 h-[140px] w-[140px] rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(255,45,149,0.25), transparent)', filter: 'blur(18px)' }}
          />
          <div className="relative z-[1] flex items-center gap-3.5">
            <div
              className="flex h-[46px] w-[46px] flex-shrink-0 items-center justify-center rounded-xl"
              style={{ background: 'linear-gradient(135deg,#FF2D95,#8A2BE2)', boxShadow: '0 8px 24px rgba(255,45,149,0.35)' }}
            >
              <Megaphone size={20} strokeWidth={2} color="#FFFFFF" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-heading text-[15px] font-bold" style={{ color: '#FFFFFF' }}>
                Host the next big night
              </div>
              <div className="text-[12px]" style={{ color: '#A7A8B5' }}>
                List your event on Lagos Live — free, approved in hours.
              </div>
            </div>
            <div className="flex-shrink-0 text-lg" style={{ color: '#FF2D95' }}>→</div>
          </div>
        </div>
      </Link>

      {/* Quick shortcuts */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-5 pb-2">
        {QUICK_FILTERS.map(({ label, href, icon: Icon }) => (
          <Link
            key={label}
            href={href}
            className="flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-medium outline-none transition-all duration-300 active:scale-95"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#A7A8B5',
            }}
          >
            {Icon && <Icon size={13} strokeWidth={2} />}
            {label}
          </Link>
        ))}
        <button
          onClick={requestLocation}
          className="flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-medium outline-none transition-all duration-300 active:scale-95"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#A7A8B5',
          }}
        >
          {locationLoading ? (
            <Loader2 size={13} strokeWidth={2} className="animate-spin" />
          ) : (
            <MapPin size={13} strokeWidth={2} />
          )}
          Near Me
        </button>
      </div>

      {/* Browse by vibe / category */}
      <div className="mb-2 px-5">
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.9px]" style={{ color: '#6B6C80' }}>
          Browse by Category
        </div>
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
          {(['Club', 'Rooftop', 'Festival', 'Concert', 'House Party', 'Lounge'] as Vibe[]).map((vibe) => (
            <Link
              key={vibe}
              href={`/search?vibe=${encodeURIComponent(vibe)}`}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-[7px] text-[12px] font-medium transition-all duration-200 active:scale-95"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#A7A8B5' }}
            >
              <span className="h-[6px] w-[6px] rounded-full" style={{ background: VC[vibe] }} />
              {vibe}
            </Link>
          ))}
        </div>
      </div>

      {/* Trending ticker */}
      {!loading && trending.length > 0 && (
        <div className="mb-4 mt-2 border-y py-2.5" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
          <Marquee durationSeconds={34}>
            {trending.slice(0, 10).map((p) => (
              <span
                key={p.id}
                className="flex items-center gap-1.5 whitespace-nowrap text-[12px] font-medium"
                style={{ color: '#A7A8B5' }}
              >
                <span className="h-[6px] w-[6px] rounded-full" style={{ background: VC[p.vibe] }} />
                {p.title}
                <span style={{ color: '#6B6C80' }}>·</span>
              </span>
            ))}
          </Marquee>
        </div>
      )}

      {/* Section heading */}
      <div className="flex items-center justify-between px-5 pt-4 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="h-5 w-[3px] rounded-sm" style={{ background: 'linear-gradient(to bottom, #FF2D95, #8A2BE2)' }} />
          <h2 className="text-xs font-bold uppercase tracking-[2px]" style={{ color: '#FFFFFF' }}>
            Trending Tonight
          </h2>
        </div>
        <Link href="/explore" className="text-[13px] font-medium transition-colors" style={{ color: '#FF2D95' }}>
          See all →
        </Link>
      </div>

      {/* Party grid */}
      <GridStates loading={loading} error={error} empty={parties.length === 0} retry={retry}>
        <div
          className="grid gap-4 px-5 pb-6"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', perspective: '1500px' }}
        >
          {trending.slice(0, 8).map((party, i) => (
            <PartyCard key={party.id} party={party} index={i} />
          ))}
        </div>
      </GridStates>

      {/* Subtle host CTA */}
      <div className="px-5 pb-8 pt-2 text-center">
        <Link
          href="/host/new"
          className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium transition-all duration-200 active:scale-95"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#6B6C80' }}
        >
          List Your Event
        </Link>
      </div>
    </div>
  );
}
