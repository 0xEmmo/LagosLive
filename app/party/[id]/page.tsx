'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { notFound } from 'next/navigation';
import {
  Heart,
  Bell,
  Calendar,
  MapPin,
  Users,
  Ticket,
  MessageCircle,
  Instagram,
  Phone,
  Mail,
  Share2,
  Link as LinkIcon,
  AlertTriangle,
  RefreshCw,
  Star,
  PenLine,
  ShieldCheck,
} from 'lucide-react';
import BackButton from '@/components/BackButton';
import PartyCard from '@/components/PartyCard';
import PartyPhoto from '@/components/PartyPhoto';
import GetThereMenu from '@/components/GetThereMenu';
import TicketTypePicker from '@/components/TicketTypePicker';
import { EventDetailSkeleton } from '@/components/ui/loaders-skeleton';
import { partyPhoto, VCB, VCT, distanceColor } from '@/lib/data';

const EventMap = dynamic(() => import('@/components/EventMap'), { ssr: false });
import { useParty } from '@/lib/hooks/useParty';
import { useParties } from '@/lib/hooks/useParties';
import { useLagosLiveStore } from '@/lib/store';
import { fetchEventReviews, fetchPartyHostVerified, fetchOrganizerReputation, fetchTicketTypes, type OrganizerReputation } from '@/lib/queries';
import { encodeCartItems, isTicketTypeSellable, MAX_QTY_PER_TYPE, type TicketCart } from '@/lib/tickets';
import type { Review, TicketType } from '@/lib/types';

