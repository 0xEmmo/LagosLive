'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
} from 'lucide-react';
import BackButton from '@/components/BackButton';
import PartyPhoto from '@/components/PartyPhoto';
import { LogoMark, Wordmark } from '@/components/Logo';
import { partyPhoto } from '@/lib/data';
import { fetchTicketById } from '@/lib/queries';
import { formatNaira } from '@/lib/filters';
import { useLagosLiveStore } from '@/lib/store';
import type { CustomerTicket, OrderPaymentStatus } from '@/lib/types';

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
  const { party } = ticket;
  const refunded = ticket.refundStatus === 'refunded';
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
            <h2 className="font-display mt-4 text-[24px]" style={{ color: '#FFFFFF' }}>Event Cancelled</h2>
            <p className="mt-2 max-w-[300px] text-[13px]" style={{ color: '#A7A8B5' }}>
              {party.cancellationReason
                ? `The organiser cancelled this event: "${party.cancellationReason}"`
                : 'The organiser cancelled this event.'}
            </p>
            <div className="mt-5 w-full rounded-2xl p-4 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="text-[10px] font-bold uppercase tracking-[1px]" style={{ color: '#6B6C80' }}>Refund</div>
              <div className="mt-1 text-[15px] font-bold" style={{ color: refunded ? '#3ECF8E' : '#FFB347' }}>
                {refunded ? `Refunded ${formatNaira(ticket.refundAmount)}` : ticket.refundStatus === 'processing' ? 'Refund in progress' : 'Refund to be issued'}
              </div>
            </div>
            <div className="mt-6 flex w-full flex-col gap-2.5">
              <Link href="/" className="btn-primary flex items-center justify-center py-[15px] text-sm font-bold">
                Discover Events
              </Link>
              <Link href="/tickets" className="w-full rounded-xl py-[15px] text-sm font-semibold glass glass-hover" style={{ color: '#FFB347' }}>
                Find my ticket
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfirmedTicket({ ticket }: { ticket: CustomerTicket }) {
  const { party } = ticket;
  return (
    <div className="w-full max-w-[380px] animate-fade-in">
      {/* Outer glow wrapper */}
      <div className="rounded-[28px] p-[1.5px]" style={{ background: 'linear-gradient(135deg, rgba(255,90,46,0.55), rgba(255,127,92,0.4), rgba(255,179,71,0.35))', boxShadow: '0 24px 80px rgba(0,0,0,0.55), 0 0 60px rgba(255,90,46,0.18)' }}>
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
              <span className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.5px]" style={{ background: 'rgba(255,90,46,0.14)', border: '1px solid rgba(255,90,46,0.3)', color: '#FF7F5C' }}>
                {ticket.ticketTypeName}
              </span>
              <span className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.5px]" style={{ background: 'rgba(255,179,71,0.14)', border: '1px solid rgba(255,179,71,0.3)', color: '#FFB347' }}>
                {ticket.quantity} {ticket.quantity === 1 ? 'ticket' : 'tickets'}
              </span>
            </div>

            <div className="mb-1 flex flex-col gap-2.5 text-[13px]">
              <div className="flex items-start gap-2.5">
                <Calendar size={15} strokeWidth={2} className="mt-0.5 flex-shrink-0" style={{ color: '#FF5A2E' }} />
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
            <div className="mt-5 rounded-2xl p-4 text-center" style={{ background: '#FFFFFF' }}>
              <QRCode value={ticket.orderRef} size={168} fgColor="#0B0B10" bgColor="transparent" style={{ width: '100%', maxWidth: 168, height: 'auto' }} aria-label={`Ticket code for ${ticket.orderRef}`} />
              <div className="mt-2 text-[11px] font-semibold uppercase tracking-[1px]" style={{ color: '#0B0B10' }}>
                Show this at the entrance
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
  );
}

export default function TicketPage({ params }: { params: { id: string } }) {
  const router = useRouter();
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
    if (!token && !user) router.replace('/login');
  }, [authLoading, token, user, router]);

  useEffect(() => {
    if (authLoading) return;
    if (!token && !user) return;
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

  if (!user && !token) return null;

  return (
    <div className="relative mx-auto flex min-h-screen max-w-[520px] flex-col animate-fade-in">
      <div
        className="sticky top-0 z-40 flex items-center gap-3 border-b px-5 py-3.5 backdrop-blur-[22px] backdrop-saturate-150"
        style={{ background: 'var(--c-header)', borderColor: 'rgba(255,255,255,0.04)' }}
      >
        <BackButton href="/profile" />
        <span className="font-heading text-[13px] font-bold uppercase tracking-[1px]" style={{ color: '#FFFFFF' }}>
          My Ticket
        </span>
        {ticket && !loading && (
          <div className="ml-auto">
            <TicketStatusBadge status={ticket.paymentStatus} />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col items-center px-5 py-8">
        {loading ? (
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
            <Link href="/profile" className="btn-primary mt-2 px-7 py-3 text-sm font-semibold">
              My Tickets
            </Link>
            <Link href="/tickets" className="mt-3 text-sm font-semibold hover:underline" style={{ color: '#FFB347' }}>
              Find my ticket
            </Link>
          </div>
        ) : ticket.paymentStatus === 'confirmed' && ticket.party.cancelledAt ? (
          <CancelledTicket ticket={ticket} />
        ) : ticket.paymentStatus === 'confirmed' ? (
          <ConfirmedTicket ticket={ticket} />
        ) : (
          <NonConfirmedTicket ticket={ticket} />
        )}
      </div>
    </div>
  );
}
