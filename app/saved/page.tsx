'use client';

import Link from 'next/link';
import { Heart, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import BackButton from '@/components/BackButton';
import PartyCard from '@/components/PartyCard';
import { useParties } from '@/lib/hooks/useParties';
import { useLagosLiveStore } from '@/lib/store';

export default function SavedPage() {
  const { parties, loading, error, retry } = useParties();
  const savedParties = useLagosLiveStore((s) => s.savedParties);
  const saved = parties.filter((p) => savedParties.includes(p.id));

  return (
    <div className="animate-fade-in">
      <div
        className="sticky top-0 z-40 flex items-center gap-3 border-b px-5 py-3.5 backdrop-blur-[22px] backdrop-saturate-150"
        style={{ background: 'var(--c-header)', borderColor: 'rgba(255,255,255,0.04)' }}
      >
        <BackButton href="/" />
        <span className="font-heading text-[13px] font-bold uppercase tracking-[1px]" style={{ color: '#FFFFFF' }}>
          Saved Parties
        </span>
      </div>

      {loading ? (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
          <Loader2 size={28} strokeWidth={2} color="#FF2D95" className="animate-spin" />
          <div className="text-xs font-medium uppercase tracking-[1px]" style={{ color: '#6B6C80' }}>
            Loading saved parties…
          </div>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-4 px-6 py-[72px] text-center">
          <div
            className="flex h-[72px] w-[72px] items-center justify-center rounded-full"
            style={{ background: 'rgba(255,138,0,0.08)', border: '1px solid rgba(255,138,0,0.15)' }}
          >
            <AlertTriangle size={32} strokeWidth={1.5} color="#FF8A00" />
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
      ) : saved.length === 0 ? (
        <div className="flex flex-col items-center gap-4 px-6 py-[72px]">
          <div
            className="flex h-[72px] w-[72px] items-center justify-center rounded-full"
            style={{ background: 'rgba(255,45,149,0.08)', border: '1px solid rgba(255,45,149,0.15)' }}
          >
            <Heart size={32} strokeWidth={1.5} color="#FF2D95" />
          </div>
          <div className="font-display text-[30px] tracking-[1px]" style={{ color: '#FFFFFF' }}>
            No saved parties yet
          </div>
          <div className="max-w-[260px] text-center text-sm" style={{ color: '#A7A8B5' }}>
            Tap the heart on any party to save it here
          </div>
          <Link
            href="/search"
            className="btn-primary px-7 py-3 text-sm font-semibold"
          >
            Browse Parties
          </Link>
        </div>
      ) : (
        <div
          className="grid gap-4 px-5 py-4"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', perspective: '1500px' }}
        >
          {saved.map((party, i) => (
            <PartyCard key={party.id} party={party} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
