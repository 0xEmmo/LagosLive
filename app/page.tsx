'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MapPin, Search, Loader2 } from 'lucide-react';
import HomeHeader from '@/components/HomeHeader';
import PartyCard from '@/components/PartyCard';
import FolderReveal from '@/components/FolderReveal';
import Marquee from '@/components/Marquee';
import ShinyText from '@/components/ShinyText';
import { PARTIES, VC } from '@/lib/data';

const QUICK_FILTERS = ['All', 'Tonight', 'This Weekend', 'Rooftop', 'Club', 'Free Entry', 'Festival'];

// Pill tagline + hero headline rotate together, keyed off the same daily index, so the two
// pieces of copy always read as one cohesive line rather than two unrelated random phrases.
const HERO_COPY = [
  { pill: 'Lagos Never Sleeps', line1: 'Where Lagos', line2: 'Comes Alive.' },
  { pill: 'The City Is Calling', line1: 'Lagos Is', line2: 'Calling You.' },
  { pill: 'Wetin Dey Happen?', line1: 'Feel The', line2: 'City Tonight.' },
  { pill: "Don't Sleep On Lagos", line1: 'Own The', line2: 'Night Out.' },
  { pill: 'Owambe Mode: On', line1: 'Step Into', line2: 'The Night.' },
];

function dailyHeroCopy() {
  const now = new Date();
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
  return HERO_COPY[dayOfYear % HERO_COPY.length];
}

