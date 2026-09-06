'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Ticket, MapPin, QrCode, CalendarDays, Compass } from 'lucide-react';
import BackButton from '@/components/BackButton';
import GuestFind from '@/components/GuestFind';
import { useLagosLiveStore } from '@/lib/store';
import { fetchMyTickets } from '@/lib/queries';
import { partyPhoto } from '@/lib/data';
import { ticketState } from '@/lib/types';
import type { CustomerTicket, TicketState } from '@/lib/types';

// /tickets is dual-mode (Phase 5): signed-in users get "My Tickets" (their
// confirmed orders split into Upcoming / Past with a per-ticket state badge);
// guests keep the Find-my-ticket recovery form — the email + order reference
// lookup that can never be used to enumerate accounts.

const STATE_META: Record<TicketState, { label: string; color: string }> = {
  VALID: { label: 'Valid', color: '#3ECF8E' },
  USED: { label: 'Used', color: '#00F5D4' },
  CANCELLED: { label: 'Cancelled', color: '#FFB347' },
  REFUNDED: { label: 'Refunded', color: '#FF7F9C' },
};

function TicketCard({ ticket }: { ticket: CustomerTicket }) {
  const state = ticketState(ticket);
  const meta = STATE_META[state];
  return (
    <div
      className="overflow-hidden rounded-2xl"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <div className="flex gap-3.5 p-3.5">
        <div
          className="h-[86px] w-[86px] flex-shrink-0 overflow-hidden rounded-xl"
          style={{ background: ticket.party.gradient }}
        >
          {partyPhoto(ticket.partyId, ticket.party.coverUrl) && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={partyPhoto(ticket.partyId, ticket.party.coverUrl) ?? undefined}
              alt={ticket.party.title}
              className="h-full w-full object-cover"
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-heading text-sm font-bold" style={{ color: '#FFFFFF' }}>
                {ticket.party.title}
              </div>
              <div className="mt-0.5 text-[11.5px]" style={{ color: '#A7A8B5' }}>
                {ticket.party.date} · {ticket.party.time}
              </div>
              <div className="mt-0.5 flex items-center gap-1 truncate text-[11.5px]" style={{ color: '#6B6C80' }}>
                <MapPin size={11} className="flex-shrink-0" />
                <span className="truncate">{ticket.party.location}</span>
              </div>
            </div>
            <span
              className="flex-shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide"
              style={{ color: meta.color, background: `${meta.color}1A`, border: `1px solid ${meta.color}40` }}
            >
              {meta.label}
            </span>
          </div>
          <div className="mt-2.5 flex items-center justify-between text-[11.5px]" style={{ color: '#6B6C80' }}>
            <span>
              {ticket.quantity} × {ticket.ticketTypeName}
            </span>
            <span>REF {ticket.orderRef}</span>
          </div>
        </div>
      </div>
      <div className="flex border-t" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        <Link
          href={`/ticket/${ticket.id}`}
          className="flex flex-1 items-center justify-center gap-1.5 py-3 text-xs font-bold"
          style={{ color: '#FFB347' }}
        >
          <QrCode size={14} strokeWidth={2.2} />
          View Ticket
        </Link>
        <div className="my-1.5 w-px" style={{ background: 'rgba(255,255,255,0.08)' }} />
        <Link
          href={`/party/${ticket.partyId}`}
          className="flex flex-1 items-center justify-center gap-1.5 py-3 text-xs font-semibold"
          style={{ color: '#A7A8B5' }}
        >
          Event
        </Link>
      </div>
    </div>
  );
}

function EmptySection({ heading, sub, href, cta }: { heading: string; sub: string; href: string; cta: string }) {
  return (
    <div className="flex flex-col items-center px-5 py-16 text-center animate-fade-in">
      <div className="flex h-16 w-16 items-center justify-center rounded-full" style={{ background: 'rgba(255,179,71,0.08)', border: '1px solid rgba(255,179,71,0.28)' }}>
        <Compass size={28} strokeWidth={1.5} color="#FFB347" />
      </div>
      <h2 className="font-display mt-4 text-[24px] tracking-[0.5px]" style={{ color: '#FFFFFF' }}>{heading}</h2>
      <p className="mt-2 max-w-[280px] text-sm" style={{ color: '#A7A8B5' }}>{sub}</p>
      <Link href={href} className="btn-primary mt-6 py-[13px] px-6 text-sm font-bold">
        {cta}
      </Link>
    </div>
  );
}

function MyTickets() {
  const user = useLagosLiveStore((s) => s.user);
  const [tickets, setTickets] = useState<CustomerTicket[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!user) return;
    if (loadedUserId === user.id) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchMyTickets(user.id)
      .then((data) => {
        if (!cancelled) setTickets(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    setLoadedUserId(user.id);
    return () => {
      cancelled = true;
    };
  }, [user, loadedUserId, attempt]);

  if (!user) return null;

  if (loading && !tickets) {
    return (
      <div className="flex flex-col gap-4 px-5 py-8 animate-pulse">
        <div className="h-[148px] rounded-2xl" style={{ background: 'rgba(255,255,255,0.04)' }} />
        <div className="h-[148px] rounded-2xl" style={{ background: 'rgba(255,255,255,0.04)' }} />
      </div>
    );
  }

  if (error && !tickets) {
    return (
      <div className="flex flex-col items-center gap-3 px-5 py-20 text-center">
        <div className="text-sm" style={{ color: '#A7A8B5' }}>Couldn&apos;t load your tickets.</div>
        <button
          onClick={() => setAttempt((a) => a + 1)}
          className="rounded-xl px-5 py-2.5 text-sm font-semibold glass glass-hover"
          style={{ color: '#FFB347' }}
        >
          Try again
        </button>
      </div>
    );
  }

  const now = Date.now();
  const all = tickets ?? [];
  const upcoming = all
    .filter((t) => new Date(t.party.startsAt).getTime() >= now)
    .sort((a, b) => new Date(a.party.startsAt).getTime() - new Date(b.party.startsAt).getTime());
  const past = all
    .filter((t) => new Date(t.party.startsAt).getTime() < now)
    .sort((a, b) => new Date(b.party.startsAt).getTime() - new Date(a.party.startsAt).getTime());

  if (upcoming.length === 0 && past.length === 0) {
    return (
      <EmptySection
        heading="No tickets yet"
        sub="When you grab tickets they'll show up here — upcoming and past, with your live ticket ready to scan."
        href="/search"
        cta="Find an event"
      />
    );
  }

  return (
    <div className="px-5 py-6">
      {upcoming.length > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <CalendarDays size={15} strokeWidth={2} style={{ color: '#FFB347' }} />
            <h2 className="font-heading text-[13px] font-bold uppercase tracking-[1px]" style={{ color: '#FFFFFF' }}>
              Upcoming
            </h2>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: 'rgba(255,179,71,0.12)', color: '#FFB347' }}>
              {upcoming.length}
            </span>
          </div>
          <div className="flex flex-col gap-3.5">
            {upcoming.map((t) => (
              <TicketCard key={t.id} ticket={t} />
            ))}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Ticket size={15} strokeWidth={2} style={{ color: '#6B6C80' }} />
            <h2 className="font-heading text-[13px] font-bold uppercase tracking-[1px]" style={{ color: '#FFFFFF' }}>
              Past
            </h2>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: 'rgba(255,255,255,0.06)', color: '#6B6C80' }}>
              {past.length}
            </span>
          </div>
          <div className="flex flex-col gap-3.5">
            {past.map((t) => (
              <TicketCard key={t.id} ticket={t} />
            ))}
          </div>
        </section>
      )}

      <div className="mt-8 pb-6 text-center text-[12px]" style={{ color: '#6B6C80' }}>
        Bought as a guest?{' '}
        <Link href="/support" className="font-semibold hover:underline" style={{ color: '#FFB347' }}>
          Contact support
        </Link>{' '}
        for help.
      </div>
    </div>
  );
}

export default function TicketsPage() {
  const user = useLagosLiveStore((s) => s.user);
  const label = user ? 'My Tickets' : 'Find My Ticket';

  return (
    <div className="mx-auto flex min-h-screen max-w-[520px] flex-col animate-fade-in">
      <div
        className="sticky top-0 z-40 flex items-center gap-3 border-b px-5 py-3.5 backdrop-blur-[22px] backdrop-saturate-150"
        style={{ background: 'var(--c-header)', borderColor: 'rgba(255,255,255,0.04)' }}
      >
        <BackButton href={user ? '/profile' : '/profile'} />
        <span className="font-heading text-[13px] font-bold uppercase tracking-[1px]" style={{ color: '#FFFFFF' }}>
          {label}
        </span>
      </div>

      {user ? <MyTickets /> : <GuestFind />}
    </div>
  );
}