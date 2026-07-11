'use client';

import Link from 'next/link';
import { Heart } from 'lucide-react';
import BackButton from '@/components/BackButton';
import PartyCard from '@/components/PartyCard';
import { PARTIES } from '@/lib/data';
import { useLagosLiveStore } from '@/lib/store';

export default function SavedPage() {
  const savedParties = useLagosLiveStore((s) => s.savedParties);
  const saved = PARTIES.filter((p) => savedParties.includes(p.id));

  return (
    <div className="animate-fade-in">
      <div
        className="sticky top-0 z-40 flex items-center gap-3 border-b px-5 py-3.5 backdrop-blur-[22px] backdrop-saturate-150"
        style={{ background: 'var(--c-header)', borderColor: 'var(--c-border)' }}
      >
        <BackButton href="/" />
        <span className="font-heading text-[13px] font-bold uppercase tracking-[1px]" style={{ color: 'var(--c-text)' }}>
          Saved Parties
        </span>
      </div>

      {saved.length === 0 ? (
        <div className="flex flex-col items-center gap-4 px-6 py-[72px]">
          <div
            className="flex h-[72px] w-[72px] items-center justify-center rounded-full border"
            style={{ background: 'rgba(251,125,168,0.1)', borderColor: 'rgba(251,125,168,0.28)' }}
          >
            <Heart size={32} strokeWidth={1.5} color="#C23F72" />
          </div>
          <div className="font-display text-[30px] tracking-[1px]" style={{ color: 'var(--c-text)' }}>
            No saved parties yet
          </div>
          <div className="max-w-[260px] text-center text-sm" style={{ color: 'var(--c-text-faint)' }}>
            Tap the heart on any party to save it here
          </div>
          <Link
            href="/search"
            className="rounded-xl border-none px-7 py-3 font-semibold text-white"
            style={{ background: 'linear-gradient(135deg,#552CB7,#FB7DA8)' }}
          >
            Browse Parties
          </Link>
        </div>
      ) : (
        <div
          className="grid gap-4 px-5 py-4"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', perspective: '1500px' }}
        >
          {saved.map((party) => (
            <PartyCard key={party.id} party={party} />
          ))}
        </div>
      )}
    </div>
  );
}
