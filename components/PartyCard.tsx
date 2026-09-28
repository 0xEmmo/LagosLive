'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Heart, Bell, Calendar, MapPin } from 'lucide-react';
import type { Party } from '@/lib/types';
import { VCB, VCT, partyPhoto, distanceColor, distanceBg, distanceBorder } from '@/lib/data';
import { isPartyTonight } from '@/lib/filters';
import { eventAvailability } from '@/lib/event-state';
import { useLagosLiveStore } from '@/lib/store';
import PartyPhoto from './PartyPhoto';

interface PartyCardProps {
  party: Party;
  showReminder?: boolean;
  imageHeight?: number;
  index?: number;
  appearance?: 'default' | 'editorial';
}

// Flat, touch-first event card. Media/details links are kept separate from
// the save and reminder buttons, avoiding nested interactive elements.
export default function PartyCard({
  party,
  showReminder = true,
  imageHeight = 200,
  index,
  appearance = 'default',
}: PartyCardProps) {
  const pathname = usePathname() ?? '/';
  const saved = useLagosLiveStore((state) => state.savedParties.includes(party.id));
  const reminded = useLagosLiveStore((state) => state.reminders.includes(party.id));
  const user = useLagosLiveStore((state) => state.user);
  const toggleSave = useLagosLiveStore((state) => state.toggleSave);
  const toggleReminder = useLagosLiveStore((state) => state.toggleReminder);
  const showToast = useLagosLiveStore((state) => state.showToast);
  const editorial = appearance === 'editorial';
  const keepHomePalette = pathname === '/' && editorial;
  const primaryAccent = keepHomePalette ? '#FF2D95' : '#2B68FF';
  const secondaryAccent = keepHomePalette ? '#B06AFF' : '#75A1FF';

  const handleSave = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const wasSaved = saved;
    toggleSave(party.id);
    if (!user && !wasSaved) {
      showToast('Saved on this device', 'Create an account to keep it saved across devices.');
    }
  };

  const handleReminder = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    toggleReminder(party.id, party.title);
  };

  const status = eventAvailability(party);
  const soldOut = status === 'SOLD_OUT';
  const closed = status === 'CLOSED' || status === 'CANCELLED';
  const almostFull = status === 'OPEN' && party.capacity > 0 && party.spotsLeft / party.capacity < 0.15;
  const tonight = isPartyTonight(party);
  const weekend = party.isWeekend;
  const actionBlue = '#5a8dff';

  return (
    <article
      className={`ll-card group block overflow-hidden rounded-[20px] border border-white/10 transition-colors duration-200 ease-out${keepHomePalette ? ' hover:border-[#FF2D95]/40' : ' ll-card--blue'}${editorial ? ' ll-card--editorial' : ''}`}
      style={{
        background: '#171725',
        boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
        animationDelay: index !== undefined ? `${Math.min(index, 8) * 45}ms` : undefined,
        animationFillMode: index !== undefined ? 'backwards' : undefined,
      }}
    >
      <div className="ll-card__media relative overflow-hidden" style={{ height: imageHeight, background: party.gradient }}>
        <PartyPhoto
          src={partyPhoto(party.id, party.coverUrl)}
          alt={party.title}
          gradient={party.gradient}
          sizes="(max-width: 768px) 100vw, 33vw"
          tone={editorial ? 'editorial' : 'default'}
        />
        <Link href={`/party/${party.id}`} className="ll-card__image-link" aria-label={`View event: ${party.title}`}>
          <span className="sr-only">View event: {party.title}</span>
        </Link>
        <div
          className="ll-card__shade pointer-events-none absolute inset-0 z-[1]"
          style={{ background: 'linear-gradient(to top, rgba(7,7,11,0.85) 0%, transparent 60%)' }}
        />
        <div className="absolute left-[12px] right-[12px] top-[12px] z-[2] flex items-start justify-between">
          <span
            className="ll-card__distance rounded-full px-2.5 py-[3px] text-[11px] font-semibold backdrop-blur-[8px]"
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
                type="button"
                onClick={handleReminder}
                aria-label={reminded ? `Remove reminder for ${party.title}` : `Remind me about ${party.title}`}
                className="ll-card__icon-button flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-200 active:opacity-70"
                style={{
                  background: 'rgba(0,0,0,0.5)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: reminded ? (editorial ? actionBlue : '#FFD600') : 'rgba(255,255,255,0.75)',
                }}
              >
                <Bell size={13} fill={reminded ? (editorial ? actionBlue : '#FFD600') : 'none'} strokeWidth={2} />
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              aria-label={saved ? `Remove ${party.title} from saved events` : `Save ${party.title}`}
              className="ll-card__icon-button flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-200 active:opacity-70"
              style={{
                background: 'rgba(0,0,0,0.5)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: saved ? (editorial ? actionBlue : primaryAccent) : 'rgba(255,255,255,0.75)',
              }}
            >
              <Heart size={13} fill={saved ? (editorial ? actionBlue : primaryAccent) : 'none'} strokeWidth={2} />
            </button>
          </div>
        </div>
        <div className="absolute bottom-[12px] left-[12px] z-[2]">
          <span
            className="ll-card__vibe rounded-full px-3 py-1 text-[11px] font-semibold backdrop-blur-[8px]"
            style={{ background: VCB[party.vibe], color: VCT[party.vibe], border: '1px solid rgba(255,255,255,0.08)' }}
          >
            {party.vibe}
          </span>
        </div>
      </div>

      <Link href={`/party/${party.id}`} className="ll-card__content-link block px-4 py-4" aria-label={`Open event details: ${party.title}`}>
        <div
          className={`ll-card__title mb-2 font-heading text-base font-bold leading-tight transition-colors duration-200${keepHomePalette ? ' group-hover:text-[#00BFFF]' : ' ll-card__title--blue'}`}
          style={{ color: '#FFFFFF' }}
        >
          {party.title}
        </div>
        <div className="mb-3 flex flex-col gap-1.5">
          <div className="ll-card__meta-line flex items-center gap-1.5 text-xs" style={{ color: '#A7A8B5' }}>
            <Calendar size={11} strokeWidth={2} />
            {party.date} · {party.time}
          </div>
          <div className="ll-card__meta-line flex items-center gap-1.5 text-xs" style={{ color: '#A7A8B5' }}>
            <MapPin size={11} strokeWidth={2} />
            {party.location}
          </div>
        </div>
        {(tonight || weekend || almostFull || soldOut) && (
          <div className="ll-card__statuses mb-3 flex flex-wrap gap-1.5">
            {tonight && (
              <span className="ll-card__status rounded-full px-2 py-[3px] text-[10px] font-bold uppercase tracking-[0.4px]" style={{ background: keepHomePalette ? 'rgba(255,45,149,0.14)' : 'rgba(43,104,255,0.14)', color: primaryAccent, border: `1px solid ${keepHomePalette ? 'rgba(255,45,149,0.28)' : 'rgba(43,104,255,0.28)'}` }}>
                Tonight
              </span>
            )}
            {!tonight && weekend && (
              <span className="ll-card__status rounded-full px-2 py-[3px] text-[10px] font-bold uppercase tracking-[0.4px]" style={{ background: keepHomePalette ? 'rgba(138,43,226,0.14)' : 'rgba(117,161,255,0.14)', color: secondaryAccent, border: `1px solid ${keepHomePalette ? 'rgba(138,43,226,0.28)' : 'rgba(117,161,255,0.28)'}` }}>
                This Weekend
              </span>
            )}
            {almostFull && (
              <span className="ll-card__status rounded-full px-2 py-[3px] text-[10px] font-bold uppercase tracking-[0.4px]" style={{ background: 'rgba(255,138,0,0.12)', color: '#FF8A00', border: '1px solid rgba(255,138,0,0.25)' }}>
                Almost Full
              </span>
            )}
            {soldOut && !closed && (
              <span className="ll-card__status rounded-full px-2 py-[3px] text-[10px] font-bold uppercase tracking-[0.4px]" style={{ background: 'rgba(255,255,255,0.06)', color: '#A7A8B5', border: '1px solid rgba(255,255,255,0.12)' }}>
                Sold Out
              </span>
            )}
            {closed && (
              <span className="ll-card__status rounded-full px-2 py-[3px] text-[10px] font-bold uppercase tracking-[0.4px]" style={{ background: 'rgba(255,255,255,0.06)', color: '#A7A8B5', border: '1px solid rgba(255,255,255,0.12)' }}>
                {status === 'CANCELLED' ? 'Cancelled' : 'Event Closed'}
              </span>
            )}
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="ll-card__price font-heading text-base font-bold gradient-text">{party.fee}</span>
          <span
            className="ll-card__ticket rounded-full px-3 py-1 text-[11px] font-semibold"
            style={{
              background: closed || soldOut ? 'rgba(255,255,255,0.06)' : keepHomePalette ? 'rgba(255,45,149,0.1)' : 'rgba(43,104,255,0.12)',
              border: `1px solid ${closed || soldOut ? 'rgba(255,255,255,0.12)' : keepHomePalette ? 'rgba(255,45,149,0.25)' : 'rgba(43,104,255,0.28)'}`,
              color: closed || soldOut ? '#A7A8B5' : primaryAccent,
            }}
          >
            {closed ? (status === 'CANCELLED' ? 'Cancelled' : 'Event Closed') : soldOut ? 'Sold Out' : 'Get Tickets'}
          </span>
        </div>
      </Link>
    </article>
  );
}
