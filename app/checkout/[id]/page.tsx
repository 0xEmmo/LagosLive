'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { notFound } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Loader2, AlertTriangle, X, ShieldCheck } from 'lucide-react';
import confetti from 'canvas-confetti';
import { partyPhoto } from '@/lib/data';
import { useParty } from '@/lib/hooks/useParty';
import { useLagosLiveStore } from '@/lib/store';
import { fetchTicketTypes } from '@/lib/queries';
import { openPaystackInline } from '@/lib/paystack';
import PartyPhoto from '@/components/PartyPhoto';
import { formatNaira } from '@/lib/filters';
import type { TicketType } from '@/lib/types';

const MAX_QTY = 6;
const SERVICE_FEE_PER_TICKET = 500;

type Step = 'details' | 'success';
type PayState = 'idle' | 'starting' | 'paying' | 'verifying' | 'failed' | 'cancelled';

function Overlay({
  payState,
  error,
  onRetry,
  onBack,
}: {
  payState: Exclude<PayState, 'idle'>;
  error: string;
  onRetry: () => void;
  onBack: () => void;
}) {
  const busy = payState === 'starting' || payState === 'paying' || payState === 'verifying';

  const content = busy ? (
    <>
      <div
        className="flex h-16 w-16 items-center justify-center rounded-full"
        style={{ background: 'rgba(255,45,149,0.08)', border: '1px solid rgba(255,45,149,0.2)' }}
      >
        <Loader2 size={28} color="#FF2D95" strokeWidth={2.5} className="animate-spin" />
      </div>
      <div className="font-display mt-4 text-[26px] tracking-[0.5px]" style={{ color: '#FFFFFF' }}>
        {payState === 'starting' ? 'Preparing payment' : payState === 'paying' ? 'Complete your payment' : 'Confirming payment'}
      </div>
      <p className="mt-1 max-w-[280px] text-sm" style={{ color: '#A7A8B5' }}>
        {payState === 'starting'
          ? 'Setting up a secure payment session with Paystack…'
          : payState === 'paying'
          ? 'Finish in the Paystack window that just opened. Your tickets are reserved while you pay.'
          : 'Verifying your payment with Paystack. This usually takes a few seconds.'}
      </p>
    </>
  ) : (
    <>
      <div
        className="flex h-16 w-16 items-center justify-center rounded-full"
        style={{
          background: payState === 'failed' ? 'rgba(255,138,0,0.08)' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${payState === 'failed' ? 'rgba(255,138,0,0.2)' : 'rgba(255,255,255,0.1)'}`,
        }}
      >
        {payState === 'failed' ? (
          <AlertTriangle size={28} color="#FF8A00" strokeWidth={2} />
        ) : (
          <X size={28} color="#A7A8B5" strokeWidth={2} />
        )}
      </div>
      <div className="font-display mt-4 text-[26px] tracking-[0.5px]" style={{ color: '#FFFFFF' }}>
        {payState === 'failed' ? 'Payment Failed' : 'Payment Cancelled'}
      </div>
      <p className="mt-1 max-w-[300px] text-center text-sm" style={{ color: '#A7A8B5' }}>
        {error || (payState === 'failed' ? 'No charge was made. Please try again.' : 'You closed the payment window. No charge was made.')}
      </p>
      <div className="mt-6 flex w-full max-w-[300px] flex-col gap-2.5">
        <button onClick={onRetry} className="btn-primary w-full py-[15px] text-sm font-bold">
          Try Again
        </button>
        <button
          onClick={onBack}
          className="w-full rounded-xl py-[15px] text-sm font-semibold glass glass-hover"
          style={{ color: '#A7A8B5' }}
        >
          Back to Event
        </button>
      </div>
    </>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 backdrop-blur-[14px]" style={{ background: 'rgba(7,7,11,0.82)' }}>
      <div className="flex w-full max-w-[360px] flex-col items-center text-center animate-fade-in">{content}</div>
    </div>
  );
}

export default function CheckoutPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { party, loading } = useParty(Number(params.id));
  const user = useLagosLiveStore((s) => s.user);

  const [step, setStep] = useState<Step>('details');
  const [payState, setPayState] = useState<PayState>('idle');
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [ttLoading, setTtLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [qty, setQty] = useState(1);
  const [error, setError] = useState('');
  const [orderRef, setOrderRef] = useState('');
  const [orderId, setOrderId] = useState('');
  const [email, setEmail] = useState('');
  const [ticketToken, setTicketToken] = useState('');
  const [emailSent, setEmailSent] = useState<boolean | null>(null);

  useEffect(() => {
    if (user?.email) setEmail(user.email);
  }, [user?.email]);

  useEffect(() => {
    if (step !== 'success') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    confetti({
      particleCount: 90,
      spread: 70,
      startVelocity: 38,
      origin: { y: 0.35 },
      colors: ['#FF2D95', '#8A2BE2', '#00BFFF', '#00F5D4', '#FFD600'],
    });
  }, [step]);

  useEffect(() => {
    if (!party) return;
    let cancelled = false;
    setTtLoading(true);
    fetchTicketTypes(party.id)
      .then((types) => {
        if (cancelled) return;
        setTicketTypes(types);
        setSelectedId((current) => current ?? (types.length > 0 ? types[0].id : 0));
      })
      .catch(() => {
        if (cancelled) return;
        setTicketTypes([]);
        setSelectedId((current) => current ?? 0);
      })
      .finally(() => {
        if (!cancelled) setTtLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [party]);

  // Events without ticket types (the seeded ones) fall back to a single
  // "General Entry" option priced from the party's entry fee — never a mock.
  const options: TicketType[] =
    party && ticketTypes.length > 0
      ? ticketTypes
      : party
      ? [
          {
            id: 0,
            partyId: party.id,
            name: 'General Entry',
            price: party.feeNum,
            quantity: party.capacity,
            sold: party.capacity - party.spotsLeft,
          },
        ]
      : [];

  const selected = options.find((o) => o.id === selectedId) ?? options[0];
  const remaining = selected
    ? ticketTypes.length > 0
      ? selected.quantity - selected.sold
      : party
      ? party.spotsLeft
      : 0
    : 0;

  useEffect(() => {
    setQty((q) => Math.min(q, Math.max(1, Math.min(MAX_QTY, remaining))));
  }, [remaining]);

  if (!party) {
    if (loading) return null;
    notFound();
  }

  const unitPrice = selected.price;
  const soldOut = remaining <= 0;
  const isFree = unitPrice === 0;
  const isGuest = !user;
  const serviceFee = unitPrice > 0 ? SERVICE_FEE_PER_TICKET * qty : 0;
  const subtotal = unitPrice * qty;
  const total = subtotal + serviceFee;

  const back = () => {
    if (step === 'success') {
      router.push('/');
    } else {
      router.push(`/party/${party.id}`);
    }
  };

  const verifyPayment = async (reference: string, oid: string) => {
    setPayState('verifying');
    try {
      const res = await fetch('/api/paystack/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference, orderId: oid, token: ticketToken || undefined }),
      });
      const data = (await res.json()) as { status?: string; error?: string; emailSent?: boolean };
      if (data.status === 'confirmed') {
        setEmailSent(data.emailSent ?? true);
        setStep('success');
        setPayState('idle');
      } else {
        setPayState('failed');
        setError(data.error ?? 'Payment could not be confirmed. No charge was made.');
      }
    } catch {
      setPayState('failed');
      setError('Could not confirm your payment. Please try again.');
    }
  };

  const cancelPayment = (oid: string) => {
    fetch('/api/paystack/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: oid, token: ticketToken || undefined }),
    }).catch(() => {});
    setPayState('cancelled');
  };

  const startPayment = async () => {
    if (soldOut || !selected) return;
    setError('');
    if (isGuest) {
      const trimmed = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
        setError('Enter a valid email to receive your ticket.');
        return;
      }
      setEmail(trimmed);
    }
    setPayState('starting');
    try {
      const res = await fetch('/api/paystack/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partyId: party.id,
          ticketTypeId: selected.id || null,
          quantity: qty,
          email: email.trim().toLowerCase() || undefined,
        }),
      });
      const data = (await res.json()) as {
        free?: boolean;
        reference?: string;
        orderId?: string;
        amountKobo?: number;
        ticketAccessToken?: string;
        emailSent?: boolean;
        error?: string;
      };
      if (!res.ok || !data.reference || !data.orderId) {
        setPayState('idle');
        setError(data.error ?? 'Something went wrong. Please try again.');
        return;
      }
      setOrderRef(data.reference);
      setOrderId(data.orderId ?? '');
      setTicketToken(data.ticketAccessToken ?? '');
      setEmailSent(data.emailSent ?? null);
      if (data.free) {
        setStep('success');
        setPayState('idle');
        return;
      }
      setPayState('paying');
      await openPaystackInline({
        email: email.trim().toLowerCase(),
        amountKobo: data.amountKobo ?? 0,
        reference: data.reference,
        callback: () => verifyPayment(data.reference!, data.orderId!),
        onClose: () => cancelPayment(data.orderId!),
      });
    } catch (err) {
      setPayState('idle');
      setError(err instanceof Error ? err.message : 'Payment could not be started. Please try again.');
    }
  };

  const headerLabel = step === 'success' ? 'Confirmed' : 'Checkout';
  const ctaLabel = payState === 'starting' ? 'Preparing…' : isFree ? 'Confirm RSVP' : 'Continue to Payment';
  const ticketHref = orderId ? (ticketToken ? `/ticket/${orderId}?token=${ticketToken}` : `/ticket/${orderId}`) : '/profile';

  return (
    <div className="mx-auto flex min-h-screen max-w-[520px] flex-col animate-fade-in">
      <div
        className="sticky top-0 z-40 flex items-center gap-2.5 border-b px-5 py-4 backdrop-blur-[22px] backdrop-saturate-150"
        style={{ background: 'var(--c-header)', borderColor: 'rgba(255,255,255,0.04)' }}
      >
        <button
          onClick={back}
          className="flex h-9 w-9 items-center justify-center rounded-[10px] glass glass-hover"
          style={{ color: '#A7A8B5' }}
        >
          <ArrowLeft size={13} strokeWidth={2.5} />
        </button>
        <span className="font-heading text-[13px] font-bold uppercase tracking-[1px]" style={{ color: '#FFFFFF' }}>
          {headerLabel}
        </span>
        <div
          className="ml-auto flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
          style={{ background: 'rgba(0,245,212,0.08)', border: '1px solid rgba(0,245,212,0.2)', color: '#00F5D4' }}
        >
          <ShieldCheck size={12} strokeWidth={2.5} />
          Secure
        </div>
      </div>

      {step === 'details' && (
        <div className="flex flex-1 flex-col p-5">
          <div
            className="mb-[22px] flex gap-3 rounded-2xl p-3"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-[10px]" style={{ background: party.gradient }}>
              <PartyPhoto src={partyPhoto(party.id)} alt={party.title} gradient={party.gradient} sizes="64px" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 truncate font-heading text-sm font-bold" style={{ color: '#FFFFFF' }}>{party.title}</div>
              <div className="text-xs" style={{ color: '#A7A8B5' }}>{party.date} · {party.time}</div>
              <div className="text-xs" style={{ color: '#A7A8B5' }}>{party.location}</div>
            </div>
          </div>

          <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[1.3px]" style={{ color: '#A7A8B5' }}>
            Select Ticket Type
          </div>

          {ttLoading ? (
            <div className="mb-6 flex flex-col gap-2.5">
              <div className="h-[72px] animate-pulse rounded-2xl" style={{ background: 'rgba(255,255,255,0.04)' }} />
            </div>
          ) : (
            <div className="mb-6 flex flex-col gap-2.5">
              {options.map((opt) => {
                const optRemaining = ticketTypes.length > 0 ? opt.quantity - opt.sold : party.spotsLeft;
                const optSoldOut = optRemaining <= 0;
                const active = selected.id === opt.id && !optSoldOut;
                return (
                  <button
                    key={opt.id}
                    disabled={optSoldOut}
                    onClick={() => setSelectedId(opt.id)}
                    className="flex cursor-pointer items-center justify-between rounded-2xl px-4 py-3.5 text-left transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                    style={{
                      background: active ? 'rgba(255,45,149,0.08)' : 'rgba(255,255,255,0.03)',
                      border: '1px solid',
                      borderColor: active ? 'rgba(255,45,149,0.25)' : 'rgba(255,255,255,0.08)',
                    }}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold" style={{ color: '#FFFFFF' }}>{opt.name}</div>
                      <div className="mt-0.5 text-xs" style={{ color: optSoldOut ? '#FF8A00' : '#A7A8B5' }}>
                        {optSoldOut ? 'Sold out' : `${optRemaining} left`}
                      </div>
                    </div>
                    <div className="font-heading text-[15px] font-bold gradient-text">
                      {opt.price === 0 ? 'Free' : formatNaira(opt.price)}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[1.3px]" style={{ color: '#A7A8B5' }}>
            Quantity
          </div>
          <div className="mb-6 flex items-center gap-[18px]">
            <button
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              disabled={soldOut}
              className="h-[38px] w-[38px] rounded-[10px] text-lg transition-all duration-200 active:scale-90 glass glass-hover disabled:opacity-40"
              style={{ color: '#FFFFFF' }}
            >
              −
            </button>
            <span className="font-display min-w-[24px] text-center text-2xl" style={{ color: '#FFFFFF' }}>{qty}</span>
            <button
              onClick={() => setQty((q) => Math.min(MAX_QTY, Math.min(remaining, q + 1)))}
              disabled={soldOut || qty >= remaining || qty >= MAX_QTY}
              className="h-[38px] w-[38px] rounded-[10px] text-lg transition-all duration-200 active:scale-90 glass glass-hover disabled:opacity-40"
              style={{ color: '#FFFFFF' }}
            >
              +
            </button>
          </div>

          <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[1.3px]" style={{ color: '#A7A8B5' }}>
            Email
          </div>
          <div className="mb-6">
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={!isGuest}
              placeholder="you@example.com"
              className="w-full rounded-2xl px-4 py-3.5 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFFFFF' }}
            />
            <div className="mt-2 text-xs" style={{ color: '#6B6C80' }}>
              {isGuest ? 'Your ticket will be sent to this email.' : `Your ticket will be sent to ${user.email}.`}
            </div>
          </div>

          <div className="mb-auto rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="mb-2 flex justify-between text-[13px]" style={{ color: '#A7A8B5' }}>
              <span>Subtotal ({selected.name} × {qty})</span>
              <span>{formatNaira(subtotal)}</span>
            </div>
            {!isFree && (
              <div className="mb-2 flex justify-between text-[13px]" style={{ color: '#A7A8B5' }}>
                <span>Service Fee</span>
                <span>{formatNaira(serviceFee)}</span>
              </div>
            )}
            <div className="my-2 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
            <div className="flex justify-between font-heading text-[15px] font-bold" style={{ color: '#FFFFFF' }}>
              <span>Total</span>
              <span>{isFree ? 'Free' : formatNaira(total)}</span>
            </div>
          </div>

          {error && (
            <div className="mt-4 animate-fade-in rounded-[10px] px-3.5 py-2.5 text-[13px]" style={{ background: 'rgba(255,138,0,0.08)', border: '1px solid rgba(255,138,0,0.2)', color: '#FF8A00' }}>
              {error}
            </div>
          )}

          <button
            onClick={startPayment}
            disabled={payState !== 'idle' || soldOut || ttLoading}
            className="btn-primary mt-5 w-full py-[15px] text-sm font-bold disabled:opacity-60"
          >
            {soldOut ? 'Sold Out' : ctaLabel}
          </button>
        </div>
      )}

      {step === 'success' && (
        <div className="flex flex-1 flex-col items-center p-5 text-center">
          <div
            className="my-5 flex h-16 w-16 items-center justify-center rounded-full"
            style={{ background: 'rgba(0,245,212,0.08)', border: '1px solid rgba(0,245,212,0.2)' }}
          >
            <CheckCircle2 size={28} color="#00F5D4" strokeWidth={2.5} />
          </div>
          <h1 className="font-display mb-1.5 text-[34px] tracking-[0.5px]" style={{ color: '#FFFFFF' }}>
            {isFree ? "You're On The List!" : "You're In!"}
          </h1>
          <p className="mb-[26px] max-w-[320px] text-sm" style={{ color: '#A7A8B5' }}>
            {isGuest
              ? emailSent === false
                ? "We couldn't email your ticket — use the link below to open it."
                : `Your ticket is on its way to ${email}.`
              : isFree
              ? 'Your RSVP is confirmed. See you there.'
              : 'Your payment was successful. Your ticket is confirmed.'}
          </p>

          {isGuest && emailSent === false && (
            <div
              className="mb-4 flex w-full max-w-[340px] items-start gap-2.5 rounded-[10px] px-3.5 py-3 text-left text-[13px]"
              style={{ background: 'rgba(255,138,0,0.08)', border: '1px solid rgba(255,138,0,0.2)', color: '#FF8A00' }}
            >
              <AlertTriangle size={16} strokeWidth={2} className="mt-0.5 flex-shrink-0" />
              <span>Email delivery failed. Save this link — it&apos;s the only way to reach your ticket.</span>
            </div>
          )}

          <div className="w-full max-w-[340px] overflow-hidden rounded-2xl text-left" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="p-[18px]">
              <div className="mb-1 font-heading text-sm font-bold" style={{ color: '#FFFFFF' }}>{party.title}</div>
              <div className="mb-0.5 text-xs" style={{ color: '#A7A8B5' }}>{party.date} · {party.time}</div>
              <div className="text-xs" style={{ color: '#A7A8B5' }}>{party.location}</div>
            </div>
            <div className="flex items-center justify-between border-t border-dashed px-[18px] py-4" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
              <div className="flex flex-col gap-1.5">
                <div>
                  <div className="mb-[3px] text-[10px] uppercase tracking-[0.7px]" style={{ color: '#6B6C80' }}>Order Ref</div>
                  <div className="font-heading text-sm font-bold gradient-text">{orderRef}</div>
                </div>
                <div>
                  <div className="mb-[3px] text-[10px] uppercase tracking-[0.7px]" style={{ color: '#6B6C80' }}>Ticket Code</div>
                  <div className="font-heading text-sm font-bold" style={{ color: '#FFFFFF' }}>{orderRef}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="mb-[3px] text-[10px] uppercase tracking-[0.7px]" style={{ color: '#6B6C80' }}>
                  {selected.name} × {qty}
                </div>
                <div className="font-heading text-sm font-bold" style={{ color: '#FFFFFF' }}>{isFree ? 'Free' : formatNaira(total)}</div>
              </div>
            </div>
          </div>

          <div className="mt-7 flex w-full max-w-[340px] flex-col gap-2.5">
            <button
              onClick={() => router.push(ticketHref)}
              className="btn-primary w-full py-[15px] text-sm font-bold"
            >
              View My Ticket
            </button>
            <button
              onClick={() => router.push(`/party/${party.id}`)}
              className="w-full rounded-xl py-[15px] text-sm font-semibold glass glass-hover"
              style={{ color: '#A7A8B5' }}
            >
              Done
            </button>
          </div>
        </div>
      )}

      {payState !== 'idle' && (
        <Overlay
          payState={payState}
          error={error}
          onRetry={() => setPayState('idle')}
          onBack={() => router.push(`/party/${party.id}`)}
        />
      )}
    </div>
  );
}