export default function HomePage() {
  const [locationLoading, setLocationLoading] = useState(false);
  const [hero, setHero] = useState({ x: 0, y: 0 });
  const heroCopy = dailyHeroCopy();

  const getLocation = () => {
    setLocationLoading(true);
    if (!navigator.geolocation) {
      setLocationLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords: { latitude: lat, longitude: lng } }) => {
        console.log('Lagos Live — User location:', { lat, lng });
        setLocationLoading(false);
      },
      (err) => {
        console.warn('Location error:', err.message);
        setLocationLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const onHeroMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setHero({
      x: (e.clientX - rect.left) / rect.width - 0.5,
      y: (e.clientY - rect.top) / rect.height - 0.5,
    });
  };
  const onHeroLeave = () => setHero({ x: 0, y: 0 });

  return (
    <div className="animate-fade-in">
      <FolderReveal />
      <HomeHeader />

      {/* Hero */}
      <div className="relative overflow-hidden px-[22px] pb-[38px] pt-11" onMouseMove={onHeroMove} onMouseLeave={onHeroLeave}>
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 85% 70% at 15% 50%, rgba(85,44,183,0.16) 0%, transparent 65%), radial-gradient(ellipse 65% 80% at 85% 20%, rgba(251,125,168,0.16) 0%, transparent 65%), radial-gradient(ellipse 55% 55% at 55% 88%, rgba(255,197,103,0.18) 0%, transparent 65%)',
          }}
        />
        <div className="pointer-events-none absolute -right-[30px] -top-10 h-[200px] w-[200px] animate-blob-float-a rounded-full">
          <div
            className="h-full w-full rounded-full transition-transform duration-200 ease-out"
            style={{
              background: 'radial-gradient(circle, #552CB72e, transparent)',
              transform: `translate(${hero.x * 22}px, ${hero.y * 22}px)`,
            }}
          />
        </div>
        <div className="pointer-events-none absolute left-[5px] -bottom-[25px] h-[140px] w-[140px] animate-blob-float-b rounded-full">
          <div
            className="h-full w-full rounded-full transition-transform duration-200 ease-out"
            style={{
              background: 'radial-gradient(circle, #FB7DA824, transparent)',
              transform: `translate(${hero.x * -16}px, ${hero.y * -16}px)`,
            }}
          />
        </div>
        <div className="relative z-[1] max-w-[520px]">
          <div
            className="mb-[18px] inline-flex items-center gap-[7px] rounded-[20px] border-2 px-4 py-1.5"
            style={{ background: 'rgba(255,197,103,0.22)', borderColor: '#1A140F' }}
          >
            <div className="h-[5px] w-[5px] rounded-full" style={{ background: '#552CB7' }} />
            <ShinyText
              className="text-[11px] font-semibold uppercase tracking-[1px]"
              style={{ color: 'rgba(85,44,183,0.78)' }}
            >
              {heroCopy.pill} · 22 Events Live
            </ShinyText>
          </div>
          <h1
            className="font-display mb-[18px] leading-[0.9] tracking-[1px]"
            style={{ fontSize: 'clamp(58px,13vw,104px)', fontWeight: 400 }}
          >
            <span style={{ color: 'var(--c-text)' }}>{heroCopy.line1} </span>
            <br />
            <span
              style={{
                background: 'linear-gradient(135deg,#552CB7 0%,#FB7DA8 55%,#FFC567 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              {heroCopy.line2}
            </span>
          </h1>
          <p className="mb-7 max-w-[380px] text-[15px] leading-[1.65]" style={{ color: 'var(--c-text-muted)' }}>
            Discover the hottest parties, clubs &amp; events across Lagos — right now.
          </p>
          <button
            onClick={getLocation}
            className="flex items-center gap-2 rounded-[14px] border-2 px-7 py-3.5 text-[15px] font-semibold text-white outline-none"
            style={{
              background: locationLoading ? '#552CB772' : 'linear-gradient(135deg,#552CB7 0%,#FB7DA8 100%)',
              borderColor: '#1A140F',
              boxShadow: '4px 4px 0 rgba(26,20,15,0.9)',
            }}
          >
            {locationLoading ? (
              <Loader2 size={16} strokeWidth={2.5} className="animate-spin" />
            ) : (
              <MapPin size={16} strokeWidth={2.5} />
            )}
            {locationLoading ? 'Getting your location...' : 'Find Parties Near Me'}
          </button>
        </div>
      </div>

      {/* Quick filter pills */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-5 pb-3.5">
        {QUICK_FILTERS.map((label, i) => (
          <button
            key={label}
            className="whitespace-nowrap rounded-[20px] border-2 px-4 py-2 text-[13px] font-medium outline-none"
            style={{
              background: i === 0 ? 'rgba(85,44,183,0.14)' : 'var(--c-surface2)',
              borderColor: i === 0 ? '#1A140F' : 'var(--c-border2)',
              color: i === 0 ? '#552CB7' : 'var(--c-text-muted)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tap-to-search bar */}
      <Link href="/search" className="block px-5 pb-5">
        <div
          className="flex items-center gap-2.5 rounded-xl border px-4 py-[11px]"
          style={{ background: 'var(--c-surface2)', borderColor: 'var(--c-border2)' }}
        >
          <Search size={16} strokeWidth={2.5} color="var(--c-text-dim)" />
          <span className="text-sm" style={{ color: 'var(--c-text-dim)' }}>
            Search parties, venues, DJs...
          </span>
          <div
            className="ml-auto rounded-[6px] border px-[9px] py-0.5 text-[11px] font-semibold"
            style={{ background: 'rgba(85,44,183,0.12)', borderColor: 'rgba(85,44,183,0.3)', color: '#552CB7' }}
          >
            Filter
          </div>
        </div>
      </Link>

      {/* Trending ticker */}
      <div className="mb-4 border-y py-2.5" style={{ borderColor: 'var(--c-glass)' }}>
        <Marquee durationSeconds={34}>
          {PARTIES.slice(0, 10).map((p) => (
            <span
              key={p.id}
              className="flex items-center gap-1.5 whitespace-nowrap text-[12px] font-medium"
              style={{ color: 'var(--c-text-muted)' }}
            >
              <span className="h-[6px] w-[6px] rounded-full" style={{ background: VC[p.vibe] }} />
              {p.title}
              <span style={{ color: 'var(--c-text-dim)' }}>·</span>
            </span>
          ))}
        </Marquee>
      </div>

      {/* Section heading */}
      <div className="flex items-center justify-between px-5 pb-3.5">
        <div className="flex items-center gap-2.5">
          <div className="h-4 w-[3px] rounded-sm" style={{ background: 'linear-gradient(to bottom,#552CB7,#FB7DA8)' }} />
          <h2 className="text-xs font-bold uppercase tracking-[2px]" style={{ color: 'var(--c-text)' }}>
            Trending Tonight
          </h2>
        </div>
        <Link href="/search" className="text-[13px] font-medium" style={{ color: '#552CB7' }}>
          See all →
        </Link>
      </div>

      {/* Party grid */}
      <div
        className="grid gap-4 px-5 pb-6"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', perspective: '1500px' }}
      >
        {PARTIES.slice(0, 8).map((party, i) => (
          <PartyCard key={party.id} party={party} index={i} />
        ))}
      </div>
    </div>
  );
}
