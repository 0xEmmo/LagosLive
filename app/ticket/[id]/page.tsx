'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import QRCode from 'react-qr-code';
import {
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
  const stubBackground =
    skin.kind === 'gold'
      ? 'linear-gradient(145deg, #FFE9A8 0%, #F4C65E 52%, #C58A2A 100%)'
      : skin.kind === 'silver'
      ? 'linear-gradient(145deg, #F4F6FA 0%, #D0D7E0 55%, #AAB4C0 100%)'
      : skin.kind === 'early'
      ? 'linear-gradient(145deg, #A7FFE5 0%, #56E2C4 100%)'
      : 'linear-gradient(145deg, #8AFFFF 0%, #45DCE9 100%)';
  return (
    <div id="ticket-print-area" className="ticket-print-area w-full max-w-[760px]">
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
      <div className="ticket-card boarding-pass-card w-full animate-fade-in">
        <div className="overflow-hidden rounded-[26px] border border-cyan-200/25 bg-[#09152d] shadow-[0_28px_90px_rgba(0,0,0,0.52)]">
          <div className="boarding-pass-top">
            <section className="boarding-pass-main relative min-w-0 overflow-hidden px-5 py-5 text-white sm:px-7 sm:py-6">
              <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full border border-cyan-200/10" />
              <div className="pointer-events-none absolute -right-8 -top-12 h-40 w-40 rounded-full border border-cyan-200/10" />
              <div className="relative z-10 flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-100/20 bg-white/5">
                    <LogoMark size={28} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[12px] font-black uppercase tracking-[0.18em] text-cyan-100">Lagos Live</div>
                    <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-cyan-100/55">Event boarding pass</div>
                  </div>
                </div>
                <TicketStatusBadge status="confirmed" />
              </div>

              <div className="relative z-10 mt-6">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200/70">Admit to</div>
                <h1 className="mt-1 line-clamp-2 font-heading text-[25px] font-black leading-[1.03] tracking-[0.015em] text-white sm:text-[36px]">
                  {party.title}
                </h1>
              </div>

              <div className="boarding-pass-route relative z-10 mt-5">
                <div className="min-w-0">
                  <div className="text-[9px] font-bold uppercase tracking-[0.19em] text-cyan-100/60">From</div>
                  <div className="mt-0.5 truncate font-heading text-[20px] font-bold uppercase tracking-[0.04em] text-cyan-200 sm:text-[25px]">Lagos</div>
                  <div className="text-[9px] text-cyan-100/60">Lagos Live</div>
                </div>
                <span aria-hidden="true" className="px-2 text-[27px] font-light text-cyan-300">→</span>
                <div className="min-w-0">
                  <div className="text-[9px] font-bold uppercase tracking-[0.19em] text-cyan-100/60">To · venue</div>
                  <div className="mt-0.5 truncate font-heading text-[20px] font-bold uppercase tracking-[0.04em] text-cyan-200 sm:text-[25px]">{party.location}</div>
                  <div className="truncate text-[9px] text-cyan-100/60">{party.address}</div>
                </div>
              </div>

              <div className="boarding-pass-meta relative z-10 mt-5 border-t border-cyan-100/20 pt-3.5">
                <div>
                  <div className="text-[8px] font-bold uppercase tracking-[0.18em] text-cyan-100/55">Date</div>
                  <div className="mt-1 text-[11px] font-bold text-white sm:text-[12px]">{party.date}</div>
                </div>
                <div>
                  <div className="text-[8px] font-bold uppercase tracking-[0.18em] text-cyan-100/55">Time</div>
                  <div className="mt-1 text-[11px] font-bold text-white sm:text-[12px]">{party.time}</div>
                </div>
                <div className="boarding-pass-holder">
                  <div className="text-[8px] font-bold uppercase tracking-[0.18em] text-cyan-100/55">Passenger</div>
                  <div className="mt-1 truncate text-[11px] font-bold text-white sm:text-[12px]">{holder}</div>
                </div>
              </div>
            </section>

            <aside className="boarding-pass-stub relative flex min-w-0 flex-col items-center justify-between gap-3 px-3.5 py-4 text-center sm:px-4 sm:py-5" style={{ background: stubBackground, color: '#07152C' }}>
              <div className="w-full">
                <div className="text-[8px] font-black uppercase tracking-[0.18em] opacity-70">Boarding pass</div>
                <div className="mt-3 inline-flex max-w-full items-center justify-center gap-1.5 rounded-md border border-black/10 bg-white/30 px-2.5 py-1.5 text-center font-heading text-[12px] font-black uppercase leading-tight tracking-[0.08em] sm:text-[14px]">
                  <span className="line-clamp-2">{ticket.ticketTypeName}</span>
                  {skin.kind === 'early' && <span className="shrink-0" aria-label="Early bird"><EarlyBirdMark /></span>}
                </div>
              </div>

              <div className="relative w-full max-w-[132px] rounded-lg bg-white p-2 shadow-md">
                <QRCode
                  value={ticket.orderRef}
                  size={128}
                  fgColor="#07152C"
                  bgColor="#FFFFFF"
                  style={{ display: 'block', width: '100%', height: 'auto' }}
                  aria-label={`Ticket code for ${ticket.orderRef}`}
                />
                {used && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-white/70">
                    <span className="-rotate-12 rounded-md border-2 px-2 py-1 text-sm font-black uppercase tracking-[0.15em]" style={{ borderColor: '#C83745', color: '#C83745' }}>Used</span>
                  </div>
                )}
              </div>

              <div className="w-full">
                <div className="text-[8px] font-black uppercase tracking-[0.17em] opacity-70">Pass code</div>
                <div className="mt-1 break-all font-mono text-[9px] font-bold tracking-[0.06em]">{ticket.orderRef}</div>
                <div className="mt-2 text-[9px] font-black uppercase tracking-[0.18em]">Admit · {ticket.quantity}</div>
                <div className="mt-1 text-[8px] font-semibold uppercase tracking-[0.12em] opacity-75">{used ? 'Already scanned' : 'Scan at the gate'}</div>
              </div>
            </aside>
          </div>

          <div className="boarding-pass-reverse border-t border-dashed border-cyan-100/40">
            <aside className="boarding-pass-reverse-stub flex flex-col items-center justify-between border-r border-dashed border-cyan-100/30 bg-[#0d1e3a] px-3 py-4 text-center text-cyan-100">
              <Wordmark size={14} />
              <div className="boarding-pass-vertical-label text-[9px] font-black uppercase tracking-[0.2em]">Keep this pass</div>
              <div className="text-[8px] font-semibold uppercase tracking-[0.13em] text-cyan-100/60">Verified entry</div>
            </aside>
            <section className="boarding-pass-banner relative flex min-h-[178px] items-end overflow-hidden px-5 py-5 sm:min-h-[210px] sm:px-8 sm:py-7">
              <div className="absolute inset-0" style={{ background: party.gradient }}>
                <PartyPhoto src={partyPhoto(party.id, party.coverUrl)} alt={party.title} gradient={party.gradient} sizes="(max-width: 600px) 75vw, 600px" tone="editorial" priority />
              </div>
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#08152d]/95 via-[#08152d]/65 to-[#08152d]/10" />
              <div className="relative z-10 max-w-[92%]">
                <div className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan-200">Your night starts here</div>
                <h2 className="mt-1 font-heading text-[32px] font-black uppercase leading-[0.98] tracking-[0.025em] text-cyan-300 sm:text-[46px]">See you there!</h2>
                <div className="mt-2 line-clamp-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/90">{party.title}</div>
              </div>
            </section>
          </div>

          {used && (
            <div className="flex items-center gap-2 border-t border-white/10 bg-[#101f3b] px-4 py-3 text-[11px] font-semibold text-cyan-100 sm:px-6">
              <CheckCheck size={15} strokeWidth={2.2} className="shrink-0 text-cyan-300" />
              <span>{ticket.checkedInAt ? `Scanned at the gate on ${new Date(ticket.checkedInAt).toLocaleString()}.` : 'This ticket has already been scanned at the gate.'} It is no longer valid for entry.</span>
            </div>
          )}
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
