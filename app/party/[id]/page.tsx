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
  Navigation as NavigationIcon,
  MessageCircle,
  Instagram,
  Share2,
  Link as LinkIcon,
} from 'lucide-react';
import BackButton from '@/components/BackButton';
import PartyCard from '@/components/PartyCard';
import PartyPhoto from '@/components/PartyPhoto';
import { PARTIES, getPartyById, partyPhoto, partyDetailPhoto, VCB, VCT, distanceColor } from '@/lib/data';
import { useLagosLiveStore } from '@/lib/store';

export default function PartyDetailPage({ params }: { params: { id: string } }) {
  const party = getPartyById(Number(params.id));
  const [carouselIndex, setCarouselIndex] = useState(0);

  const saved = useLagosLiveStore((s) => (party ? s.savedParties.includes(party.id) : false));
  const reminded = useLagosLiveStore((s) => (party ? s.reminders.includes(party.id) : false));
  const toggleSave = useLagosLiveStore((s) => s.toggleSave);
  const toggleReminder = useLagosLiveStore((s) => s.toggleReminder);

  if (!party) notFound();

  const images = [partyPhoto(party.id), partyDetailPhoto(party.id, 'b'), partyDetailPhoto(party.id, 'c')];
  const capPct = Math.min(100, Math.round(((party.capacity - party.spotsLeft) / party.capacity) * 100));
  const spotsUrgent = party.spotsLeft < 100;
  const similarParties = PARTIES.filter((p) => p.id !== party.id && p.vibe === party.vibe).slice(0, 4);

  return (
    <div className="mx-auto max-w-[720px] animate-fade-in">
      <div
        className="sticky top-0 z-40 flex items-center justify-between border-b px-5 py-3.5 backdrop-blur-[22px]"
        style={{ background: 'var(--c-header)', borderColor: 'var(--c-border)' }}
      >
        <BackButton href="/" />
        <div className="flex gap-2">
          <button
            onClick={() => toggleReminder(party.id, party.title)}
            className="flex h-[38px] w-[38px] items-center justify-center rounded-[10px] border"
            style={{ background: 'var(--c-glass)', borderColor: 'var(--c-border3)', color: reminded ? '#D4BE94' : 'var(--c-text-faint)' }}
          >
            <Bell size={17} fill={reminded ? '#D4BE94' : 'none'} strokeWidth={2} />
          </button>
          <button
            onClick={() => toggleSave(party.id)}
            className="flex h-[38px] w-[38px] items-center justify-center rounded-[10px] border"
            style={{ background: 'var(--c-glass)', borderColor: 'var(--c-border3)', color: saved ? '#A85670' : 'var(--c-text-faint)' }}
          >
            <Heart size={18} fill={saved ? '#A85670' : 'none'} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Image carousel */}
      <div className="relative h-[280px] overflow-hidden">
        <div
          className="flex h-full transition-transform duration-[450ms]"
          style={{ transform: `translateX(${-carouselIndex * 100}%)`, transitionTimingFunction: 'cubic-bezier(0.25,0.46,0.45,0.94)' }}
        >
          {images.map((src, i) => (
            <div key={i} className="relative h-[280px] w-full flex-shrink-0" style={{ background: party.gradient }}>
              <PartyPhoto src={src} alt={`${party.title} photo ${i + 1}`} gradient={party.gradient} sizes="100vw" priority={i === 0} />
            </div>
          ))}
        </div>
        <button
          onClick={() => setCarouselIndex((i) => Math.max(0, i - 1))}
          className="absolute left-3 top-1/2 z-[3] flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 text-white backdrop-blur-[8px]"
          style={{ background: 'rgba(0,0,0,0.4)' }}
        >
          <ChevronLeft size={13} strokeWidth={2.5} />
        </button>
        <button
          onClick={() => setCarouselIndex((i) => Math.min(2, i + 1))}
          className="absolute right-3 top-1/2 z-[3] flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 text-white backdrop-blur-[8px]"
          style={{ background: 'rgba(0,0,0,0.4)' }}
        >
          <ChevronRight size={13} strokeWidth={2.5} />
        </button>
        <div className="absolute bottom-3.5 left-1/2 z-[3] flex -translate-x-1/2 items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              onClick={() => setCarouselIndex(i)}
              className="h-[6px] cursor-pointer rounded-[3px] transition-all"
              style={{ width: carouselIndex === i ? 18 : 6, background: carouselIndex === i ? '#6D5A99' : 'rgba(255,255,255,0.28)' }}
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

      <div className="px-5 pb-2 pt-[22px]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h1 className="font-display text-[36px] leading-none tracking-[0.5px]" style={{ color: 'var(--c-text)' }}>
            {party.title}
          </h1>
          <div
            className="flex-shrink-0 rounded-xl border px-3.5 py-2 text-center"
            style={{ background: 'linear-gradient(135deg,rgba(109,90,153,0.2),rgba(168,86,112,0.12))', borderColor: 'rgba(109,90,153,0.35)' }}
          >
            <div className="font-heading text-base font-bold" style={{ color: '#A896C9' }}>{party.fee}</div>
            <div className="mt-px text-[10px]" style={{ color: 'var(--c-text-faint)' }}>entry</div>
          </div>
        </div>

        <div className="mb-5 flex flex-col gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg" style={{ background: 'rgba(109,90,153,0.1)' }}>
              <Calendar size={14} color="#6D5A99" strokeWidth={2.5} />
            </div>
            <div>
              <div className="text-[13px] font-semibold" style={{ color: 'var(--c-text)' }}>{party.date}</div>
              <div className="text-xs" style={{ color: 'var(--c-text-faint)' }}>{party.time}</div>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg" style={{ background: 'rgba(168,86,112,0.1)' }}>
              <MapPin size={14} color="#A85670" strokeWidth={2.5} />
            </div>
            <div>
              <div className="text-[13px] font-semibold" style={{ color: 'var(--c-text)' }}>{party.location}</div>
              <div className="text-xs" style={{ color: 'var(--c-text-faint)' }}>{party.address}</div>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg" style={{ background: 'rgba(182,151,99,0.12)' }}>
              <Users size={14} color="#B69763" strokeWidth={2.5} />
            </div>
            <div className="flex-1">
              <div className="mb-1.5 flex items-center justify-between">
                <div className="text-[13px] font-semibold" style={{ color: 'var(--c-text)' }}>
                  {party.spotsLeft} / {party.capacity} spots left
                </div>
                <div className="text-[11px]" style={{ color: spotsUrgent ? '#C48888' : 'var(--c-text-dim)', fontWeight: spotsUrgent ? 600 : 400 }}>
                  {spotsUrgent ? 'Almost full!' : ''}
                </div>
              </div>
              <div className="h-[5px] overflow-hidden rounded-full" style={{ background: 'var(--c-border2)' }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${capPct}%`,
                    background: `linear-gradient(90deg,${capPct > 80 ? '#B85C5C' : '#6D5A99'},${capPct > 80 ? '#C2954F' : '#A85670'})`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mb-6 flex gap-3">
          <Link
            href={`/checkout/${party.id}`}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl border-none py-4 font-heading text-[13px] font-bold tracking-[0.5px] text-white"
            style={{ background: 'linear-gradient(135deg,#6D5A99,#A85670)', boxShadow: '0 8px 24px rgba(109,90,153,0.3)' }}
          >
            <Ticket size={15} strokeWidth={2.5} />
            Get Tickets · {party.fee}
          </Link>
          <a
            href={`https://www.google.com/maps?q=${party.lat},${party.lng}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 whitespace-nowrap rounded-2xl border px-[18px] py-4 text-[13px] font-semibold"
            style={{ background: 'rgba(182,151,99,0.1)', borderColor: 'rgba(182,151,99,0.32)', color: '#D4BE94' }}
          >
            <NavigationIcon size={14} strokeWidth={2.5} />
            Directions
          </a>
        </div>

        <div className="mb-5 h-px" style={{ background: 'var(--c-border)' }} />

        <div className="mb-5">
          <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-[1.5px]" style={{ color: 'var(--c-text-muted)' }}>
            About this Event
          </h3>
          <p className="text-sm leading-[1.7]" style={{ color: 'var(--c-text-muted)' }}>{party.description}</p>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-2.5">
          {[
            { label: 'Age', value: party.ageRestriction },
            { label: 'Dress Code', value: party.dressCode },
            { label: 'Organizer', value: party.organizer },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border p-3" style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
              <div className="mb-[5px] text-[10px] uppercase tracking-[0.7px]" style={{ color: 'var(--c-text-faint)' }}>{item.label}</div>
              <div className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>{item.value}</div>
            </div>
          ))}
          <div className="rounded-xl border p-3" style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
            <div className="mb-[5px] text-[10px] uppercase tracking-[0.7px]" style={{ color: 'var(--c-text-faint)' }}>Distance</div>
            <div className="text-sm font-semibold" style={{ color: distanceColor(party.distance) }}>{party.distance} km away</div>
          </div>
        </div>

        <div className="mb-4 rounded-2xl border p-4" style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
          <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[1.5px]" style={{ color: 'var(--c-text-muted)' }}>
            Contact Organizer
          </h3>
          <div className="flex flex-wrap gap-2.5">
            <a
              href={`https://wa.me/${party.whatsapp.replace(/\D/g, '')}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-[10px] border px-3.5 py-2.5 text-[13px] font-medium"
              style={{ background: 'rgba(111,168,138,0.1)', borderColor: 'rgba(111,168,138,0.28)', color: '#8FBFA2' }}
            >
              <MessageCircle size={14} />
              WhatsApp
            </a>
            <a
              href={`https://instagram.com/${party.instagram.replace('@', '')}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-[10px] border px-3.5 py-2.5 text-[13px] font-medium"
              style={{ background: 'rgba(168,86,112,0.1)', borderColor: 'rgba(168,86,112,0.28)', color: '#C99AAE' }}
            >
              <Instagram size={14} strokeWidth={2} />
              {party.instagram}
            </a>
          </div>
        </div>

        <div className="mb-6 rounded-2xl border p-4" style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
          <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[1.5px]" style={{ color: 'var(--c-text-muted)' }}>
            Share this Event
          </h3>
          <div className="flex flex-wrap gap-2.5">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(party.title + ' on Lagos Live! ' + party.date + ' @ ' + party.location)}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-[10px] border px-3.5 py-2.5 text-[13px] font-medium"
              style={{ background: 'var(--c-glass)', borderColor: 'var(--c-border3)', color: 'var(--c-text-muted)' }}
            >
              <Share2 size={13} strokeWidth={2.5} />
              Share via WhatsApp
            </a>
            <button
              onClick={() => {
                try {
                  navigator.clipboard.writeText(`https://lagoslive.ng/party/${party.id}`);
                } catch {}
              }}
              className="flex items-center gap-1.5 rounded-[10px] border px-3.5 py-2.5 text-[13px] font-medium"
              style={{ background: 'var(--c-glass)', borderColor: 'var(--c-border3)', color: 'var(--c-text-muted)' }}
            >
              <LinkIcon size={13} strokeWidth={2.5} />
              Copy Link
            </button>
          </div>
        </div>

        {similarParties.length > 0 && (
          <div className="pb-2">
            <h3 className="mb-3.5 text-[11px] font-bold uppercase tracking-[1.5px]" style={{ color: 'var(--c-text-muted)' }}>
              You Might Also Like
            </h3>
            <div className="no-scrollbar flex gap-3.5 overflow-x-auto pb-1">
              {similarParties.map((sp2) => (
                <Link
                  key={sp2.id}
                  href={`/party/${sp2.id}`}
                  className="w-[195px] flex-shrink-0 overflow-hidden rounded-2xl border"
                  style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}
                >
                  <div className="relative h-[108px]" style={{ background: sp2.gradient }}>
                    <PartyPhoto src={partyPhoto(sp2.id)} alt={sp2.title} gradient={sp2.gradient} sizes="195px" />
                    <div className="pointer-events-none absolute inset-0 z-[1]" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent 60%)' }} />
                    <div className="absolute bottom-[7px] left-2 z-[2]">
                      <span className="rounded-full px-2 py-[3px] text-[11px] font-semibold" style={{ background: VCB[sp2.vibe], color: VCT[sp2.vibe] }}>
                        {sp2.vibe}
                      </span>
                    </div>
                  </div>
                  <div className="px-[11px] py-2.5">
                    <div className="mb-[3px] font-heading text-xs font-bold" style={{ color: 'var(--c-text)' }}>{sp2.title}</div>
                    <div className="mb-1.5 text-[11px]" style={{ color: 'var(--c-text-faint)' }}>{sp2.date}</div>
                    <div className="font-heading text-[13px] font-bold" style={{ color: '#A896C9' }}>{sp2.fee}</div>
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
