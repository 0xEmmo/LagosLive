'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Heart, Bell, Calendar, MapPin } from 'lucide-react';
import type { Party } from '@/lib/types';
import { VCB, VCT, partyPhoto, distanceColor, distanceBg, distanceBorder } from '@/lib/data';
import { isPartyTonight } from '@/lib/filters';
import { useLagosLiveStore } from '@/lib/store';
import PartyPhoto from './PartyPhoto';

interface PartyCardProps {
  party: Party;
  showReminder?: boolean;
  imageHeight?: number;
  index?: number;
}

export default function PartyCard({ party, showReminder = true, imageHeight = 200, index }: PartyCardProps) {
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, active: false });
  const [hovered, setHovered] = useState(false);
  const saved = useLagosLiveStore((s) => s.savedParties.includes(party.id));
  const reminded = useLagosLiveStore((s) => s.reminders.includes(party.id));
  const toggleSave = useLagosLiveStore((s) => s.toggleSave);
  const toggleReminder = useLagosLiveStore((s) => s.toggleReminder);

  const onMouseMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ rx: +(py * -8).toFixed(2), ry: +(px * 8).toFixed(2), active: true });
  };
  const onMouseLeave = () => {
    setTilt((t) => ({ ...t, active: false }));
    setHovered(false);
  };

  const transform = tilt.active
    ? `perspective(1000px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) translateY(-8px) scale(1.02)`
    : 'perspective(1000px) rotateX(0deg) rotateY(0deg)';

  const soldOut = party.spotsLeft <= 0;
  const almostFull = !soldOut && party.capacity > 0 && party.spotsLeft / party.capacity < 0.15;
  const tonight = isPartyTonight(party);
  const weekend = party.isWeekend;

  return (
    <Link
      href={`/party/${party.id}`}
      className="ll-card group block overflow-hidden rounded-[20px] cursor-pointer"
      onMouseMove={onMouseMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={onMouseLeave}
      style={{
        background: '#171725',
        border: '1px solid',
        borderColor: tilt.active ? 'rgba(255,45,149,0.3)' : 'rgba(255,255,255,0.08)',
        boxShadow: tilt.active
          ? '0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(255,45,149,0.15)'
          : '0 10px 40px rgba(0,0,0,0.4)',
        transform,
        transformStyle: 'preserve-3d',
        transition: tilt.active
          ? 'transform 0.06s linear'
          : 'transform 0.5s cubic-bezier(0.22,0.9,0.3,1), box-shadow 0.3s ease, border-color 0.3s ease',
        willChange: 'transform',
        animationDelay: index !== undefined ? `${Math.min(index, 8) * 45}ms` : undefined,
        animationFillMode: index !== undefined ? 'backwards' : undefined,
      }}
    >
      <div className="relative overflow-hidden" style={{ height: imageHeight, background: party.gradient }}>
        <div className={`transition-transform duration-700 ease-out ${hovered ? 'scale-110' : 'scale-100'}`}>
          <PartyPhoto
            src={partyPhoto(party.id)}
            alt={party.title}
            gradient={party.gradient}
            sizes="(max-width: 768px) 100vw, 33vw"
          />
        </div>
        <div
          className="pointer-events-none absolute inset-0 z-[1]"
          style={{ background: 'linear-gradient(to top, rgba(7,7,11,0.85) 0%, transparent 60%)' }}
        />
        <div className="absolute left-[12px] right-[12px] top-[12px] z-[2] flex items-start justify-between">
          <span
            className="rounded-full px-2.5 py-[3px] text-[11px] font-semibold backdrop-blur-[8px]"
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
                className="flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200 active:scale-90 hover:scale-105"
                style={{
                  background: 'rgba(0,0,0,0.5)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: reminded ? '#FFD600' : 'rgba(255,255,255,0.75)',
                }}
              >
                <Bell size={13} fill={reminded ? '#FFD600' : 'none'} strokeWidth={2} />
              </button>
            )}
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleSave(party.id);
              }}
              className="flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200 active:scale-90 hover:scale-105"
              style={{
                background: 'rgba(0,0,0,0.5)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: saved ? '#FF2D95' : 'rgba(255,255,255,0.75)',
              }}
            >
              <Heart size={13} fill={saved ? '#FF2D95' : 'none'} strokeWidth={2} />
            </button>
          </div>
        </div>
        <div className="absolute bottom-[12px] left-[12px] z-[2]">
          <span
            className="rounded-full px-3 py-1 text-[11px] font-semibold backdrop-blur-[8px]"
            style={{ background: VCB[party.vibe], color: VCT[party.vibe], border: '1px solid rgba(255,255,255,0.08)' }}
          >
            {party.vibe}
          </span>
        </div>
      </div>
      <div className="px-4 py-4">
        <div className="mb-2 font-heading text-base font-bold leading-tight" style={{ color: '#FFFFFF' }}>
          {party.title}
        </div>
        <div className="mb-3 flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 text-xs" style={{ color: '#A7A8B5' }}>
            <Calendar size={11} strokeWidth={2} />
            {party.date} · {party.time}
          </div>
          <div className="flex items-center gap-1.5 text-xs" style={{ color: '#A7A8B5' }}>
            <MapPin size={11} strokeWidth={2} />
            {party.location}
          </div>
        </div>
        {(tonight || weekend || almostFull || soldOut) && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {tonight && (
              <span
                className="rounded-full px-2 py-[3px] text-[10px] font-bold uppercase tracking-[0.4px]"
                style={{ background: 'rgba(255,45,149,0.14)', color: '#FF2D95', border: '1px solid rgba(255,45,149,0.28)' }}
              >
                Tonight
              </span>
            )}
            {!tonight && weekend && (
              <span
                className="rounded-full px-2 py-[3px] text-[10px] font-bold uppercase tracking-[0.4px]"
                style={{ background: 'rgba(138,43,226,0.14)', color: '#B06AFF', border: '1px solid rgba(138,43,226,0.28)' }}
              >
                This Weekend
              </span>
            )}
            {almostFull && (
              <span
                className="rounded-full px-2 py-[3px] text-[10px] font-bold uppercase tracking-[0.4px]"
                style={{ background: 'rgba(255,138,0,0.12)', color: '#FF8A00', border: '1px solid rgba(255,138,0,0.25)' }}
              >
                Almost Full
              </span>
            )}
            {soldOut && (
              <span
                className="rounded-full px-2 py-[3px] text-[10px] font-bold uppercase tracking-[0.4px]"
                style={{ background: 'rgba(255,255,255,0.06)', color: '#A7A8B5', border: '1px solid rgba(255,255,255,0.12)' }}
              >
                Sold Out
              </span>
            )}
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="font-heading text-base font-bold gradient-text">
            {party.fee}
          </span>
          <span
            className="rounded-full px-3 py-1 text-[11px] font-semibold transition-all duration-200"
            style={{
              background: soldOut ? 'rgba(255,255,255,0.06)' : 'rgba(255,45,149,0.1)',
              border: `1px solid ${soldOut ? 'rgba(255,255,255,0.12)' : 'rgba(255,45,149,0.25)'}`,
              color: soldOut ? '#A7A8B5' : '#FF2D95',
            }}
          >
            {soldOut ? 'Sold Out' : 'Get Tickets'}
          </span>
        </div>
      </div>
    </Link>
  );
}
