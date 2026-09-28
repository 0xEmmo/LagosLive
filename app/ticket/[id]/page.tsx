'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import QRCode from 'react-qr-code';
import {
  ArrowLeft,
  Calendar,
  MapPin,
  ShieldCheck,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Hourglass,
  XCircle,
  Ban,
  Ticket,
  CheckCheck,
  Download,
} from 'lucide-react';
import BackButton from '@/components/BackButton';
import PartyPhoto from '@/components/PartyPhoto';
import { LogoMark, Wordmark } from '@/components/Logo';
import { partyPhoto } from '@/lib/data';
import { fetchTicketById } from '@/lib/queries';
import { formatNaira } from '@/lib/filters';
import { useLagosLiveStore } from '@/lib/store';
import type { CustomerTicket, OrderPaymentStatus } from '@/lib/types';
import { ticketState } from '@/lib/types';

function TicketStatusBadge({ status }: { status: OrderPaymentStatus }) {
  if (status === 'confirmed') {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.6px]"
        style={{ background: 'rgba(62,207,142,0.1)', border: '1px solid rgba(62,207,142,0.3)', color: '#3ECF8E' }}
      >
        <ShieldCheck size={12} strokeWidth={2.5} />
        Confirmed
      </span>
    );
  }
  const style =
    status === 'pending'
      ? { background: 'rgba(255,179,71,0.1)', border: '1px solid rgba(255,179,71,0.3)', color: '#FFB347' }
      : status === 'failed'
      ? { background: 'rgba(255,90,46,0.1)', border: '1px solid rgba(255,90,46,0.3)', color: '#FF5A2E' }
      : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)', color: '#A7A8B5' };
  const Icon = status === 'pending' ? Hourglass : status === 'failed' ? AlertTriangle : Ban;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.6px]"
      style={style}
    >
      <Icon size={12} strokeWidth={2.5} />
      {status}
    </span>
  );
}

function ticketSkin(ticketTypeName: string, eventGradient: string) {
  const name = ticketTypeName.toLowerCase();
  if (/\bvvip\b|\bsilver\b/.test(name)) {
    return { kind: 'silver', accent: '#D4D9E2', frame: 'linear-gradient(135deg,#F1F4F8,#8F9AA9 55%,#E5EAF0)' };
  }
  if (/\bvip\b|\bgold\b/.test(name)) {
    return { kind: 'gold', accent: '#FFD36A', frame: 'linear-gradient(135deg,#FFE9A8,#B77A19 55%,#F6CF73)' };
  }
  if (/early[\s-]?bird/.test(name)) {
    return { kind: 'early', accent: '#71E0BC', frame: 'linear-gradient(135deg,#71E0BC,#258D82 55%,#C1FFE9)' };
  }
  return { kind: 'regular', accent: '#FF8A68', frame: eventGradient };
}

function EarlyBirdMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none">
      <path d="M3 14.5c2.5-.2 4.6-1.5 6.1-3.5 1.4-1.8 2.5-4.5 4.1-5.1 1.2-.5 2.3.1 2.5 1.3l.2 1.2 3.6-1.1-1.9 3.2 3.3 1.1-4.4 1.1c-.5 2.4-2.3 4.3-4.8 5.1-2.7.9-5.8.2-8.7-1.1l2.5-.8L3 14.5Z" fill="currentColor" />
      <circle cx="15.1" cy="7.7" r=".55" fill="#10151B" />
    </svg>
  );
}

