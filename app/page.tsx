'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MapPin, Search, Loader2 } from 'lucide-react';
import HomeHeader from '@/components/HomeHeader';
import PartyCard from '@/components/PartyCard';
import { PARTIES } from '@/lib/data';

const QUICK_FILTERS = ['All', 'Tonight', 'This Weekend', 'Rooftop', 'Club', 'Free Entry', 'Festival'];

export default function HomePage() {
  const [locationLoading, setLocationLoading] = useState(false);
  const [hero, setHero] = useState({ x: 0, y: 0 });

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
      <HomeHeader />

      {/* Hero */}
      <div className="relative overflow-hidden px-[22px] pb-[38px] pt-11" onMouseMove={onHeroMove} onMouseLeave={onHeroLeave}>
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 85% 70% at 15% 50%, rgba(109,90,153,0.22) 0%, transparent 65%), radial-gradient(ellipse 65% 80% at 85% 20%, rgba(168,86,112,0.16) 0%, transparent 65%), radial-gradient(ellipse 55% 55% at 55% 88%, rgba(182,151,99,0.12) 0%, transparent 65%)',
          }}
        />
        <div
          className="pointer-events-none absolute -right-[30px] -top-10 h-[200px] w-[200px] rounded-full transition-transform duration-200 ease-out"
          style={{
            background: 'radial-gradient(circle, #6D5A992e, transparent)',
            transform: `translate(${hero.x * 22}px, ${hero.y * 22}px)`,
          }}
        />
        <div
          className="pointer-events-none absolute left-[5px] -bottom-[25px] h-[140px] w-[140px] rounded-full transition-transform duration-200 ease-out"
          style={{
            background: 'radial-gradient(circle, #A8567024, transparent)',
            transform: `translate(${hero.x * -16}px, ${hero.y * -16}px)`,
          }}
        />
        <div className="relative z-[1] max-w-[520px]">
          <div
            className="mb-[18px] inline-flex items-center gap-[7px] rounded-[20px] border px-4 py-1.5"
            style={{ background: 'rgba(109,90,153,0.1)', borderColor: 'rgba(109,90,153,0.25)' }}
          >
            <div className="h-[5px] w-[5px] rounded-full" style={{ background: '#A896C9' }} />
            <span className="text-[11px] font-semibold uppercase tracking-[1px]" style={{ color: '#A896C9' }}>
              Lagos is Lit Tonight · 22 Events Live
            </span>
          </div>
          <h1
            className="font-display mb-[18px] leading-[0.9] tracking-[1px]"
            style={{ fontSize: 'clamp(58px,13vw,104px)', fontWeight: 400 }}
          >
            <span style={{ color: 'var(--c-text)' }}>Find Your </span>
            <br />
            <span
              style={{
                background: 'linear-gradient(135deg,#6D5A99 0%,#A85670 55%,#B69763 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              Next Vibe.
            </span>
          </h1>
          <p className="mb-7 max-w-[380px] text-[15px] leading-[1.65]" style={{ color: 'var(--c-text-muted)' }}>
            Discover the hottest parties, clubs &amp; events across Lagos — right now.
          </p>
          <button
            onClick={getLocation}
            className="flex items-center gap-2 rounded-[14px] border-none px-7 py-3.5 text-[15px] font-semibold text-white outline-none"
            style={{
              background: locationLoading ? '#6D5A9972' : 'linear-gradient(135deg,#6D5A99 0%,#A85670 100%)',
              boxShadow: '0 8px 32px rgba(109,90,153,0.28)',
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
            className="whitespace-nowrap rounded-[20px] border px-4 py-2 text-[13px] font-medium outline-none"
            style={{
              background: i === 0 ? 'rgba(109,90,153,0.2)' : 'var(--c-surface2)',
              borderColor: i === 0 ? 'rgba(109,90,153,0.45)' : 'var(--c-border2)',
              color: i === 0 ? '#B0A0C9' : 'var(--c-text-muted)',
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
            style={{ background: 'rgba(109,90,153,0.13)', borderColor: 'rgba(109,90,153,0.25)', color: '#A896C9' }}
          >
            Filter
          </div>
        </div>
      </Link>

      {/* Section heading */}
      <div className="flex items-center justify-between px-5 pb-3.5">
        <div className="flex items-center gap-2.5">
          <div className="h-4 w-[3px] rounded-sm" style={{ background: 'linear-gradient(to bottom,#6D5A99,#A85670)' }} />
          <h2 className="text-xs font-bold uppercase tracking-[2px]" style={{ color: 'var(--c-text)' }}>
            Trending Tonight
          </h2>
        </div>
        <Link href="/search" className="text-[13px] font-medium" style={{ color: '#8C7AB8' }}>
          See all →
        </Link>
      </div>

      {/* Party grid */}
      <div
        className="grid gap-4 px-5 pb-6"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', perspective: '1500px' }}
      >
        {PARTIES.slice(0, 8).map((party) => (
          <PartyCard key={party.id} party={party} />
        ))}
      </div>
    </div>
  );
}
