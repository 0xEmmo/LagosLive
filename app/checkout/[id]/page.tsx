'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Loader2, AlertTriangle, X, ShieldCheck } from 'lucide-react';
import confetti from 'canvas-confetti';
import { partyPhoto } from '@/lib/data';
import { useParty } from '@/lib/hooks/useParty';
import { useLagosLiveStore } from '@/lib/store';
import { fetchTicketTypes } from '@/lib/queries';
import { openPaystackInline } from '@/lib/paystack';
import PartyPhoto from '@/components/PartyPhoto';
import TicketTypePicker from '@/components/TicketTypePicker';
import { CheckoutSkeleton } from '@/components/ui/loaders-skeleton';
import { formatNaira } from '@/lib/filters';
import {
  cartDiscount,
  computeCart,
  isTicketTypeSellable,
  lineDiscount,
  MAX_QTY_PER_TYPE,
  parseItemsParam,
  remainingOf,
  SERVICE_FEE_PER_TICKET,
  type TicketCart,
} from '@/lib/tickets';
import type { TicketType } from '@/lib/types';

type Step = 'details' | 'success';
type PayState = 'idle' | 'starting' | 'paying' | 'verifying' | 'failed' | 'cancelled';

interface LineTicket {
  orderId: string;
  orderRef: string;
  ticketAccessToken: string | null;
}

