'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Search, Locate, Flame, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { ALL_VIBES, VC } from '@/lib/data';
import { useParties } from '@/lib/hooks/useParties';
import { useLagosLiveStore } from '@/lib/store';
import type { Vibe } from '@/lib/types';

const LeafletMap = dynamic(() => import('@/components/LeafletMap'), { ssr: false });

export default function MapPage() {
  const router = useRouter();
  const { parties, loading, error, retry } = useParties();
  const userLocation = useLagosLiveStore((s) => s.userLocation);
  const requestLocation = useLagosLiveStore((s) => s.requestLocation);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeVibes, setActiveVibes] = useState<Set<Vibe>>(new Set(ALL_VIBES));
  const [showHeatmap, setShowHeatmap] = useState(false);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return parties.filter(
      (p) => activeVibes.has(p.vibe) && (!q || p.title.toLowerCase().includes(q) || p.location.toLowerCase().includes(q))
    );
  }, [parties, searchQuery, activeVibes]);

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
          className="flex items-center gap-2.5 rounded-2xl px-4 py-2.5 backdrop-blur-[22px] backdrop-saturate-150"
          style={{
            background: 'rgba(7,7,11,0.92)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <Search size={16} strokeWidth={2} color="#6B6C80" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or venue..."
            className="flex-1 border-none bg-transparent text-sm text-white outline-none font-heading"
          />
          <div className="flex-shrink-0 text-[11px] font-bold tracking-[0.5px] gradient-text">
            {loading ? 'Loading…' : `${filtered.length} Parties`}
          </div>
        </div>
      </div>

      {/* Loading / error banner */}
      {error && (
        <div
          className="absolute left-3.5 right-3.5 top-[68px] z-[1000] flex items-center gap-2.5 rounded-xl px-4 py-2.5 backdrop-blur-[22px]"
          style={{ background: 'rgba(30,20,10,0.92)', border: '1px solid rgba(255,138,0,0.3)' }}
        >
          <AlertTriangle size={15} strokeWidth={2} color="#FF8A00" className="flex-shrink-0" />
          <div className="flex-1 text-xs" style={{ color: '#FFD6A8' }}>
            Couldn&apos;t load events.
          </div>
          <button
            onClick={retry}
            className="flex flex-shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold"
            style={{ background: 'rgba(255,138,0,0.15)', border: '1px solid rgba(255,138,0,0.3)', color: '#FF8A00' }}
          >
            <RefreshCw size={11} strokeWidth={2.5} />
            Retry
          </button>
        </div>
      )}
      {loading && !error && (
        <div className="absolute left-3.5 right-3.5 top-[68px] z-[1000] flex items-center gap-2 rounded-xl px-4 py-2.5 backdrop-blur-[22px]"
          style={{ background: 'rgba(7,7,11,0.92)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <Loader2 size={14} strokeWidth={2.5} color="#FF5A2E" className="animate-spin" />
          <div className="text-xs" style={{ color: '#A7A8B5' }}>Loading parties…</div>
        </div>
      )}

      {/* Legend / Filters */}
      <div className="absolute bottom-[18px] left-3.5 z-[1000]">
        <div
          className="rounded-[13px] px-[15px] py-2.5 backdrop-blur-[18px] backdrop-saturate-150"
          style={{ background: 'rgba(7,7,11,0.92)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div className="mb-2.5 flex items-center justify-between gap-3.5">
            <div className="text-[10px] font-bold uppercase tracking-[0.9px]" style={{ color: '#6B6C80' }}>
              Filter by Vibe
            </div>
            <span onClick={resetFilters} className="cursor-pointer text-[10px] font-semibold" style={{ color: '#FF5A2E' }}>
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
                  className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-[3px] text-xs transition-all"
                  style={{ color: active ? '#A7A8B5' : '#6B6C80', opacity: active ? 1 : 0.5 }}
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
          className="flex h-12 w-12 items-center justify-center rounded-full backdrop-blur-[18px] backdrop-saturate-150 transition-all duration-200"
          style={
            showHeatmap
              ? {
                  background: 'linear-gradient(135deg,#FF5A2E,#FF7F5C)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: '#fff',
                  boxShadow: '0 4px 20px rgba(255,90,46,0.4)',
                }
              : {
                  background: 'rgba(7,7,11,0.92)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: '#A7A8B5',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
                }
          }
        >
          <Flame size={19} strokeWidth={2} fill={showHeatmap ? 'rgba(255,255,255,0.25)' : 'none'} />
        </button>
        <button
          onClick={requestLocation}
          className="flex h-12 w-12 items-center justify-center rounded-full backdrop-blur-[18px] backdrop-saturate-150 transition-all duration-200"
          style={{
            background: 'rgba(255,90,46,0.1)',
            border: '1px solid rgba(255,90,46,0.25)',
            color: '#FF5A2E',
            boxShadow: '0 4px 20px rgba(255,90,46,0.15)',
          }}
        >
          <Locate size={20} strokeWidth={2} />
        </button>
      </div>

      <div
        className="absolute left-3.5 top-[68px] z-[1000] transition-all duration-200"
        style={{
          opacity: showHeatmap ? 1 : 0,
          transform: showHeatmap ? 'translateY(0) scale(1)' : 'translateY(-4px) scale(0.96)',
          visibility: showHeatmap ? 'visible' : 'hidden',
        }}
      >
        <div
          className="flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-semibold backdrop-blur-[18px] backdrop-saturate-150"
          style={{ background: 'rgba(7,7,11,0.92)', border: '1px solid rgba(255,255,255,0.08)', color: '#A7A8B5' }}
        >
          <span
            className="h-1.5 w-5 rounded-full"
            style={{ background: 'linear-gradient(90deg,#3ECF8E,#FFB347,#FF5A2E,#FF7F5C)' }}
          />
          Low
          <span style={{ color: '#6B6C80' }}>→</span>
          High turnout
        </div>
      </div>
    </div>
  );
}