export default function PartyDetailPage({ params }: { params: { id: string } }) {
  const { party, loading, error, retry } = useParty(Number(params.id));
  const { parties } = useParties();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [hostVerified, setHostVerified] = useState(false);
  const [reputation, setReputation] = useState<OrganizerReputation | null>(null);
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [ttLoading, setTtLoading] = useState(true);
  const [cart, setCart] = useState<TicketCart>({});

  useEffect(() => {
    if (!Number.isInteger(Number(params.id)) || Number(params.id) <= 0) return;
    let cancelled = false;
    setTtLoading(true);
    fetchTicketTypes(Number(params.id))
      .then((types) => !cancelled && setTicketTypes(types))
      .catch(() => !cancelled && setTicketTypes([]))
      .finally(() => !cancelled && setTtLoading(false));
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  useEffect(() => {
    if (!party || party.createdBy === null) return;
    let cancelled = false;
    fetchPartyHostVerified(party.id)
      .then((ok) => !cancelled && setHostVerified(ok))
      .catch(() => !cancelled && setHostVerified(false));
    return () => {
      cancelled = true;
    };
  }, [party]);

  useEffect(() => {
    if (!party || party.createdBy === null) return;
    let cancelled = false;
    fetchOrganizerReputation(party.createdBy)
      .then((rep) => !cancelled && setReputation(rep))
      .catch(() => !cancelled && setReputation(null));
    return () => {
      cancelled = true;
    };
  }, [party]);

  useEffect(() => {
    let cancelled = false;
    setReviewsLoading(true);
    fetchEventReviews(Number(params.id))
      .then((rows) => !cancelled && setReviews(rows))
      .catch((err) => console.error('[party] reviews load error', err))
      .finally(() => !cancelled && setReviewsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const saved = useLagosLiveStore((s) => (party ? s.savedParties.includes(party.id) : false));
  const reminded = useLagosLiveStore((s) => (party ? s.reminders.includes(party.id) : false));
  const user = useLagosLiveStore((s) => s.user);
  const toggleSave = useLagosLiveStore((s) => s.toggleSave);
  const toggleReminder = useLagosLiveStore((s) => s.toggleReminder);
  const showToast = useLagosLiveStore((s) => s.showToast);

  const handleSave = () => {
    const wasSaved = saved;
    toggleSave(party!.id);
    if (!user && !wasSaved) {
      showToast('Saved on this device', 'Create an account to keep it saved across devices.');
    }
  };

  if (loading) {
    return <EventDetailSkeleton />;
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

  const coverSrc = partyPhoto(party.id, party.coverUrl);
  const capPct = Math.min(100, Math.round(((party.capacity - party.spotsLeft) / party.capacity) * 100));
  const spotsUrgent = party.spotsLeft < 100;
  const soldOut = party.spotsLeft <= 0;
  // "More events": neutral, non-personalised related list — same vibe, upcoming
  // and not cancelled, so we never recommend a past or cancelled event.
  const now = Date.now();
  const similarParties = parties
    .filter(
      (p) =>
        p.id !== party.id &&
        p.vibe === party.vibe &&
        !p.cancelledAt &&
        new Date(p.startsAt).getTime() >= now
    )
    .slice(0, 4);

  const hasTicketTypes = ticketTypes.length > 0;
  const sellableTypes = hasTicketTypes ? ticketTypes.filter((t) => isTicketTypeSellable(t)) : [];
  const cartTickets = Object.values(cart).reduce((sum, q) => sum + q, 0);
  const checkoutHref = cartTickets > 0 ? `/checkout/${party.id}?items=${encodeCartItems(cart)}` : `/checkout/${party.id}`;

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
            onClick={handleSave}
            className="flex h-[38px] w-[38px] items-center justify-center rounded-[10px] transition-all duration-200 active:scale-90 glass glass-hover"
            style={{ color: saved ? '#FF2D95' : '#A7A8B5' }}
          >
            <Heart size={18} fill={saved ? '#FF2D95' : 'none'} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Event cover — one event, one cover image */}
      <div className="relative h-[320px] overflow-hidden" style={{ background: party.gradient }}>
        <PartyPhoto
          src={coverSrc}
          alt={`${party.title} cover`}
          gradient={party.gradient}
          sizes="100vw"
          priority
        />
        <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(7,7,11,0.6) 0%, transparent 50%)' }} />
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
              href={checkoutHref}
              className="btn-primary flex flex-1 items-center justify-center gap-2 py-4 text-[13px] font-bold tracking-[0.5px]"
            >
              <Ticket size={15} strokeWidth={2.5} />
              {!hasTicketTypes
                ? isFree
                  ? 'Get Free Entry'
                  : `Get Tickets · ${party.fee}`
                : cartTickets > 0
                ? cartTickets > 1
                  ? `Get Tickets (${cartTickets})`
                  : 'Get Tickets'
                : 'Choose Tickets'}
            </Link>
          )}
          <GetThereMenu party={party} />
        </div>

        {/* Tickets — per-tier steppers */}
        {hasTicketTypes && (
          <div className="mb-6">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-[1.5px]" style={{ color: '#A7A8B5' }}>Tickets</h3>
              {sellableTypes.length > 0 && (
                <span className="text-[11px]" style={{ color: '#6B6C80' }}>Up to {MAX_QTY_PER_TYPE} per tier</span>
              )}
            </div>
            {ttLoading ? (
              <div className="flex flex-col gap-2.5">
                <div className="h-[72px] animate-pulse rounded-2xl" style={{ background: 'rgba(255,255,255,0.04)' }} />
              </div>
            ) : sellableTypes.length === 0 ? (
              <div
                className="rounded-2xl px-4 py-3.5 text-[13px]"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#A7A8B5' }}
              >
                No tickets on sale right now, but you can still save this event.
              </div>
            ) : (
              <TicketTypePicker types={sellableTypes} cart={cart} onChange={setCart} />
            )}
          </div>
        )}

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
          {Number.isFinite(party.lat) && Number.isFinite(party.lng) && (
            <div className="overflow-hidden rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="h-[190px]">
                <EventMap parties={[party]} single />
              </div>
              <div className="flex items-center justify-between gap-2 px-3.5 py-2.5">
                <span className="truncate text-[11px]" style={{ color: '#6B6C80' }}>{party.address}</span>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${party.lat},${party.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-semibold"
                  style={{ background: 'rgba(0,245,212,0.08)', border: '1px solid rgba(0,245,212,0.25)', color: '#00F5D4' }}
                >
                  Directions
                </a>
              </div>
            </div>
          )}
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
          ].map((item) => (
            <div key={item.label} className="glass rounded-xl p-3.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <div className="mb-[5px] text-[10px] uppercase tracking-[0.7px]" style={{ color: '#6B6C80' }}>{item.label}</div>
              <div className="text-sm font-semibold" style={{ color: '#FFFFFF' }}>{item.value}</div>
            </div>
          ))}
          <div className="glass rounded-xl p-3.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <div className="mb-[5px] text-[10px] uppercase tracking-[0.7px]" style={{ color: '#6B6C80' }}>Organizer</div>
            <div className="flex items-center gap-1.5">
              <div className="text-sm font-semibold" style={{ color: '#FFFFFF' }}>{party.organizer}</div>
              {hostVerified && (
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.6px]" style={{ background: 'rgba(0,245,212,0.1)', border: '1px solid rgba(0,245,212,0.3)', color: '#00F5D4' }}>
                  <ShieldCheck size={10} strokeWidth={2.5} /> Verified
                </span>
              )}
            </div>
            {reputation && reputation.completedEvents > 0 && reputation.reviewCount > 0 && (
              <div className="mt-2 flex items-center gap-2.5">
                <span className="inline-flex items-center gap-0.5 text-[12px] font-bold" style={{ color: '#FFB347' }}>
                  <Star size={11} fill="#FFB347" strokeWidth={0} />
                  {reputation.avgRating.toFixed(1)}
                </span>
                <span className="text-[11px]" style={{ color: '#6B6C80' }}>{reputation.reviewCount} review{reputation.reviewCount === 1 ? '' : 's'}</span>
                <span className="h-3 w-px" style={{ background: 'rgba(255,255,255,0.12)' }} />
                <span className="text-[11px]" style={{ color: '#6B6C80' }}>
                  {reputation.completedEvents} event{reputation.completedEvents === 1 ? '' : 's'} · {reputation.ticketsSold.toLocaleString()} ticket{reputation.ticketsSold === 1 ? '' : 's'} sold
                </span>
              </div>
            )}
          </div>
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
            {party.whatsapp && (
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
            )}
            {party.instagram && (
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
            )}
            {party.organizerPhone && (
              <a
                href={`tel:${party.organizerPhone.replace(/[^+\d]/g, '')}`}
                className="flex items-center gap-1.5 rounded-[10px] px-3.5 py-2.5 text-[13px] font-medium transition-all duration-200"
                style={{ background: 'rgba(255,214,0,0.08)', border: '1px solid rgba(255,214,0,0.2)', color: '#FFD600' }}
              >
                <Phone size={14} strokeWidth={2} />
                {party.organizerPhone}
              </a>
            )}
            {party.organizerEmail && (
              <a
                href={`mailto:${party.organizerEmail}`}
                className="flex items-center gap-1.5 rounded-[10px] px-3.5 py-2.5 text-[13px] font-medium transition-all duration-200"
                style={{ background: 'rgba(176,106,255,0.08)', border: '1px solid rgba(176,106,255,0.2)', color: '#B06AFF' }}
              >
                <Mail size={14} strokeWidth={2} />
                {party.organizerEmail}
              </a>
            )}
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

        {/* Reviews */}
        <div className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[11px] font-bold uppercase tracking-[1.5px]" style={{ color: '#A7A8B5' }}>
              Reviews
            </h3>
            {party.avgRating > 0 && (
              <span className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: '#FFFFFF' }}>
                <Star size={14} strokeWidth={2} fill="#FFD600" color="#FFD600" />
                {party.avgRating.toFixed(1)}
                <span style={{ color: '#6B6C80', fontWeight: 400 }}>
                  ({party.reviewCount} {party.reviewCount === 1 ? 'review' : 'reviews'})
                </span>
              </span>
            )}
          </div>

          {new Date(party.startsAt).getTime() < Date.now() && !party.cancelledAt && (
            <Link
              href={`/review/${party.id}`}
              className="mb-3 flex items-center justify-center gap-2 rounded-[12px] py-3 text-[13px] font-bold transition-all duration-200 active:scale-[0.98]"
              style={{ background: 'rgba(255,214,0,0.08)', border: '1px solid rgba(255,214,0,0.25)', color: '#FFD600' }}
            >
              <PenLine size={14} strokeWidth={2} />
              {party.reviewCount > 0 ? 'Update your review' : 'Review this event'}
            </Link>
          )}

          {reviewsLoading ? (
            <div className="space-y-2.5">
              {[0, 1].map((i) => (
                <div key={i} className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="mb-2 h-3 w-24 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }} />
                  <div className="h-3 w-full rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }} />
                </div>
              ))}
            </div>
          ) : reviews.length === 0 ? (
            <div className="rounded-2xl px-4 py-6 text-center" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="text-[13px]" style={{ color: '#6B6C80' }}>
                No reviews yet. Be the first to tell everyone about the vibe.
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {reviews.map((r) => (
                <div key={r.id} className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-[13px] font-semibold" style={{ color: '#FFFFFF' }}>
                        {r.guestName}
                      </span>
                      <span
                        className="flex flex-shrink-0 items-center gap-0.5 rounded-full px-1.5 py-[2px] text-[9px] font-bold uppercase tracking-[0.5px]"
                        style={{ background: 'rgba(255,155,62,0.12)', border: '1px solid rgba(255,155,62,0.28)', color: '#FFB347' }}
                      >
                        <ShieldCheck size={8.5} strokeWidth={2.5} /> Verified attendee
                      </span>
                    </span>
                    <span className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          size={11}
                          strokeWidth={2}
                          fill={star <= r.rating ? '#FFD600' : 'none'}
                          color={star <= r.rating ? '#FFD600' : '#3A3A4D'}
                        />
                      ))}
                    </span>
                  </div>
                  {r.reviewText && (
                    <p className="text-[13px] leading-[1.6]" style={{ color: '#A7A8B5' }}>
                      {r.reviewText}
                    </p>
                  )}
                  <div className="mt-1.5 text-[10px]" style={{ color: '#6B6C80' }}>
                    {new Date(r.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {similarParties.length > 0 && (
          <div className="pb-2">
            <h3 className="mb-3.5 text-[11px] font-bold uppercase tracking-[1.5px]" style={{ color: '#A7A8B5' }}>
              More events
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
                    <PartyPhoto src={partyPhoto(sp2.id, sp2.coverUrl)} alt={sp2.title} gradient={sp2.gradient} sizes="195px" />
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
