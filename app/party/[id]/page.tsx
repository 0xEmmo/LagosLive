'use client';

import { useState } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  Bell,
  Calendar,
  MapPin,
  Users,
  Ticket,
  MessageCircle,
  Instagram,
  Share2,
  Link as LinkIcon,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import BackButton from '@/components/BackButton';
import PartyCard from '@/components/PartyCard';
import PartyPhoto from '@/components/PartyPhoto';
import GetThereMenu from '@/components/GetThereMenu';
import SwipeCarousel from '@/components/SwipeCarousel';
import { partyPhoto, partyDetailPhoto, VCB, VCT, distanceColor } from '@/lib/data';
import { useParty } from '@/lib/hooks/useParty';
import { useParties } from '@/lib/hooks/useParties';
import { useLagosLiveStore } from '@/lib/store';

export default function PartyDetailPage({ params }: { params: { id: string } }) {
  const { party, loading, error, retry } = useParty(Number(params.id));
  const { parties } = useParties();
  const [carouselIndex, setCarouselIndex] = useState(0);

  const saved = useLagosLiveStore((s) => (party ? s.savedParties.includes(party.id) : false));
  const reminded = useLagosLiveStore((s) => (party ? s.reminders.includes(party.id) : false));
  const toggleSave = useLagosLiveStore((s) => s.toggleSave);
  const toggleReminder = useLagosLiveStore((s) => s.toggleReminder);
  const showToast = useLagosLiveStore((s) => s.showToast);

  if (loading) {
    return (
      <div className="mx-auto max-w-[720px] animate-pulse">
        <div
          className="sticky top-0 z-40 flex items-center justify-between border-b px-5 py-3.5"
          style={{ background: 'var(--c-header)', borderColor: 'rgba(255,255,255,0.04)' }}
        >
          <div className="h-9 w-16 rounded-[10px]" style={{ background: 'rgba(255,255,255,0.07)' }} />
          <div className="flex gap-2">
            <div className="h-[38px] w-[38px] rounded-[10px]" style={{ background: 'rgba(255,255,255,0.07)' }} />
            <div className="h-[38px] w-[38px] rounded-[10px]" style={{ background: 'rgba(255,255,255,0.07)' }} />
          </div>
        </div>
        <div className="h-[320px] w-full" style={{ background: 'rgba(255,255,255,0.05)' }} />
        <div className="px-5 pt-[28px]">
          <div className="mb-5 h-9 w-3/5 rounded-lg" style={{ background: 'rgba(255,255,255,0.08)' }} />
          <div className="mb-6 h-[52px] w-full rounded-[14px]" style={{ background: 'rgba(255,45,149,0.15)' }} />
          <div className="mb-3 h-[68px] w-full rounded-xl" style={{ background: 'rgba(255,255,255,0.05)' }} />
          <div className="mb-3 h-[68px] w-full rounded-xl" style={{ background: 'rgba(255,255,255,0.05)' }} />
          <div className="mb-3 h-[86px] w-full rounded-xl" style={{ background: 'rgba(255,255,255,0.05)' }} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <div
          className="flex h-[72px] w-[72px] items-center justify-center rounded-full"
          style={{ background: 'rgba(255,138,0,0.08)', border: '1px solid rgba(255,138,0,0.15)' }}
        >
          <AlertTriangle size={32} strokeWidth={1.5} color="#FF8A00" />
        </div>
        <div className="font-display text-[30px] tracking-[1px]" style={{ color: '#FFFFFF' }}>
          Couldn&apos;t load this party
        </div>
        <div className="max-w-[260px] text-sm" style={{ color: '#A7A8B5' }}>
          Something went wrong fetching this event. Try again in a moment.
        </div>
        <button
          onClick={retry}
          className="btn-primary flex items-center gap-2 px-7 py-3 text-sm font-semibold"
        >
          <RefreshCw size={14} strokeWidth={2.5} />
          Retry
        </button>
      </div>
    );
  }

  if (!party) notFound();

  const isFree = party.feeNum === 0;
  const shareUrl = `https://lagoslive.ng/party/${party.id}`;
  const shareText = `${party.title} on Lagos Live! ${party.date} @ ${party.location}`;

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: party.title, text: shareText, url: shareUrl });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      showToast('Link copied', 'Share it with your crew.');
    } catch {}
  };

  const images = [partyPhoto(party.id), partyDetailPhoto(party.id, 'b'), partyDetailPhoto(party.id, 'c')];
  const capPct = Math.min(100, Math.round(((party.capacity - party.spotsLeft) / party.capacity) * 100));
  const spotsUrgent = party.spotsLeft < 100;
  const soldOut = party.spotsLeft <= 0;
  const similarParties = parties.filter((p) => p.id !== party.id && p.vibe === party.vibe).slice(0, 4);

  return (
    <div className="mx-auto max-w-[720px] animate-fade-in">
      <div
        className="sticky top-0 z-40 flex items-center justify-between border-b px-5 py-3.5 backdrop-blur-[22px] backdrop-saturate-150"
        style={{ background: 'var(--c-header)', borderColor: 'rgba(255,255,255,0.04)' }}
      >
        <BackButton href="/" />
        <div className="flex gap-2">
          <button
            onClick={handleShare}
            className="flex h-[38px] w-[38px] items-center justify-center rounded-[10px] transition-all duration-200 active:scale-90 glass glass-hover"
            style={{ color: '#A7A8B5' }}
          >
            <Share2 size={17} strokeWidth={2} />
          </button>
          <button
            onClick={() => toggleReminder(party.id, party.title)}
            className="flex h-[38px] w-[38px] items-center justify-center rounded-[10px] transition-all duration-200 active:scale-90 glass glass-hover"
            style={{ color: reminded ? '#FFD600' : '#A7A8B5' }}
          >
            <Bell size={17} fill={reminded ? '#FFD600' : 'none'} strokeWidth={2} />
          </button>
          <button
            onClick={() => toggleSave(party.id)}
            className="flex h-[38px] w-[38px] items-center justify-center rounded-[10px] transition-all duration-200 active:scale-90 glass glass-hover"
            style={{ color: saved ? '#FF2D95' : '#A7A8B5' }}
          >
            <Heart size={18} fill={saved ? '#FF2D95' : 'none'} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Image carousel */}
      <div className="relative h-[320px] overflow-hidden">
        <SwipeCarousel count={images.length} index={carouselIndex} onIndexChange={setCarouselIndex}>
          {images.map((src, i) => (
            <div key={i} className="relative h-[320px] w-full flex-shrink-0" style={{ background: party.gradient }}>
              <PartyPhoto src={src} alt={`${party.title} photo ${i + 1}`} gradient={party.gradient} sizes="100vw" priority={i === 0} />
              <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(7,7,11,0.6) 0%, transparent 50%)' }} />
            </div>
          ))}
        </SwipeCarousel>
        <button
          onClick={() => setCarouselIndex((i) => Math.max(0, i - 1))}
          className="absolute left-3 top-1/2 z-[3] flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-white backdrop-blur-[8px] transition-all duration-200 active:scale-90"
          style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <ChevronLeft size={13} strokeWidth={2.5} />
        </button>
        <button
          onClick={() => setCarouselIndex((i) => Math.min(images.length - 1, i + 1))}
          className="absolute right-3 top-1/2 z-[3] flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-white backdrop-blur-[8px] transition-all duration-200 active:scale-90"
          style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <ChevronRight size={13} strokeWidth={2.5} />
        </button>
        <div className="absolute bottom-3.5 left-1/2 z-[3] flex -translate-x-1/2 items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              onClick={() => setCarouselIndex(i)}
              className="h-[6px] cursor-pointer rounded-[3px] transition-all duration-300"
              style={{
                width: carouselIndex === i ? 24 : 6,
                background: carouselIndex === i ? '#FF2D95' : 'rgba(255,255,255,0.4)',
                boxShadow: carouselIndex === i ? '0 0 10px rgba(255,45,149,0.5)' : 'none',
              }}
            />
          ))}
        </div>
        <div className="absolute bottom-3.5 left-4 z-[3]">
          <span
            className="rounded-full border px-3 py-[5px] text-xs font-bold backdrop-blur-[8px]"
            style={{ background: VCB[party.vibe], color: VCT[party.vibe], borderColor: 'rgba(255,255,255,0.12)' }}
          >
            {party.vibe}
          </span>
        </div>
      </div>

      <div className="px-5 pb-2 pt-[28px]">
        <div className="mb-5 flex items-start justify-between gap-3">
          <h1 className="font-display text-[40px] leading-none tracking-[0.5px]" style={{ color: '#FFFFFF' }}>
            {party.title}
          </h1>
          <div
            className="flex-shrink-0 rounded-xl px-3.5 py-2.5 text-center"
            style={{
              background: 'linear-gradient(135deg, rgba(255,45,149,0.12), rgba(138,43,226,0.10))',
              border: '1px solid rgba(255,45,149,0.2)',
            }}
          >
            <div className="font-heading text-base font-bold gradient-text">{isFree ? 'Free' : party.fee}</div>
            <div className="mt-px text-[10px]" style={{ color: '#A7A8B5' }}>entry</div>
          </div>
        </div>

        {/* CTA Buttons */}
        <div className="mb-5 flex gap-3">
          {soldOut ? (
            <div
              className="flex flex-1 cursor-not-allowed items-center justify-center gap-2 rounded-[14px] py-4 text-[13px] font-bold tracking-[0.5px]"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#A7A8B5',
              }}
            >
              <Ticket size={15} strokeWidth={2.5} />
              Sold Out
            </div>
          ) : (
            <Link
              href={`/checkout/${party.id}`}
              className="btn-primary flex flex-1 items-center justify-center gap-2 py-4 text-[13px] font-bold tracking-[0.5px]"
            >
              <Ticket size={15} strokeWidth={2.5} />
              {isFree ? 'Get Free Entry' : `Get Tickets · ${party.fee}`}
            </Link>
          )}
          <GetThereMenu party={party} />
        </div>

        {/* Info section with glass cards */}
        <div className="mb-6 flex flex-col gap-3">
          <div className="glass rounded-xl p-3.5 flex items-center gap-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg" style={{ background: 'rgba(255,45,149,0.1)' }}>
              <Calendar size={15} color="#FF2D95" strokeWidth={2} />
            </div>
            <div>
              <div className="text-[13px] font-semibold" style={{ color: '#FFFFFF' }}>{party.date}</div>
              <div className="text-xs" style={{ color: '#A7A8B5' }}>{party.time}</div>
            </div>
          </div>
          <div className="glass rounded-xl p-3.5 flex items-center gap-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg" style={{ background: 'rgba(0,191,255,0.1)' }}>
              <MapPin size={15} color="#00BFFF" strokeWidth={2} />
            </div>
            <div>
              <div className="text-[13px] font-semibold" style={{ color: '#FFFFFF' }}>{party.location}</div>
              <div className="text-xs" style={{ color: '#A7A8B5' }}>{party.address}</div>
            </div>
          </div>
          <div className="glass rounded-xl p-3.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg" style={{ background: 'rgba(0,245,212,0.1)' }}>
                <Users size={15} color="#00F5D4" strokeWidth={2} />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div className="text-[13px] font-semibold" style={{ color: '#FFFFFF' }}>
                    {party.spotsLeft} / {party.capacity} spots left
                  </div>
                  <div className="text-[11px]" style={{ color: soldOut ? '#FF8A00' : spotsUrgent ? '#FF8A00' : '#6B6C80', fontWeight: soldOut || spotsUrgent ? 600 : 400 }}>
                    {soldOut ? 'Sold out' : spotsUrgent ? 'Almost full!' : ''}
                  </div>
                </div>
              </div>
            </div>
            <div className="h-[5px] overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div
                className="h-full rounded-full transition-[width] duration-500 ease-out"
                style={{
                  width: `${capPct}%`,
                  background: `linear-gradient(90deg,${capPct > 80 ? '#FF8A00' : '#FF2D95'},${capPct > 80 ? '#FFD600' : '#8A2BE2'})`,
                  boxShadow: `0 0 10px ${capPct > 80 ? 'rgba(255,138,0,0.4)' : 'rgba(255,45,149,0.4)'}`,
                }}
              />
            </div>
          </div>
        </div>

        <div className="mb-5 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />

        {/* About */}
        <div className="mb-6">
          <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[1.5px]" style={{ color: '#A7A8B5' }}>
            About this Event
          </h3>
          <p className="text-sm leading-[1.8]" style={{ color: '#A7A8B5' }}>{party.description}</p>
        </div>

        {/* Detail info grid */}
        <div className="mb-5 grid grid-cols-2 gap-2.5">
          {[
            { label: 'Age', value: party.ageRestriction },
            { label: 'Dress Code', value: party.dressCode },
            { label: 'Organizer', value: party.organizer },
          ].map((item) => (
            <div key={item.label} className="glass rounded-xl p-3.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <div className="mb-[5px] text-[10px] uppercase tracking-[0.7px]" style={{ color: '#6B6C80' }}>{item.label}</div>
              <div className="text-sm font-semibold" style={{ color: '#FFFFFF' }}>{item.value}</div>
            </div>
          ))}
          <div className="glass rounded-xl p-3.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <div className="mb-[5px] text-[10px] uppercase tracking-[0.7px]" style={{ color: '#6B6C80' }}>Distance</div>
            <div className="text-sm font-semibold" style={{ color: distanceColor(party.distance) }}>{party.distance} km away</div>
          </div>
        </div>

        {/* Contact */}
        <div className="mb-4 glass rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[1.5px]" style={{ color: '#A7A8B5' }}>
            Contact Organizer
          </h3>
          <div className="flex flex-wrap gap-2.5">
            <a
              href={`https://wa.me/${party.whatsapp.replace(/\D/g, '')}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-[10px] px-3.5 py-2.5 text-[13px] font-medium transition-all duration-200"
              style={{ background: 'rgba(0,245,212,0.08)', border: '1px solid rgba(0,245,212,0.2)', color: '#00F5D4' }}
            >
              <MessageCircle size={14} />
              WhatsApp
            </a>
            <a
              href={`https://instagram.com/${party.instagram.replace('@', '')}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-[10px] px-3.5 py-2.5 text-[13px] font-medium transition-all duration-200"
              style={{ background: 'rgba(255,45,149,0.08)', border: '1px solid rgba(255,45,149,0.2)', color: '#FF2D95' }}
            >
              <Instagram size={14} strokeWidth={2} />
              {party.instagram}
            </a>
          </div>
        </div>

        {/* Share */}
        <div className="mb-6 glass rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[1.5px]" style={{ color: '#A7A8B5' }}>
            Share this Event
          </h3>
          <div className="flex flex-wrap gap-2.5">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-[10px] px-3.5 py-2.5 text-[13px] font-medium glass glass-hover"
              style={{ color: '#A7A8B5' }}
            >
              <Share2 size={13} strokeWidth={2} />
              Share via WhatsApp
            </a>
            <button
              onClick={() => {
                try {
                  navigator.clipboard.writeText(shareUrl);
                  showToast('Link copied', 'Share it with your crew.');
                } catch {}
              }}
              className="flex items-center gap-1.5 rounded-[10px] px-3.5 py-2.5 text-[13px] font-medium glass glass-hover"
              style={{ color: '#A7A8B5' }}
            >
              <LinkIcon size={13} strokeWidth={2} />
              Copy Link
            </button>
          </div>
        </div>

        {similarParties.length > 0 && (
          <div className="pb-2">
            <h3 className="mb-3.5 text-[11px] font-bold uppercase tracking-[1.5px]" style={{ color: '#A7A8B5' }}>
              You Might Also Like
            </h3>
            <div className="no-scrollbar flex gap-3.5 overflow-x-auto pb-1">
              {similarParties.map((sp2) => (
                <Link
                  key={sp2.id}
                  href={`/party/${sp2.id}`}
                  className="w-[195px] flex-shrink-0 overflow-hidden rounded-2xl"
                  style={{ background: '#171725', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <div className="relative h-[108px]" style={{ background: sp2.gradient }}>
                    <PartyPhoto src={partyPhoto(sp2.id)} alt={sp2.title} gradient={sp2.gradient} sizes="195px" />
                    <div className="pointer-events-none absolute inset-0 z-[1]" style={{ background: 'linear-gradient(to top, rgba(7,7,11,0.6), transparent 60%)' }} />
                    <div className="absolute bottom-[7px] left-2 z-[2]">
                      <span className="rounded-full px-2 py-[3px] text-[11px] font-semibold" style={{ background: VCB[sp2.vibe], color: VCT[sp2.vibe] }}>
                        {sp2.vibe}
                      </span>
                    </div>
                  </div>
                  <div className="px-[11px] py-2.5">
                    <div className="mb-[3px] font-heading text-xs font-bold" style={{ color: '#FFFFFF' }}>{sp2.title}</div>
                    <div className="mb-1.5 text-[11px]" style={{ color: '#A7A8B5' }}>{sp2.date}</div>
                    <div className="font-heading text-[13px] font-bold gradient-text">{sp2.fee}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
