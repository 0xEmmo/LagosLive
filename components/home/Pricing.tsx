'use client';

import Link from 'next/link';
import { Check } from 'lucide-react';
import { hostStartHref } from '@/lib/data';
import { useLagosLiveStore } from '@/lib/store';

const PLANS = [
  {
    tag: 'For hosts',
    price: 'Free to start',
    unit: 'creating & selling',
    body: 'Get your event in front of Lagos, collect ticket money and manage attendance.',
    features: [
      'Create and list events for free',
      'Sell via a shareable event page',
      'QR check-in at the door',
      'Live sales and revenue tracking',
    ],
    cta: 'Start hosting',
    highlight: false,
  },
  {
    tag: 'On payouts',
    price: '15%',
    unit: 'platform fee',
    body: 'When you request a payout, a 15% platform fee applies to your confirmed ticket revenue.',
    features: [
      'Applied only when you cash out',
      'Payouts to your verified bank account',
      'Minimum payout: ₦5,000',
      'Full transparency in your dashboard',
    ],
    cta: 'Host an event',
    highlight: true,
  },
  {
    tag: 'For attendees',
    price: '₦500',
    unit: 'service fee per paid ticket',
    body: 'A small service fee covers processing. Free-entry events cost attendees nothing.',
    features: [
      'No subscription or membership',
      'Buy as a guest — no account needed',
      'Digital ticket with unique QR code',
      'Free events are 100% free',
    ],
    cta: 'Explore events',
    highlight: false,
  },
];

export default function Pricing() {
  const user = useLagosLiveStore((s) => s.user);

  return (
    <section id="pricing" className="scroll-mt-20 py-14 md:py-16">
      <div className="mx-auto max-w-[1080px] px-5">
        <div className="mb-9 flex flex-col items-center text-center">
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}>
            <span className="text-[10px] font-bold uppercase tracking-[1.2px]" style={{ color: '#A7A8B5' }}>
              Pricing
            </span>
          </div>
          <h2 className="font-display text-[34px] leading-[1] tracking-[1px] md:text-[46px]" style={{ color: '#FFFFFF' }}>
            Simple, <span className="gradient-text">honest fees</span>
          </h2>
          <p className="mt-2 max-w-[440px] text-[14px] leading-[1.7]" style={{ color: '#A7A8B5' }}>
            No hidden costs. No monthly plans. You only pay when money moves.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {PLANS.map((plan) => {
            const CtaHref = plan.highlight ? hostStartHref(user) : plan.tag === 'For attendees' ? '/explore' : hostStartHref(user);
            return (
              <div
                key={plan.tag}
                className="relative flex flex-col rounded-[22px] p-6 md:p-7"
                style={{
                  background: plan.highlight ? 'linear-gradient(160deg, rgba(255,45,149,0.08), rgba(138,43,226,0.06))' : '#171725',
                  border: plan.highlight ? '1px solid rgba(255,45,149,0.4)' : '1px solid rgba(255,255,255,0.08)',
                  boxShadow: plan.highlight ? '0 20px 50px rgba(255,45,149,0.12)' : 'none',
                }}
              >
                {plan.highlight && (
                  <span
                    className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-3.5 py-1 text-[10px] font-bold uppercase tracking-[1px] text-white"
                    style={{ background: 'linear-gradient(135deg,#FF2D95,#8A2BE2)' }}
                  >
                    Hosts get paid
                  </span>
                )}
                <div className="mb-1 text-[11px] font-bold uppercase tracking-[1.4px]" style={{ color: '#8A8B9C' }}>
                  {plan.tag}
                </div>
                <div className="font-display mb-1 text-[46px] leading-none tracking-[1px]" style={{ color: '#FFFFFF' }}>
                  {plan.price}
                </div>
                <div className="mb-4 text-[12.5px]" style={{ color: '#00F5D4' }}>
                  {plan.unit}
                </div>
                <p className="mb-5 text-[13px] leading-[1.7]" style={{ color: '#A7A8B5' }}>
                  {plan.body}
                </p>
                <ul className="mb-8 flex flex-col gap-2.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-[13px] leading-snug" style={{ color: '#C9CAD6' }}>
                      <Check size={15} strokeWidth={2.5} className="mt-[1px] flex-shrink-0" style={{ color: '#00F5D4' }} />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={CtaHref}
                  className="mt-auto flex items-center justify-center rounded-full px-5 py-2.5 text-[13px] font-bold transition-all duration-200 active:scale-95"
                  style={{
                    background: plan.highlight ? 'linear-gradient(135deg,#FF2D95,#8A2BE2)' : 'rgba(255,255,255,0.05)',
                    border: plan.highlight ? 'none' : '1px solid rgba(255,255,255,0.12)',
                    color: '#FFFFFF',
                  }}
                >
                  {plan.cta}
                </Link>
              </div>
            );
          })}
        </div>

        <p className="mt-6 text-center text-[12px] leading-relaxed" style={{ color: '#6B6C80' }}>
          Free-entry events are free end to end — no fee to host, no fee to attend. All fees are shown before you confirm.
        </p>
      </div>
    </section>
  );
}