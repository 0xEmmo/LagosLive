'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Search, Locate, Flame } from 'lucide-react';
import { PARTIES, ALL_VIBES, VC } from '@/lib/data';
import type { Vibe } from '@/lib/types';

const LeafletMap = dynamic(() => import('@/components/LeafletMap'), { ssr: false });

export default function MapPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeVibes, setActiveVibes] = useState<Set<Vibe>>(new Set(ALL_VIBES));
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(false);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return PARTIES.filter(
      (p) => activeVibes.has(p.vibe) && (!q || p.title.toLowerCase().includes(q) || p.location.toLowerCase().includes(q))
    );
  }, [searchQuery, activeVibes]);

  const toggleVibe = (vibe: Vibe) => {
    setActiveVibes((s) => {
      const next = new Set(s);
      next.has(vibe) ? next.delete(vibe) : next.add(vibe);
      return next;
    });
  };

  const resetFilters = () => {
    setActiveVibes(new Set(ALL_VIBES));
    setSearchQuery('');
  };

  const getLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      ({ coords: { latitude: lat, longitude: lng } }) => setUserLocation({ lat, lng }),
      (err) => {
        console.warn('Location error:', err.message);
        setUserLocation({ lat: 6.455, lng: 3.384 });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="relative overflow-hidden" style={{ height: 'calc(100vh - 84px)' }}>
      <LeafletMap
        parties={filtered}
        userLocation={userLocation}
        onSelectParty={(id) => router.push(`/party/${id}`)}
        showHeatmap={showHeatmap}
      />

      {/* Top search overlay */}
      <div className="absolute left-3.5 right-3.5 top-3.5 z-[1000]">
        <div
          className="flex items-center gap-2.5 rounded-2xl border border-white/10 px-4 py-2.5 backdrop-blur-[22px]"
          style={{ background: 'rgba(17,17,17,0.92)' }}
        >
          <Search size={16} strokeWidth={2.5} color="#847E96" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or venue..."
            className="flex-1 border-none bg-transparent text-sm text-white outline-none font-heading"
          />
          <div
            className="flex-shrink-0 text-[11px] font-bold tracking-[0.5px]"
            style={{
              background: 'linear-gradient(135deg,#E85A7A,#A6A193)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            {filtered.length} Parties
          </div>
        </div>
      </div>

      {/* Legend / Filters */}
      <div className="absolute bottom-[18px] left-3.5 z-[1000]">
        <div className="rounded-[13px] border border-[color:var(--c-border3)] px-[15px] py-2.5 backdrop-blur-[18px]" style={{ background: 'rgba(17,17,17,0.92)' }}>
          <div className="mb-2.5 flex items-center justify-between gap-3.5">
            <div className="text-[10px] font-bold uppercase tracking-[0.9px]" style={{ color: '#847E96' }}>
              Filter by Vibe
            </div>
            <span onClick={resetFilters} className="cursor-pointer text-[10px] font-semibold" style={{ color: '#A78BFA' }}>
              Reset
            </span>
          </div>
          <div className="flex flex-col gap-[3px]">
            {ALL_VIBES.map((vibe) => {
              const active = activeVibes.has(vibe);
              return (
                <div
                  key={vibe}
                  onClick={() => toggleVibe(vibe)}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-[3px] text-xs transition-opacity"
                  style={{ color: active ? '#9691A3' : '#4B4658', opacity: active ? 1 : 0.55 }}
                >
                  <span style={{ color: VC[vibe], fontSize: 16 }}>●</span> {vibe}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Map action buttons */}
      <div className="absolute bottom-[18px] right-3.5 z-[1000] flex flex-col gap-2.5">
        <button
          onClick={() => setShowHeatmap((v) => !v)}
          aria-pressed={showHeatmap}
          title="Toggle party density heatmap"
          className="flex h-12 w-12 items-center justify-center rounded-full border backdrop-blur-[18px] transition-colors"
          style={
            showHeatmap
              ? {
                  background: 'linear-gradient(135deg,#800020,#0B1D34)',
                  borderColor: 'rgba(255,255,255,0.2)',
                  color: '#fff',
                  boxShadow: '0 4px 20px rgba(128,0,32,0.4)',
                }
              : {
                  background: 'rgba(17,17,17,0.92)',
                  borderColor: 'var(--c-border3)',
                  color: '#9691A3',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
                }
          }
        >
          <Flame size={19} strokeWidth={2.5} fill={showHeatmap ? 'rgba(255,255,255,0.25)' : 'none'} />
        </button>
        <button
          onClick={getLocation}
          className="flex h-12 w-12 items-center justify-center rounded-full border backdrop-blur-[18px]"
          style={{
            background: 'rgba(255,197,103,0.18)',
            borderColor: 'rgba(255,197,103,0.45)',
            color: '#FFC567',
            boxShadow: '0 4px 20px rgba(255,197,103,0.22)',
          }}
        >
          <Locate size={20} strokeWidth={2.5} />
        </button>
      </div>

      {showHeatmap && (
        <div className="absolute left-3.5 top-[68px] z-[1000]">
          <div
            className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-semibold backdrop-blur-[18px]"
            style={{ background: 'rgba(17,17,17,0.92)', borderColor: 'var(--c-border3)', color: '#9691A3' }}
          >
            <span
              className="h-1.5 w-5 rounded-full"
              style={{ background: 'linear-gradient(90deg,#058CD7,#552CB7,#FB7DA8,#FD5A46,#FFC567)' }}
            />
            Low
            <span style={{ color: 'var(--c-text-dim)' }}>→</span>
            High turnout
          </div>
        </div>
      )}
    </div>
  );
}
