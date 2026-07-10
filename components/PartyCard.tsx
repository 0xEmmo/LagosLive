'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Heart, Bell, Calendar, MapPin } from 'lucide-react';
import type { Party } from '@/lib/types';
import { VCB, VCT, partyPhoto, distanceColor, distanceBg, distanceBorder } from '@/lib/data';
import { useLagosLiveStore } from '@/lib/store';
import PartyPhoto from './PartyPhoto';

interface PartyCardProps {
  party: Party;
  showReminder?: boolean;
  imageHeight?: number;
}

export default function PartyCard({ party, showReminder = true, imageHeight = 175 }: PartyCardProps) {
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, active: false });
  const saved = useLagosLiveStore((s) => s.savedParties.includes(party.id));
  const reminded = useLagosLiveStore((s) => s.reminders.includes(party.id));
  const toggleSave = useLagosLiveStore((s) => s.toggleSave);
  const toggleReminder = useLagosLiveStore((s) => s.toggleReminder);

  const onMouseMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ rx: +(py * -9).toFixed(2), ry: +(px * 9).toFixed(2), active: true });
  };
  const onMouseLeave = () => setTilt((t) => ({ ...t, active: false }));

  const transform = tilt.active
    ? `perspective(1000px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) translateY(-6px) scale(1.015)`
    : 'perspective(1000px) rotateX(0deg) rotateY(0deg)';

  return (
    <Link
      href={`/party/${party.id}`}
      className="ll-card block overflow-hidden rounded-[18px] border cursor-pointer"
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      style={{
        background: 'var(--c-surface)',
        borderColor: tilt.active ? 'rgba(109,90,153,0.32)' : 'var(--c-border)',
        boxShadow: tilt.active ? '0 24px 48px rgba(0,0,0,0.45)' : 'none',
        transform,
        transformStyle: 'preserve-3d',
        transition: tilt.active
          ? 'transform 0.06s linear'
          : 'transform 0.5s cubic-bezier(0.22,0.9,0.3,1), box-shadow 0.3s ease, border-color 0.3s ease',
        willChange: 'transform',
      }}
    >
      <div className="relative overflow-hidden" style={{ height: imageHeight, background: party.gradient }}>
        <PartyPhoto
          src={partyPhoto(party.id)}
          alt={party.title}
          gradient={party.gradient}
          sizes="(max-width: 768px) 100vw, 33vw"
        />
        <div
          className="pointer-events-none absolute inset-0 z-[1]"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 60%)' }}
        />
        <div className="absolute left-[10px] right-[10px] top-[10px] z-[2] flex items-start justify-between">
          <span
            className="rounded-full px-2 py-[3px] text-[11px] font-semibold"
            style={{
              color: distanceColor(party.distance),
              background: distanceBg(party.distance),
              border: `1px solid ${distanceBorder(party.distance)}`,
            }}
          >
            {party.distance} km away
          </span>
          <div className="flex gap-1.5">
            {showReminder && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleReminder(party.id, party.title);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 backdrop-blur-[8px]"
                style={{ background: 'rgba(0,0,0,0.4)', color: reminded ? '#D4BE94' : 'rgba(255,255,255,0.65)' }}
              >
                <Bell size={13} fill={reminded ? '#D4BE94' : 'none'} strokeWidth={2} />
              </button>
            )}
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleSave(party.id);
              }}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 backdrop-blur-[8px]"
              style={{ background: 'rgba(0,0,0,0.4)', color: saved ? '#A85670' : 'rgba(255,255,255,0.65)' }}
            >
              <Heart size={13} fill="currentColor" strokeWidth={2} />
            </button>
          </div>
        </div>
        <div className="absolute bottom-[10px] left-[10px] z-[2]">
          <span
            className="rounded-full px-2.5 py-1 text-[11px] font-semibold backdrop-blur-[8px]"
            style={{ background: VCB[party.vibe], color: VCT[party.vibe], border: '1px solid rgba(255,255,255,0.08)' }}
          >
            {party.vibe}
          </span>
        </div>
      </div>
      <div className="px-[15px] py-3.5">
        <div className="mb-2 font-heading text-sm font-bold leading-tight" style={{ color: 'var(--c-text)' }}>
          {party.title}
        </div>
        <div className="mb-2.5 flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--c-text-muted)' }}>
            <Calendar size={11} strokeWidth={2.5} />
            {party.date} · {party.time}
          </div>
          <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--c-text-muted)' }}>
            <MapPin size={11} strokeWidth={2.5} />
            {party.location}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="font-heading text-sm font-bold" style={{ color: '#A896C9' }}>
            {party.fee}
          </span>
          <span className="text-[11px]" style={{ color: 'var(--c-text-dim)' }}>
            {party.spotsLeft} spots left
          </span>
        </div>
      </div>
    </Link>
  );
}
