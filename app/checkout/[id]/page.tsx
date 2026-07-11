'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { notFound } from 'next/navigation';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import confetti from 'canvas-confetti';
import { getPartyById, partyPhoto } from '@/lib/data';
import PartyPhoto from '@/components/PartyPhoto';
import { formatNaira } from '@/lib/filters';

type Step = 'details' | 'payment' | 'success';
type Tier = 'regular' | 'vip';

export default function CheckoutPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const party = getPartyById(Number(params.id));

  const [step, setStep] = useState<Step>('details');
  const [tier, setTier] = useState<Tier>('regular');
  const [qty, setQty] = useState(1);
  const [method, setMethod] = useState<'card' | 'transfer'>('card');
  const [cardName, setCardName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [error, setError] = useState('');
  const [orderRef, setOrderRef] = useState('');

  useEffect(() => {
    if (step !== 'success') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    confetti({
      particleCount: 90,
      spread: 70,
      startVelocity: 38,
      origin: { y: 0.35 },
      colors: ['#552CB7', '#FB7DA8', '#FFC567', '#00995E', '#058CD7'],
    });
  }, [step]);

  if (!party) notFound();

  const unitPrice = tier === 'vip' ? party.feeNum * 2.2 : party.feeNum;
  const serviceFee = party.feeNum > 0 ? 500 * qty : 0;
  const subtotal = unitPrice * qty;
  const total = subtotal + serviceFee;

  const back = () => {
    if (step === 'payment') {
      setStep('details');
      setError('');
    } else if (step === 'success') {
      router.push('/');
    } else {
      router.push(`/party/${party.id}`);
    }
  };

  const goToPayment = () => {
    if (party.feeNum === 0) {
      setOrderRef('LL-' + Math.random().toString(36).slice(2, 8).toUpperCase());
      setStep('success');
    } else {
      setError('');
      setStep('payment');
    }
  };

  const submitPayment = () => {
    if (method === 'card') {
      if (!cardName.trim() || !cardNumber.trim() || !cardExpiry.trim() || !cardCvv.trim()) {
        setError('Please fill in all card details.');
        return;
      }
    }
    setError('');
    setOrderRef('LL-' + Math.random().toString(36).slice(2, 8).toUpperCase());
    setStep('success');
  };

  const headerLabel = step === 'payment' ? 'Payment' : step === 'success' ? 'Confirmed' : 'Checkout';
  const inputStyle = {
    width: '100%',
    background: 'var(--c-glass)',
    border: '1px solid var(--c-border3)',
    borderRadius: 10,
    padding: '13px 14px',
    color: 'var(--c-text)',
    fontSize: 14,
    outline: 'none',
  } as const;

  return (
    <div className="mx-auto flex min-h-screen max-w-[520px] flex-col animate-fade-in">
      <div
        className="sticky top-0 z-40 flex items-center gap-2.5 border-b px-5 py-4 backdrop-blur-[22px] backdrop-saturate-150"
        style={{ background: 'var(--c-header)', borderColor: 'var(--c-border)' }}
      >
        <button
          onClick={back}
          className="flex h-9 w-9 items-center justify-center rounded-[10px] border"
          style={{ background: 'var(--c-glass)', borderColor: 'var(--c-border3)', color: 'var(--c-text-muted)' }}
        >
          <ArrowLeft size={13} strokeWidth={2.5} />
        </button>
        <span className="font-heading text-[13px] font-bold uppercase tracking-[1px]" style={{ color: 'var(--c-text)' }}>
          {headerLabel}
        </span>
      </div>

      {step === 'details' && (
        <div className="flex flex-1 flex-col p-5">
          <div className="mb-[22px] flex gap-3 rounded-2xl border p-3" style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
            <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-[10px]" style={{ background: party.gradient }}>
              <PartyPhoto src={partyPhoto(party.id)} alt={party.title} gradient={party.gradient} sizes="64px" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 truncate font-heading text-sm font-bold" style={{ color: 'var(--c-text)' }}>{party.title}</div>
              <div className="text-xs" style={{ color: 'var(--c-text-muted)' }}>{party.date} · {party.time}</div>
              <div className="text-xs" style={{ color: 'var(--c-text-muted)' }}>{party.location}</div>
            </div>
          </div>

          <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[1.3px]" style={{ color: 'var(--c-text-muted)' }}>
            Select Ticket Type
          </div>
          <div className="mb-6 flex flex-col gap-2.5">
            <div
              onClick={() => setTier('regular')}
              className="flex cursor-pointer items-center justify-between rounded-2xl border px-4 py-3.5 transition-colors duration-150 active:scale-[0.98]"
              style={{
                background: tier === 'regular' ? 'rgba(85,44,183,0.14)' : 'var(--c-surface)',
                borderColor: tier === 'regular' ? '#1A140F' : 'var(--c-border2)',
              }}
            >
              <div>
                <div className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Regular</div>
                <div className="mt-0.5 text-xs" style={{ color: 'var(--c-text-faint)' }}>Standard entry</div>
              </div>
              <div className="font-heading text-[15px] font-bold" style={{ color: '#552CB7' }}>
                {party.feeNum === 0 ? 'Free' : formatNaira(party.feeNum)}
              </div>
            </div>
            <div
              onClick={() => setTier('vip')}
              className="flex cursor-pointer items-center justify-between rounded-2xl border px-4 py-3.5 transition-colors duration-150 active:scale-[0.98]"
              style={{
                background: tier === 'vip' ? 'rgba(85,44,183,0.14)' : 'var(--c-surface)',
                borderColor: tier === 'vip' ? '#1A140F' : 'var(--c-border2)',
              }}
            >
              <div>
                <div className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>VIP</div>
                <div className="mt-0.5 text-xs" style={{ color: 'var(--c-text-faint)' }}>Priority entry &amp; reserved area</div>
              </div>
              <div className="font-heading text-[15px] font-bold" style={{ color: '#552CB7' }}>
                {party.feeNum === 0 ? 'Free' : formatNaira(party.feeNum * 2.2)}
              </div>
            </div>
          </div>

          <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[1.3px]" style={{ color: 'var(--c-text-muted)' }}>
            Quantity
          </div>
          <div className="mb-6 flex items-center gap-[18px]">
            <button
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="h-[38px] w-[38px] rounded-[10px] border text-lg transition-transform duration-150 active:scale-90"
              style={{ background: 'var(--c-glass)', borderColor: 'var(--c-border3)', color: 'var(--c-text)' }}
            >
              −
            </button>
            <span className="font-display min-w-[24px] text-center text-2xl" style={{ color: 'var(--c-text)' }}>{qty}</span>
            <button
              onClick={() => setQty((q) => Math.min(6, q + 1))}
              className="h-[38px] w-[38px] rounded-[10px] border text-lg transition-transform duration-150 active:scale-90"
              style={{ background: 'var(--c-glass)', borderColor: 'var(--c-border3)', color: 'var(--c-text)' }}
            >
              +
            </button>
          </div>

          <div className="mb-auto rounded-2xl border p-4" style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
            <div className="mb-2 flex justify-between text-[13px]" style={{ color: 'var(--c-text-muted)' }}>
              <span>Subtotal</span>
              <span>{formatNaira(subtotal)}</span>
            </div>
            {party.feeNum > 0 && (
              <div className="mb-2 flex justify-between text-[13px]" style={{ color: 'var(--c-text-muted)' }}>
                <span>Service Fee</span>
                <span>{formatNaira(serviceFee)}</span>
              </div>
            )}
            <div className="my-2 h-px" style={{ background: 'var(--c-border2)' }} />
            <div className="flex justify-between font-heading text-[15px] font-bold" style={{ color: 'var(--c-text)' }}>
              <span>Total</span>
              <span>{formatNaira(total)}</span>
            </div>
          </div>

          <button
            onClick={goToPayment}
            className="mt-5 w-full rounded-xl border-2 py-[15px] font-heading text-sm font-bold text-white"
            style={{ background: 'linear-gradient(135deg,#552CB7,#FB7DA8)', borderColor: '#1A140F', boxShadow: '4px 4px 0 rgba(26,20,15,0.9)' }}
          >
            {party.feeNum === 0 ? 'Confirm RSVP' : 'Continue to Payment'}
          </button>
        </div>
      )}

      {step === 'payment' && (
        <div className="flex flex-1 flex-col p-5">
          <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[1.3px]" style={{ color: 'var(--c-text-muted)' }}>
            Payment Method
          </div>
          <div className="mb-[22px] flex gap-2.5">
            <button
              onClick={() => setMethod('card')}
              className="flex-1 rounded-[10px] border py-[11px] text-[13px] font-semibold"
              style={{
                background: method === 'card' ? 'rgba(85,44,183,0.16)' : 'var(--c-surface2)',
                borderColor: method === 'card' ? '#1A140F' : 'var(--c-border2)',
                color: method === 'card' ? '#552CB7' : 'var(--c-text-muted)',
              }}
            >
              Card
            </button>
            <button
              onClick={() => setMethod('transfer')}
              className="flex-1 rounded-[10px] border py-[11px] text-[13px] font-semibold"
              style={{
                background: method === 'transfer' ? 'rgba(85,44,183,0.16)' : 'var(--c-surface2)',
                borderColor: method === 'transfer' ? '#1A140F' : 'var(--c-border2)',
                color: method === 'transfer' ? '#552CB7' : 'var(--c-text-muted)',
              }}
            >
              Bank Transfer
            </button>
          </div>

          {method === 'card' ? (
            <div className="mb-6 flex flex-col gap-3.5">
              <div>
                <div className="mb-[7px] text-[11px] font-semibold uppercase tracking-[0.8px]" style={{ color: 'var(--c-text-muted)' }}>Cardholder Name</div>
                <input value={cardName} onChange={(e) => setCardName(e.target.value)} placeholder="Ada Okafor" style={inputStyle} className="font-heading" />
              </div>
              <div>
                <div className="mb-[7px] text-[11px] font-semibold uppercase tracking-[0.8px]" style={{ color: 'var(--c-text-muted)' }}>Card Number</div>
                <input value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} placeholder="4242 4242 4242 4242" style={inputStyle} className="font-heading" />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <div className="mb-[7px] text-[11px] font-semibold uppercase tracking-[0.8px]" style={{ color: 'var(--c-text-muted)' }}>Expiry</div>
                  <input value={cardExpiry} onChange={(e) => setCardExpiry(e.target.value)} placeholder="MM/YY" style={inputStyle} className="font-heading" />
                </div>
                <div className="flex-1">
                  <div className="mb-[7px] text-[11px] font-semibold uppercase tracking-[0.8px]" style={{ color: 'var(--c-text-muted)' }}>CVV</div>
                  <input value={cardCvv} onChange={(e) => setCardCvv(e.target.value)} placeholder="123" style={inputStyle} className="font-heading" />
                </div>
              </div>
            </div>
          ) : (
            <div className="mb-6 rounded-2xl border p-4" style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
              <div className="mb-2.5 text-xs" style={{ color: 'var(--c-text-faint)' }}>Transfer the exact amount to:</div>
              <div className="mb-1.5 flex justify-between text-[13px]" style={{ color: 'var(--c-text)' }}>
                <span style={{ color: 'var(--c-text-muted)' }}>Bank</span>
                <span className="font-semibold">Providus Bank</span>
              </div>
              <div className="mb-1.5 flex justify-between text-[13px]" style={{ color: 'var(--c-text)' }}>
                <span style={{ color: 'var(--c-text-muted)' }}>Account No.</span>
                <span className="font-semibold">8231459072</span>
              </div>
              <div className="flex justify-between text-[13px]" style={{ color: 'var(--c-text)' }}>
                <span style={{ color: 'var(--c-text-muted)' }}>Account Name</span>
                <span className="font-semibold">Lagos Live Ltd</span>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-4 animate-fade-in rounded-[10px] border px-3.5 py-2.5 text-[13px]" style={{ background: 'rgba(214,64,44,0.1)', borderColor: 'rgba(214,64,44,0.32)', color: '#D6402C' }}>
              {error}
            </div>
          )}

          <div className="mb-auto mt-auto rounded-2xl border p-4" style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
            <div className="flex justify-between font-heading text-[15px] font-bold" style={{ color: 'var(--c-text)' }}>
              <span>Total Due</span>
              <span>{formatNaira(total)}</span>
            </div>
          </div>

          <button
            onClick={submitPayment}
            className="mt-5 w-full rounded-xl border-2 py-[15px] font-heading text-sm font-bold text-white"
            style={{ background: 'linear-gradient(135deg,#552CB7,#FB7DA8)', borderColor: '#1A140F', boxShadow: '4px 4px 0 rgba(26,20,15,0.9)' }}
          >
            Pay {formatNaira(total)}
          </button>
        </div>
      )}

      {step === 'success' && (
        <div className="flex flex-1 flex-col items-center p-5 text-center">
          <div
            className="my-5 flex h-16 w-16 items-center justify-center rounded-full border"
            style={{ background: 'rgba(0,153,94,0.14)', borderColor: 'rgba(0,153,94,0.4)' }}
          >
            <CheckCircle2 size={28} color="#00995E" strokeWidth={2.5} />
          </div>
          <h1 className="font-display mb-1.5 text-[34px] tracking-[0.5px]" style={{ color: 'var(--c-text)' }}>
            {party.feeNum === 0 ? "You're On The List!" : "You're In!"}
          </h1>
          <p className="mb-[26px] max-w-[320px] text-sm" style={{ color: 'var(--c-text-muted)' }}>
            {party.feeNum === 0 ? 'Your RSVP is confirmed. See you there.' : 'Your payment was successful. Your ticket is confirmed.'}
          </p>

          <div className="w-full max-w-[340px] overflow-hidden rounded-2xl border text-left" style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border2)' }}>
            <div className="p-[18px]">
              <div className="mb-1 font-heading text-sm font-bold" style={{ color: 'var(--c-text)' }}>{party.title}</div>
              <div className="mb-0.5 text-xs" style={{ color: 'var(--c-text-muted)' }}>{party.date} · {party.time}</div>
              <div className="text-xs" style={{ color: 'var(--c-text-muted)' }}>{party.location}</div>
            </div>
            <div className="flex items-center justify-between border-t border-dashed border-white/15 px-[18px] py-4">
              <div>
                <div className="mb-[3px] text-[10px] uppercase tracking-[0.7px]" style={{ color: 'var(--c-text-faint)' }}>Order Ref</div>
                <div className="font-heading text-sm font-bold" style={{ color: '#552CB7' }}>{orderRef}</div>
              </div>
              <div className="text-right">
                <div className="mb-[3px] text-[10px] uppercase tracking-[0.7px]" style={{ color: 'var(--c-text-faint)' }}>
                  {tier === 'vip' ? 'VIP' : 'Regular'} × {qty}
                </div>
                <div className="font-heading text-sm font-bold" style={{ color: 'var(--c-text)' }}>{formatNaira(total)}</div>
              </div>
            </div>
          </div>

          <div className="mt-7 flex w-full max-w-[340px] flex-col gap-2.5">
            <button
              onClick={() => router.push('/profile')}
              className="w-full rounded-xl border-2 py-[15px] font-heading text-sm font-bold text-white"
              style={{ background: 'linear-gradient(135deg,#552CB7,#FB7DA8)', borderColor: '#1A140F', boxShadow: '4px 4px 0 rgba(26,20,15,0.9)' }}
            >
              View My Tickets
            </button>
            <button
              onClick={() => router.push(`/party/${party.id}`)}
              className="w-full rounded-xl border py-[15px] text-sm font-semibold"
              style={{ background: 'var(--c-glass)', borderColor: 'var(--c-border3)', color: 'var(--c-text-muted)' }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