function NonConfirmedTicket({ ticket }: { ticket: CustomerTicket }) {
  const isPending = ticket.paymentStatus === 'pending';
  return (
    <div className="flex w-full max-w-[380px] flex-col items-center rounded-[24px] p-7 text-center animate-fade-in" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div
        className="flex h-16 w-16 items-center justify-center rounded-full"
        style={{ background: isPending ? 'rgba(255,179,71,0.08)' : 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)' }}
      >
        {isPending ? <Hourglass size={28} color="#FFB347" strokeWidth={2} /> : <XCircle size={28} color="#A7A8B5" strokeWidth={2} />}
      </div>
      <h1 className="font-display mt-5 text-[30px] tracking-[0.5px]" style={{ color: '#FFFFFF' }}>
        {isPending ? 'Awaiting Payment' : ticket.paymentStatus === 'failed' ? 'Payment Failed' : 'Ticket Cancelled'}
      </h1>
      <p className="mt-2 max-w-[280px] text-sm" style={{ color: '#A7A8B5' }}>
        {isPending
          ? 'This order is still awaiting payment. Complete checkout to receive your ticket.'
          : ticket.paymentStatus === 'failed'
          ? 'No ticket was issued for this order and no charge was made.'
          : 'This order was cancelled, so no valid ticket exists for it.'}
      </p>
      <div className="mt-6 flex w-full flex-col gap-2.5">
        <Link href="/" className="btn-primary flex items-center justify-center py-[15px] text-sm font-bold">
          Discover Events
        </Link>
        <Link href="/profile" className="w-full rounded-xl py-[15px] text-sm font-semibold glass glass-hover" style={{ color: '#A7A8B5' }}>
          My Tickets
        </Link>
        <Link href="/tickets" className="w-full rounded-xl py-[15px] text-sm font-semibold glass glass-hover" style={{ color: '#FFB347' }}>
          Find my ticket
        </Link>
      </div>
    </div>
  );
}

function CancelledTicket({ ticket }: { ticket: CustomerTicket }) {
  const user = useLagosLiveStore((s) => s.user);
  const { party } = ticket;
  const refunded = ticket.refundStatus === 'refunded' || !!ticket.refundedAt;
  const eventCancelled = !!party.cancelledAt;
  const title = eventCancelled ? 'Event Cancelled' : refunded ? 'Ticket Refunded' : 'Ticket Unavailable';
  const body = eventCancelled
    ? party.cancellationReason
      ? `The organiser cancelled this event: "${party.cancellationReason}"`
      : 'The organiser cancelled this event.'
    : refunded
    ? 'This ticket has been refunded, so it is no longer valid for entry.'
    : 'This ticket is unavailable for entry.';
  return (
    <div className="flex w-full max-w-[400px] flex-col items-center text-center animate-fade-in">
      <div className="rounded-[28px] p-[1.5px]" style={{ background: 'rgba(255,179,71,0.35)', border: '1px solid rgba(255,179,71,0.25)' }}>
        <div className="w-full overflow-hidden rounded-[26.5px]" style={{ background: '#161619' }}>
          <div className="relative" style={{ height: 150, background: party.gradient }}>
            <PartyPhoto src={partyPhoto(party.id, party.coverUrl)} alt={party.title} gradient={party.gradient} sizes="400px" />
            <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(to top, #161619 0%, transparent 60%)' }} />
            <div className="absolute bottom-3 left-4 right-4">
              <h1 className="font-heading truncate text-[21px] font-bold" style={{ color: '#FFFFFF' }}>{party.title}</h1>
            </div>
          </div>
          <div className="flex flex-col items-center px-6 pb-7 pt-5">
            <div className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: 'rgba(255,179,71,0.08)', border: '1px solid rgba(255,179,71,0.3)' }}>
              <Ban size={26} strokeWidth={1.5} color="#FFB347" />
            </div>
            <h2 className="font-display mt-4 text-[24px]" style={{ color: '#FFFFFF' }}>{title}</h2>
            <p className="mt-2 max-w-[300px] text-[13px]" style={{ color: '#A7A8B5' }}>{body}</p>
            {eventCancelled && (
              <div className="mt-5 w-full rounded-2xl p-4 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="text-[10px] font-bold uppercase tracking-[1px]" style={{ color: '#6B6C80' }}>Refund</div>
                <div className="mt-1 text-[15px] font-bold" style={{ color: refunded ? '#3ECF8E' : '#FFB347' }}>
                  {refunded ? `Refunded ${formatNaira(ticket.refundAmount)}` : ticket.refundStatus === 'processing' ? 'Refund in progress' : 'Refund to be issued'}
                </div>
              </div>
            )}
            <div className="mt-6 flex w-full flex-col gap-2.5">
              <Link href="/" className="btn-primary flex items-center justify-center py-[15px] text-sm font-bold">
                Discover Events
              </Link>
              {!user && (
                <Link href="/tickets" className="w-full rounded-xl py-[15px] text-sm font-semibold glass glass-hover" style={{ color: '#FFB347' }}>
                  Find my ticket
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfirmedTicket({
  ticket,
  holder,
  used,
}: {
  ticket: CustomerTicket;
  holder: string;
  used: boolean;
}) {
  const { party } = ticket;
  const skin = ticketSkin(ticket.ticketTypeName, party.gradient);
  return (
    <div id="ticket-print-area" className="ticket-print-area w-full max-w-[420px]">
      <div className="ticket-actions mb-4 flex flex-col items-center gap-2 text-center">
        <button
          type="button"
          onClick={() => window.print()}
          className="btn-primary inline-flex items-center gap-2 px-5 py-3 text-sm font-bold"
          aria-label="Download ticket as PDF or print"
        >
          <Download size={16} strokeWidth={2.5} />
          Download ticket
        </button>
        <p className="text-[11px]" style={{ color: '#A7A8B5' }}>Choose “Save as PDF” in your browser&apos;s print dialog.</p>
      </div>
      <div className="ticket-card w-full max-w-[380px] animate-fade-in">
      {/* Outer glow wrapper */}
      <div className="rounded-[28px] p-[1.5px]" style={{ background: skin.frame, boxShadow: `0 24px 80px rgba(0,0,0,0.55), 0 0 48px ${skin.accent}30` }}>
        <div className="overflow-hidden rounded-[26.5px]" style={{ background: '#161619' }}>
          {/* Event image header */}
          <div className="relative" style={{ height: 170, background: party.gradient }}>
            <PartyPhoto src={partyPhoto(party.id, party.coverUrl)} alt={party.title} gradient={party.gradient} sizes="380px" />
            <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(to top, #161619 0%, transparent 55%)' }} />
            <div className="absolute left-4 top-4 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-[8px]" style={{ background: 'rgba(7,7,11,0.55)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.12)' }}>
                <LogoMark size={28} />
              </div>
              <span className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[1.5px]" style={{ background: 'rgba(7,7,11,0.55)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.12)', color: '#FFFFFF' }}>
                Lagos Live
              </span>
            </div>
            <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between gap-3">
              <div className="min-w-0">
                <h1 className="font-heading truncate text-[22px] font-bold leading-tight" style={{ color: '#FFFFFF' }}>{party.title}</h1>
              </div>
              <TicketStatusBadge status="confirmed" />
            </div>
          </div>

          {/* Body */}
          <div className="px-5 pb-5 pt-4">
            <div className="mb-4 flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.5px]" style={{ background: `${skin.accent}20`, border: `1px solid ${skin.accent}70`, color: skin.accent }}>
                {ticket.ticketTypeName}
                {skin.kind === 'early' && <span className="ml-0.5 inline-flex" aria-label="Early bird"><EarlyBirdMark /></span>}
              </span>
              <span className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.5px]" style={{ background: 'rgba(255,179,71,0.14)', border: '1px solid rgba(255,179,71,0.3)', color: '#FFB347' }}>
                {ticket.quantity} {ticket.quantity === 1 ? 'ticket' : 'tickets'}
              </span>
            </div>

            <div className="mb-1 flex flex-col gap-2.5 text-[13px]">
              <div className="flex items-start gap-2.5">
                  <Calendar size={15} strokeWidth={2} className="mt-0.5 flex-shrink-0" style={{ color: skin.accent }} />
                <div>
                  <div style={{ color: '#FFFFFF' }}>{party.date}</div>
                  <div style={{ color: '#A7A8B5' }}>{party.time}</div>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <MapPin size={15} strokeWidth={2} className="mt-0.5 flex-shrink-0" style={{ color: '#3ECF8E' }} />
                <div>
                  <div style={{ color: '#FFFFFF' }}>{party.location}</div>
                  <div style={{ color: '#A7A8B5' }}>{party.address}</div>
                </div>
              </div>
            </div>

            {/* Perforation */}
            <div className="relative my-5">
              <div className="border-t border-dashed" style={{ borderColor: 'rgba(255,255,255,0.14)' }} />
              <div className="absolute -left-[21px] -top-[7px] h-[14px] w-[14px] rounded-full" style={{ background: '#0C0C0E' }} />
              <div className="absolute -right-[21px] -top-[7px] h-[14px] w-[14px] rounded-full" style={{ background: '#0C0C0E' }} />
            </div>

            {/* Holder */}
            <div className="mb-4 rounded-2xl px-3.5 py-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="text-[10px] uppercase tracking-[0.8px]" style={{ color: '#6B6C80' }}>Ticket holder</div>
              <div className="mt-0.5 truncate text-[13px] font-bold" style={{ color: '#FFFFFF' }}>{holder}</div>
            </div>

            {used && (
              <div className="mb-4 flex items-start gap-2.5 rounded-2xl px-3.5 py-3 text-[12.5px]" style={{ background: 'rgba(0,245,212,0.06)', border: '1px solid rgba(0,245,212,0.22)', color: '#00F5D4' }}>
                <CheckCheck size={15} strokeWidth={2.2} className="mt-0.5 flex-shrink-0" />
                <span>
                  {ticket.checkedInAt ? `This ticket was scanned at the gate on ${new Date(ticket.checkedInAt).toLocaleString()}.` : 'This ticket was used at the gate.'} It is no longer valid for entry.
                </span>
              </div>
            )}

            {/* Order + code */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-[0.8px]" style={{ color: '#6B6C80' }}>Ticket Code</div>
                <div className="font-heading text-[13px] font-bold" style={{ color: '#FFFFFF', wordBreak: 'break-all' }}>{ticket.orderRef}</div>
              </div>
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-[0.8px]" style={{ color: '#6B6C80' }}>Order Ref</div>
                <div className="font-heading text-[13px] font-bold" style={{ color: '#FFFFFF', wordBreak: 'break-all' }}>{ticket.orderRef}</div>
              </div>
            </div>

            {/* QR */}
            <div className="relative mt-5 rounded-2xl p-4 text-center" style={{ background: '#FFFFFF' }}>
              <QRCode value={ticket.orderRef} size={168} fgColor="#0B0B10" bgColor="transparent" style={{ width: '100%', maxWidth: 168, height: 'auto' }} aria-label={`Ticket code for ${ticket.orderRef}`} />
              {used && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="-rotate-12 rounded-xl border-4 px-3 py-1.5 text-xl font-black uppercase tracking-[3px] opacity-90" style={{ borderColor: '#FF5A2E', color: '#FF5A2E', background: 'rgba(255,255,255,0.72)' }}>
                    Used
                  </span>
                </div>
              )}
              <div className="mt-2 text-[11px] font-semibold uppercase tracking-[1px]" style={{ color: '#0B0B10' }}>
                {used ? 'Already scanned — not valid at the gate' : 'Show this at the entrance'}
              </div>
            </div>

            {/* Footer */}
            <div className="mt-5 flex items-center justify-between">
              <Wordmark size={14} />
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.8px]" style={{ color: '#6B6C80' }}>
                <ShieldCheck size={11} strokeWidth={2.5} />
                Verified entry
              </span>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

export default function TicketPage({ params }: { params: { id: string } }) {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const user = useLagosLiveStore((s) => s.user);
  const authLoading = useLagosLiveStore((s) => s.authLoading);
  const [ticket, setTicket] = useState<CustomerTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (authLoading) return;
    if (!token && !user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const load = async () => {
      try {
        // Guests prove ownership with the unguessable token from their ticket
        // link; signed-in buyers are resolved through RLS like before.
        if (token) {
          const res = await fetch('/api/tickets/lookup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: params.id, token }),
          });
          const json = (await res.json()) as { ticket?: CustomerTicket; error?: string };
          if (res.ok && json.ticket) {
            if (!cancelled) setTicket(json.ticket);
          } else if (res.status === 404) {
            if (!cancelled) setTicket(null);
          } else {
            if (!cancelled) setError(json.error ?? 'Could not load this ticket.');
          }
        } else if (user) {
          const data = await fetchTicketById(params.id, user.id);
          if (!cancelled) setTicket(data);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load this ticket.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [params.id, token, user, authLoading, attempt]);

  return (
    <div className="relative mx-auto flex min-h-screen max-w-[520px] flex-col animate-fade-in md:max-w-[900px]">
      <div
        className="sticky top-0 z-40 flex items-center gap-3 border-b px-5 py-3.5 backdrop-blur-[22px] backdrop-saturate-150"
        style={{ background: 'var(--c-header)', borderColor: 'rgba(255,255,255,0.04)' }}
      >
          <BackButton href={user ? '/profile' : '/tickets'} />
          <span className="font-heading text-[13px] font-bold uppercase tracking-[1px]" style={{ color: '#FFFFFF' }}>
          {user ? 'My Ticket' : 'Guest Ticket'}
        </span>
        {ticket && !loading && (
          <div className="ml-auto">
            <TicketStatusBadge status={ticket.paymentStatus} />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col items-center px-5 py-8">
        {authLoading ? (
          <div className="flex min-h-[55vh] items-center justify-center">
            <Loader2 size={28} strokeWidth={2} color="#FF5A2E" className="animate-spin" />
          </div>
        ) : !user && !token ? (
          <div className="flex w-full max-w-[380px] flex-col items-center gap-4 py-[72px] text-center">
            <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full" style={{ background: 'rgba(255,179,71,0.08)', border: '1px solid rgba(255,179,71,0.2)' }}>
              <Ticket size={32} strokeWidth={1.5} color="#FFB347" />
            </div>
            <h1 className="font-display text-[26px]" style={{ color: '#FFFFFF' }}>Open your guest ticket</h1>
            <p className="max-w-[290px] text-sm" style={{ color: '#A7A8B5' }}>This link is missing its secure access key. You can find the purchase with the email and order reference used at checkout.</p>
            <Link href="/tickets" className="btn-primary mt-2 px-7 py-3 text-sm font-semibold">Find my ticket</Link>
            <Link href="/login" className="text-sm font-semibold hover:underline" style={{ color: '#A7A8B5' }}>Sign in to an account instead</Link>
          </div>
        ) : loading ? (
          <div className="flex w-full max-w-[380px] flex-col gap-4 animate-pulse">
            <div className="h-[210px] rounded-[26px]" style={{ background: 'rgba(255,255,255,0.05)' }} />
            <div className="h-[52px] rounded-2xl" style={{ background: 'rgba(255,255,255,0.04)' }} />
            <div className="h-[52px] rounded-2xl" style={{ background: 'rgba(255,255,255,0.04)' }} />
            <div className="mx-auto flex h-[200px] w-[200px] items-center justify-center rounded-2xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <Loader2 size={28} strokeWidth={2} color="#FF5A2E" className="animate-spin" />
            </div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-4 py-[72px] text-center">
            <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full" style={{ background: 'rgba(255,90,46,0.08)', border: '1px solid rgba(255,90,46,0.18)' }}>
              <AlertTriangle size={32} strokeWidth={1.5} color="#FF5A2E" />
            </div>
            <div className="font-display text-[28px] tracking-[1px]" style={{ color: '#FFFFFF' }}>
              Couldn&apos;t load this ticket
            </div>
            <div className="max-w-[260px] text-sm" style={{ color: '#A7A8B5' }}>
              Something went wrong. Try again in a moment.
            </div>
            <button onClick={() => setAttempt((a) => a + 1)} className="btn-primary flex items-center gap-2 px-7 py-3 text-sm font-semibold">
              <RefreshCw size={14} strokeWidth={2.5} />
              Retry
            </button>
          </div>
        ) : !ticket ? (
          <div className="flex flex-col items-center gap-4 py-[72px] text-center">
            <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <Ticket size={32} strokeWidth={1.5} color="#A7A8B5" />
            </div>
            <div className="font-display text-[28px] tracking-[1px]" style={{ color: '#FFFFFF' }}>
              Ticket not found
            </div>
            <div className="max-w-[280px] text-sm" style={{ color: '#A7A8B5' }}>
              This ticket doesn&apos;t exist or the link isn&apos;t valid.
            </div>
            <Link href={user ? '/profile' : '/tickets'} className="btn-primary mt-2 px-7 py-3 text-sm font-semibold">
              {user ? 'My Tickets' : 'Find my ticket'}
            </Link>
            <Link href="/tickets" className="mt-3 text-sm font-semibold hover:underline" style={{ color: '#FFB347' }}>
              Find my ticket
            </Link>
          </div>
        ) : ticket.paymentStatus === 'confirmed' && (ticket.party.cancelledAt || ticket.refundStatus === 'refunded' || ticket.refundedAt) ? (
          <CancelledTicket ticket={ticket} />
        ) : ticket.paymentStatus === 'confirmed' ? (
          <ConfirmedTicket
            ticket={ticket}
            holder={user ? user.name || user.email : 'Guest entry'}
            used={ticketState(ticket) === 'USED'}
          />
        ) : (
          <NonConfirmedTicket ticket={ticket} />
        )}
      </div>
    </div>
  );
}