interface SuccessLine {
  name: string;
  qty: number;
  total: number;
}

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
        style={{ background: 'rgba(255,90,46,0.08)', border: '1px solid rgba(255,90,46,0.25)' }}
      >
        <Loader2 size={28} color="#FF5A2E" strokeWidth={2.5} className="animate-spin" />
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
          background: payState === 'failed' ? 'rgba(255,90,46,0.08)' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${payState === 'failed' ? 'rgba(255,90,46,0.25)' : 'rgba(255,255,255,0.1)'}`,
        }}
      >
        {payState === 'failed' ? (
          <AlertTriangle size={28} color="#FF5A2E" strokeWidth={2} />
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
  const searchParams = useSearchParams();
  const partyId = Number(params.id);
  const { party, loading } = useParty(partyId);
  const user = useLagosLiveStore((s) => s.user);

  const [step, setStep] = useState<Step>('details');
  const [payState, setPayState] = useState<PayState>('idle');
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [ttLoading, setTtLoading] = useState(true);
  const [cart, setCart] = useState<TicketCart>({});
  const [cartHydrated, setCartHydrated] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [qty, setQty] = useState(1);
  const [error, setError] = useState('');
  const [orderRef, setOrderRef] = useState('');
  const [orderId, setOrderId] = useState('');
  const [email, setEmail] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [promoInput, setPromoInput] = useState('');
  const [promo, setPromo] = useState<{ code: string; discountPercent: number } | null>(null);
  const [promoState, setPromoState] = useState<'idle' | 'checking' | 'ok' | 'error'>('idle');
  const [promoError, setPromoError] = useState('');
  const [ticketToken, setTicketToken] = useState('');
  const [emailSent, setEmailSent] = useState<boolean | null>(null);
  const [lineTickets, setLineTickets] = useState<LineTicket[]>([]);
  const [successLines, setSuccessLines] = useState<SuccessLine[]>([]);
  const [promoDismissed, setPromoDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setPromoDismissed(sessionStorage.getItem('ll_account_promo_dismissed') === '1');
  }, []);

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
      colors: ['#FF5A2E', '#FF7F5C', '#3ECF8E', '#FFB347'],
    });
  }, [step]);

  // The event page navigates here with ?items=12:2,7:1 — pre-fill the cart.
  useEffect(() => {
    const seeded = parseItemsParam(searchParams.get('items'));
    setCart(seeded ?? {});
    setCartHydrated(true);
  }, [searchParams]);

  // Ticket types load in parallel with the party fetch.
  useEffect(() => {
    if (!Number.isInteger(partyId) || partyId <= 0) return;
    let cancelled = false;
    setTtLoading(true);
    fetchTicketTypes(partyId)
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
  }, [partyId]);

  // Clamp any seeded cart against reality: dead types and over-quantities are
  // trimmed once the loader has caught up.
  const sellableTypes = ticketTypes.filter((t) => isTicketTypeSellable(t));
  useEffect(() => {
    if (!cartHydrated || ttLoading) return;
    setCart((current) => {
      const next: TicketCart = {};
      for (const type of sellableTypes) {
        const q = Math.min(current[type.id] ?? 0, remainingOf(type), MAX_QTY_PER_TYPE);
        if (q > 0) next[type.id] = q;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartHydrated, ttLoading, ticketTypes]);

  // Events without ticket types (the seeded ones) fall back to a single
  // "General Entry" option priced from the party's entry fee — never a mock.
  const hasTicketTypes = ticketTypes.length > 0;
  const legacyOptions: TicketType[] = hasTicketTypes || !party
    ? []
    : [
        {
          id: 0,
          partyId: party.id,
          name: 'General Entry',
          price: party.feeNum,
          quantity: party.capacity,
          sold: party.capacity - party.spotsLeft,
          description: null,
          salesStartAt: null,
          salesEndAt: null,
          active: true,
          sortOrder: 0,
        },
      ];
  const legacySelected = legacyOptions.find((o) => o.id === selectedId) ?? legacyOptions[0];
  const legacyRemaining = legacySelected && party ? party.spotsLeft : 0;
  const legacySoldOut = legacyRemaining <= 0;

  useEffect(() => {
    if (legacySelected) setQty((q) => Math.min(q, Math.max(1, Math.min(MAX_QTY_PER_TYPE, legacyRemaining))));
  }, [legacyRemaining, legacySelected]);

  if (!party) {
    if (loading) return <CheckoutSkeleton />;
    notFound();
  }

  if (party.cancelledAt) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center animate-fade-in">
        <div className="flex h-16 w-16 items-center justify-center rounded-full" style={{ background: 'rgba(255,90,46,0.08)', border: '1px solid rgba(255,90,46,0.25)' }}>
          <X size={28} color="#FF5A2E" strokeWidth={2} />
        </div>
        <h1 className="font-display mt-5 text-[28px] tracking-[0.5px]" style={{ color: '#FFFFFF' }}>Event Cancelled</h1>
        <p className="mt-2 max-w-[300px] text-sm" style={{ color: '#A7A8B5' }}>
          {party.cancellationReason
            ? `This event was cancelled: "${party.cancellationReason}"`
            : 'This event has been cancelled.'}
        </p>
        <Link href="/" className="btn-primary mt-6 px-7 py-3 text-sm font-semibold">
          Discover Events
        </Link>
      </div>
    );
  }

  const computed = hasTicketTypes ? computeCart(cart, sellableTypes) : { lines: [], tickets: 0, subtotal: 0, serviceFee: 0, total: 0, free: true };
  const hasSelection = hasTicketTypes ? computed.lines.length > 0 : qty >= 1;
  const cartIsFree = hasTicketTypes ? computed.free && hasSelection : legacySelected.price === 0;
  const cartTotal = hasTicketTypes ? computed.total : legacySelected.price * qty + (legacySelected.price > 0 ? SERVICE_FEE_PER_TICKET * qty : 0);
  const cartSubtotal = hasTicketTypes ? computed.subtotal : legacySelected.price * qty;
  const cartServiceFee = hasTicketTypes ? computed.serviceFee : legacySelected.price > 0 ? SERVICE_FEE_PER_TICKET * qty : 0;
  const discountPercent = promo?.discountPercent ?? 0;
  const appliedDiscount =
    discountPercent > 0
      ? hasTicketTypes
        ? cartDiscount(computed, discountPercent)
        : lineDiscount(legacySelected.price, qty, discountPercent)
      : 0;
  const netCartTotal = Math.max(0, cartTotal - appliedDiscount);
  const isFreeCheckout = cartIsFree || netCartTotal === 0;
  const isGuest = !user;

  const back = () => {
    if (step === 'success') {
      router.push('/');
    } else {
      router.push(`/party/${party.id}`);
    }
  };

  // The guest's ticket-access token is passed in explicitly rather than read
  // from component state. Paystack's callback fires long after the synchronous
  // block that calls the state setters, so a closure over that state would
  // still hold the old (empty) value -> the server would reject the guest order
  // as "Order not found." even though the payment already succeeded.
  const verifyPayment = async (reference: string, oid: string, accessToken?: string) => {
    setPayState('verifying');
    try {
      const res = await fetch('/api/paystack/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference, orderId: oid, token: accessToken || undefined }),
      });
      const data = (await res.json()) as {
        status?: string;
        error?: string;
        emailSent?: boolean;
        lineTickets?: LineTicket[];
      };
      if (data.status === 'confirmed') {
        setEmailSent(data.emailSent ?? true);
        if (data.lineTickets && data.lineTickets.length > 0) setLineTickets(data.lineTickets);
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

  const cancelPayment = (oid: string, accessToken?: string) => {
    fetch('/api/paystack/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: oid, token: accessToken || undefined }),
    }).catch(() => {});
    setPayState('cancelled');
  };

  const snapshotCart = (): SuccessLine[] =>
    hasTicketTypes
      ? computed.lines.map((line) => ({
          name: line.type.name,
          qty: line.qty,
          total: line.type.price * line.qty + (line.type.price > 0 ? SERVICE_FEE_PER_TICKET * line.qty : 0),
        }))
      : [
          {
            name: legacySelected.name,
            qty,
            total: legacySelected.price * qty + (legacySelected.price > 0 ? SERVICE_FEE_PER_TICKET * qty : 0),
          },
        ];

  const applyPromo = async () => {
    const code = promoInput.trim();
    if (!code || promoState === 'checking') return;
    setPromoState('checking');
    setPromoError('');
    try {
      const res = await fetch('/api/promos/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = (await res.json()) as { valid?: boolean; code?: string; discountPercent?: number; error?: string };
      if (!res.ok || !data.valid || typeof data.discountPercent !== 'number') {
        setPromo(null);
        setPromoState('error');
        setPromoError(data.error ?? 'That promo code is not valid.');
        return;
      }
      setPromo({ code: data.code!, discountPercent: data.discountPercent });
      setPromoInput(data.code!);
      setPromoState('ok');
    } catch {
      setPromo(null);
      setPromoState('error');
      setPromoError('Promo code could not be checked right now. Please try again.');
    }
  };

  const clearPromo = () => {
    setPromo(null);
    setPromoInput('');
    setPromoState('idle');
    setPromoError('');
  };

  const startPayment = async () => {
    if (!hasSelection) return;
    setError('');
    if (isGuest) {
      const trimmed = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
        setError('Enter a valid email to receive your ticket.');
        return;
      }
      setEmail(trimmed);
      if (guestName.trim() === '') {
        setError('Enter your full name to finish checkout.');
        return;
      }
      if (guestPhone.trim() && !/^[0-9+\-() ]{6,20}$/.test(guestPhone.trim())) {
        setError('Enter a valid phone number.');
        return;
      }
    }
    setSuccessLines(snapshotCart());
    setPayState('starting');
    try {
      const body = hasTicketTypes
        ? {
            partyId: party.id,
            items: computed.lines.map((line) => ({ ticketTypeId: line.type.id, quantity: line.qty })),
            email: email.trim().toLowerCase() || undefined,
            guestName: guestName.trim() || undefined,
            guestPhone: guestPhone.trim() || undefined,
            promoCode: promo?.code,
          }
        : {
            partyId: party.id,
            ticketTypeId: legacySelected.id || null,
            quantity: qty,
            email: email.trim().toLowerCase() || undefined,
            guestName: guestName.trim() || undefined,
            guestPhone: guestPhone.trim() || undefined,
            promoCode: promo?.code,
          };
      const res = await fetch('/api/paystack/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        free?: boolean;
        reference?: string;
        orderId?: string;
        amountKobo?: number;
        ticketAccessToken?: string;
        emailSent?: boolean;
        lineTickets?: LineTicket[];
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
      if (data.lineTickets && data.lineTickets.length > 0) setLineTickets(data.lineTickets);
      if (data.free) {
        setStep('success');
        setPayState('idle');
        return;
      }
      setPayState('paying');
      const accessToken = data.lineTickets?.[0]?.ticketAccessToken ?? undefined;
      await openPaystackInline({
        email: email.trim().toLowerCase(),
        amountKobo: data.amountKobo ?? 0,
        reference: data.reference,
        callback: () => verifyPayment(data.reference!, data.orderId!, accessToken),
        onClose: () => cancelPayment(data.orderId!, accessToken),
      });
    } catch (err) {
      setPayState('idle');
      setError(err instanceof Error ? err.message : 'Payment could not be started. Please try again.');
    }
  };

  const headerLabel = step === 'success' ? 'Confirmed' : 'Checkout';
  const ctaLabel =
    payState === 'starting' || payState === 'paying' || payState === 'verifying'
      ? 'Processing…'
      : isFreeCheckout
      ? 'Confirm RSVP'
      : 'Continue to Payment';
  const payDisabled = payState !== 'idle' || ttLoading || !hasSelection;

  const ticketHref =
    lineTickets[0]?.orderId
      ? lineTickets[0].ticketAccessToken
        ? `/ticket/${lineTickets[0].orderId}?token=${lineTickets[0].ticketAccessToken}`
        : `/ticket/${lineTickets[0].orderId}`
      : orderId
      ? ticketToken
        ? `/ticket/${orderId}?token=${ticketToken}`
        : `/ticket/${orderId}`
      : '/profile';

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
          style={{ background: 'rgba(62,207,142,0.08)', border: '1px solid rgba(62,207,142,0.22)', color: '#3ECF8E' }}
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
              <PartyPhoto src={partyPhoto(party.id, party.coverUrl)} alt={party.title} gradient={party.gradient} sizes="64px" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 truncate font-heading text-sm font-bold" style={{ color: '#FFFFFF' }}>{party.title}</div>
              <div className="text-xs" style={{ color: '#A7A8B5' }}>{party.date} · {party.time}</div>
              <div className="text-xs" style={{ color: '#A7A8B5' }}>{party.location}</div>
            </div>
          </div>

          <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[1.3px]" style={{ color: '#A7A8B5' }}>
            {hasTicketTypes ? 'Select Tickets' : 'Ticket'}
          </div>

          {ttLoading ? (
            <div className="mb-6 flex flex-col gap-2.5">
              <div className="h-[72px] animate-pulse rounded-2xl" style={{ background: 'rgba(255,255,255,0.04)' }} />
            </div>
          ) : hasTicketTypes ? (
            <>
              {sellableTypes.length === 0 ? (
                <div className="mb-6 rounded-2xl px-4 py-3.5 text-[13px]" style={{ background: 'rgba(255,90,46,0.06)', border: '1px solid rgba(255,90,46,0.18)', color: '#A7A8B5' }}>
                  No ticket types are on sale for this event right now.
                </div>
              ) : (
                <TicketTypePicker types={sellableTypes} cart={cart} onChange={setCart} />
              )}
              {computed.lines.length > 0 && (
                <div className="mt-4 mb-6 flex flex-wrap gap-1.5">
                  {computed.lines.map((line) => (
                    <span
                      key={line.type.id}
                      className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                      style={{ background: 'rgba(255,90,46,0.08)', border: '1px solid rgba(255,90,46,0.22)', color: '#FF7F5C' }}
                    >
                      {line.type.name} × {line.qty}
                    </span>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <button
                disabled={legacySoldOut}
                className="mb-4 flex w-full cursor-pointer items-center justify-between rounded-2xl px-4 py-3.5 text-left transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  background: 'rgba(255,90,46,0.08)',
                  border: '1px solid rgba(255,90,46,0.28)',
                }}
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold" style={{ color: '#FFFFFF' }}>{legacySelected.name}</div>
                  <div className="mt-0.5 text-xs" style={{ color: legacySoldOut ? '#FF5A2E' : '#A7A8B5' }}>
                    {legacySoldOut ? 'Sold out' : `${legacyRemaining} left`}
                  </div>
                </div>
                <div className="font-heading text-[15px] font-bold gradient-text">
                  {legacySelected.price === 0 ? 'Free' : formatNaira(legacySelected.price)}
                </div>
              </button>

              <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[1.3px]" style={{ color: '#A7A8B5' }}>
                Quantity
              </div>
              <div className="mb-6 flex items-center gap-[18px]">
                <button
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  disabled={legacySoldOut}
                  className="h-[38px] w-[38px] rounded-[10px] text-lg transition-all duration-200 active:scale-90 glass glass-hover disabled:opacity-40"
                  style={{ color: '#FFFFFF' }}
                >
                  −
                </button>
                <span className="font-display min-w-[24px] text-center text-2xl" style={{ color: '#FFFFFF' }}>{qty}</span>
                <button
                  onClick={() => setQty((q) => Math.min(MAX_QTY_PER_TYPE, Math.min(legacyRemaining, q + 1)))}
                  disabled={legacySoldOut || qty >= legacyRemaining || qty >= MAX_QTY_PER_TYPE}
                  className="h-[38px] w-[38px] rounded-[10px] text-lg transition-all duration-200 active:scale-90 glass glass-hover disabled:opacity-40"
                  style={{ color: '#FFFFFF' }}
                >
                  +
                </button>
              </div>
            </>
          )}

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
              {isGuest ? 'Your tickets will be sent to this email.' : `Your tickets will be sent to ${user.email}.`}
            </div>
          </div>

          <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[1.3px]" style={{ color: '#A7A8B5' }}>
            Full Name
          </div>
          <div className="mb-5">
            <input
              type="text"
              autoComplete="name"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="e.g. Ada Obi"
              className="w-full rounded-2xl px-4 py-3.5 text-sm outline-none"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFFFFF' }}
            />
            <div className="mt-2 text-xs" style={{ color: '#6B6C80' }}>
              {isGuest ? 'Your name goes on the ticket for check-in.' : 'Optional — shown on your ticket for check-in.'}
            </div>
          </div>

          <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[1.3px]" style={{ color: '#A7A8B5' }}>
            Phone Number
          </div>
          <div className="mb-6">
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={guestPhone}
              onChange={(e) => setGuestPhone(e.target.value)}
              placeholder="+234 800 000 0000"
              className="w-full rounded-2xl px-4 py-3.5 text-sm outline-none"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFFFFF' }}
            />
          </div>

          <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[1.3px]" style={{ color: '#A7A8B5' }}>
            Promo Code
          </div>
          <div className="mb-6 flex gap-2">
            <input
              type="text"
              autoComplete="off"
              value={promoInput}
              onChange={(e) => {
                setPromoInput(e.target.value.toUpperCase());
                setPromoState('idle');
                setPromoError('');
              }}
              placeholder="SAVE10"
              disabled={promoState === 'checking'}
              className="w-full rounded-2xl px-4 py-3.5 text-sm uppercase tracking-[0.5px] outline-none disabled:opacity-60"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFFFFF' }}
            />
            {promo ? (
              <button
                onClick={clearPromo}
                className="flex-shrink-0 rounded-2xl px-4 text-[13px] font-semibold"
                style={{ background: 'rgba(255,90,46,0.08)', border: '1px solid rgba(255,90,46,0.25)', color: '#FF7F5C' }}
              >
                Remove
              </button>
            ) : (
              <button
                onClick={applyPromo}
                disabled={promoState === 'checking' || !promoInput.trim()}
                className="flex-shrink-0 rounded-2xl px-5 text-[13px] font-bold disabled:opacity-40"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#FFFFFF' }}
              >
                Apply
              </button>
            )}
          </div>
          {promoError && (
            <div className="-mt-3 mb-4 animate-fade-in text-xs" style={{ color: '#FF5A2E' }}>
              {promoError}
            </div>
          )}

          <div className="mb-auto rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            {hasTicketTypes && computed.lines.length > 0 ? (
              computed.lines.map((line) => (
                <div key={line.type.id} className="mb-2 flex justify-between text-[13px]" style={{ color: '#A7A8B5' }}>
                  <span>{line.type.name} × {line.qty}</span>
                  <span>{formatNaira(line.type.price * line.qty + (line.type.price > 0 ? SERVICE_FEE_PER_TICKET * line.qty : 0))}</span>
                </div>
              ))
            ) : !hasTicketTypes ? (
              <div className="mb-2 flex justify-between text-[13px]" style={{ color: '#A7A8B5' }}>
                <span>{legacySelected.name} × {qty}</span>
                <span>{formatNaira(cartSubtotal)}</span>
              </div>
            ) : null}
            {cartServiceFee > 0 && (
              <div className="mb-2 flex justify-between text-[13px]" style={{ color: '#A7A8B5' }}>
                <span>Service Fee</span>
                <span>{formatNaira(cartServiceFee)}</span>
              </div>
            )}
            {promo && appliedDiscount > 0 && (
              <div className="mb-2 flex justify-between text-[13px] font-semibold" style={{ color: '#5DE0B1' }}>
                <span>Promo ({promo.code} · {promo.discountPercent}%)</span>
                <span>-{formatNaira(appliedDiscount)}</span>
              </div>
            )}
            <div className="my-2 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
            <div className="flex justify-between font-heading text-[15px] font-bold" style={{ color: '#FFFFFF' }}>
              <span>Total</span>
              <span>{isFreeCheckout ? 'Free' : formatNaira(netCartTotal)}</span>
            </div>
          </div>

          {error && (
            <div className="mt-4 animate-fade-in rounded-[10px] px-3.5 py-2.5 text-[13px]" style={{ background: 'rgba(255,90,46,0.08)', border: '1px solid rgba(255,90,46,0.25)', color: '#FF5A2E' }}>
              {error}
            </div>
          )}

          <button
            onClick={startPayment}
            disabled={payDisabled || (hasTicketTypes ? !hasSelection : legacySoldOut)}
            className="btn-primary mt-5 w-full py-[15px] text-sm font-bold disabled:opacity-60"
          >
            {hasTicketTypes ? (hasSelection ? ctaLabel : 'Select Tickets') : legacySoldOut ? 'Sold Out' : ctaLabel}
          </button>
        </div>
      )}

      {step === 'success' && (
        <div className="flex flex-1 flex-col items-center p-5 text-center">
          <div
            className="my-5 flex h-16 w-16 items-center justify-center rounded-full"
            style={{ background: 'rgba(62,207,142,0.08)', border: '1px solid rgba(62,207,142,0.22)' }}
          >
            <CheckCircle2 size={28} color="#3ECF8E" strokeWidth={2.5} />
          </div>
          <h1 className="font-display mb-1.5 text-[34px] tracking-[0.5px]" style={{ color: '#FFFFFF' }}>
            {isFreeCheckout ? "You're On The List!" : "You're In!"}
          </h1>
          <p className="mb-[26px] max-w-[320px] text-sm" style={{ color: '#A7A8B5' }}>
            {isGuest
              ? emailSent === false
                ? "We couldn't email your tickets — use the links below to open them."
                : successLines.length > 1
                ? `Your ${successLines.length} tickets are on their way to ${email}.`
                : `Your ticket is on its way to ${email}.`
              : isFreeCheckout
              ? 'Your RSVP is confirmed. See you there.'
              : 'Your payment was successful. Your tickets are confirmed.'}
          </p>

          {isGuest && emailSent === false && (
            <div
              className="mb-4 flex w-full max-w-[340px] items-start gap-2.5 rounded-[10px] px-3.5 py-3 text-left text-[13px]"
              style={{ background: 'rgba(255,90,46,0.08)', border: '1px solid rgba(255,90,46,0.25)', color: '#FF5A2E' }}
            >
              <AlertTriangle size={16} strokeWidth={2} className="mt-0.5 flex-shrink-0" />
              <span>Email delivery failed. Save these links — they&apos;re the only way to reach your tickets.</span>
            </div>
          )}

          <div className="w-full max-w-[340px] overflow-hidden rounded-2xl text-left" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="p-[18px]">
              <div className="mb-1 font-heading text-sm font-bold" style={{ color: '#FFFFFF' }}>{party.title}</div>
              <div className="mb-0.5 text-xs" style={{ color: '#A7A8B5' }}>{party.date} · {party.time}</div>
              <div className="text-xs" style={{ color: '#A7A8B5' }}>{party.location}</div>
            </div>

            <div className="flex flex-col border-t border-dashed" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
              {guestName.trim() && (
                <div className="border-t border-dashed px-[18px] py-4" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                  <div className="mb-[3px] text-[10px] uppercase tracking-[0.7px]" style={{ color: '#6B6C80' }}>Ticket Holder</div>
                  <div className="font-heading text-sm font-bold" style={{ color: '#FFFFFF' }}>
                    {guestName.trim()}
                    {guestPhone.trim() ? ` · ${guestPhone.trim()}` : ''}
                  </div>
                </div>
              )}
              {promo && appliedDiscount > 0 && (
                <div className="flex items-center justify-between border-t border-dashed px-[18px] py-3.5" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                  <div className="text-xs font-semibold" style={{ color: '#5DE0B1' }}>
                    Promo {promo.code} · {promo.discountPercent}%
                  </div>
                  <div className="text-[13px] font-bold" style={{ color: '#5DE0B1' }}>
                    -{formatNaira(appliedDiscount)}
                  </div>
                </div>
              )}
              <div className="px-[18px] py-4">
                <div className="mb-[3px] text-[10px] uppercase tracking-[0.7px]" style={{ color: '#6B6C80' }}>Order Ref</div>
                <div className="font-heading text-sm font-bold gradient-text">{orderRef}</div>
              </div>
              {successLines.length === 0 ? (
                <div className="border-t border-dashed px-[18px] py-4" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                  <div className="mb-[3px] text-[10px] uppercase tracking-[0.7px]" style={{ color: '#6B6C80' }}>Ticket Code</div>
                  <div className="font-heading text-sm font-bold" style={{ color: '#FFFFFF' }}>{orderRef}</div>
                </div>
              ) : (
                successLines.map((line, i) => {
                  const lt = lineTickets[i];
                  return (
                    <div key={i} className="border-t border-dashed px-[18px] py-4" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <div className="mb-[3px] text-[10px] uppercase tracking-[0.7px]" style={{ color: '#6B6C80' }}>
                            {line.name} × {line.qty}
                          </div>
                          <div className="font-heading text-sm font-bold" style={{ color: '#FFFFFF' }}>
                            {line.total === 0 ? 'Free' : formatNaira(line.total)}
                          </div>
                        </div>
                        <div className="text-right">
                          {lt && (
                            <>
                              <div className="mb-[3px] text-[10px] uppercase tracking-[0.7px]" style={{ color: '#6B6C80' }}>Ticket Code</div>
                              <div className="font-heading text-sm font-bold" style={{ color: '#FFFFFF' }}>{lt.orderRef}</div>
                            </>
                          )}
                        </div>
                      </div>
                      {isGuest && lt && (
                        <button
                          onClick={() =>
                            router.push(lt.ticketAccessToken ? `/ticket/${lt.orderId}?token=${lt.ticketAccessToken}` : `/ticket/${lt.orderId}`)
                          }
                          className="mt-3 w-full rounded-xl py-2.5 text-[13px] font-semibold glass glass-hover"
                          style={{ color: '#FF7F5C' }}
                        >
                          View Ticket · {line.name}
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="mt-7 flex w-full max-w-[340px] flex-col gap-2.5">
            <button
              onClick={() => (isGuest ? router.push(ticketHref) : router.push('/tickets'))}
              className="btn-primary w-full py-[15px] text-sm font-bold"
            >
              View My Tickets
            </button>
            <button
              onClick={() => router.push(`/party/${party.id}`)}
              className="w-full rounded-xl py-[15px] text-sm font-semibold glass glass-hover"
              style={{ color: '#A7A8B5' }}
            >
              Done
            </button>
          </div>

          {isGuest && !promoDismissed && (
            <div
              className="mt-7 w-full max-w-[340px] rounded-2xl p-[18px] text-left"
              style={{ background: 'rgba(255,155,62,0.06)', border: '1px solid rgba(255,155,62,0.25)' }}
            >
              <div className="font-heading mb-1 text-sm font-bold" style={{ color: '#FF9B3E' }}>
                Your tickets are saved — for now.
              </div>
              <p className="mb-4 text-xs leading-relaxed" style={{ color: '#A7A8B5' }}>
                Create an account to keep all your tickets, reviews and reminders in one place — and never lose them if you switch devices.
              </p>
              <div className="flex flex-col gap-2">
                <Link
                  href="/signup?next=/tickets"
                  className="btn-primary w-full py-[13px] text-center text-sm font-bold"
                >
                  Create Account
                </Link>
                <button
                  onClick={() => {
                    setPromoDismissed(true);
                    sessionStorage.setItem('ll_account_promo_dismissed', '1');
                  }}
                  className="w-full py-2 text-xs font-semibold"
                  style={{ color: '#6B6C80' }}
                >
                  Maybe Later
                </button>
              </div>
            </div>
          )}
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