'use client';

import Link from 'next/link';
import { Check, MessageCircle } from 'lucide-react';
import { hostStartHref } from '@/lib/data';
import { useLagosLiveStore } from '@/lib/store';

const WHATSAPP_URL = 'https://wa.me/234XXXXXXXXXX';

const PLANS = [
  {
    tag: 'Free Events',
    price: '₦0',
    unit: 'per ticket, always',
    body: "Hosting a free event? We don't charge a single kobo. Create, share, and fill your seats completely free — no catch.",
    features: [
      'No fee per ticket, ever',
      'Create and list events for free',
      'Sell via a shareable event page',
      'QR check-in at the door',
    ],
    cta: 'Get Started',
    href: 'host',
    highlight: false,
  },
  {
    tag: 'Ticket Events',
    price: '5%',
    unit: '+ ₦100 per paid ticket sold',
    body: 'For regular ticketed events. We keep this predictable so organizers can plan profits clearly.',
    features: [
      '5% + ₦100 flat per paid ticket',
      'Multiple ticket tiers & prices',
      'Promo codes for discounts',
      'QR check-in + live sales tracking',
    ],
    cta: 'Get Started',
    href: 'host',
    highlight: true,
  },
  {
    tag: 'Custom Services',
    price: 'Tailored',
    unit: 'Quote',
    body: 'Reach out for a custom package based on your event size and support needs.',
    features: [
      'Event wrist tags & printing services',
      'On-site ticketing support',
      'Custom event operations setup',
    ],
    cta: 'Chat on WhatsApp',
    href: 'whatsapp',
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
            Free events stay free. Ticketed events carry one small, predictable fee. No hidden costs.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {PLANS.map((plan) => {
            const href = plan.href === 'whatsapp' ? WHATSAPP_URL : hostStartHref(user);
            const external = plan.href === 'whatsapp';
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
                    Most used
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
                  href={href}
                  target={external ? '_blank' : undefined}
                  rel={external ? 'noopener noreferrer' : undefined}
                  className="mt-auto flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-bold transition-all duration-200 active:scale-95"
                  style={{
                    background: plan.highlight ? 'linear-gradient(135deg,#FF2D95,#8A2BE2)' : 'rgba(255,255,255,0.05)',
                    border: plan.highlight ? 'none' : '1px solid rgba(255,255,255,0.12)',
                    color: '#FFFFFF',
                  }}
                >
                  {external && <MessageCircle size={15} strokeWidth={2} />}
                  {plan.cta}
                </Link>
              </div>
            );
          })}
        </div>

        <p className="mt-6 text-center text-[12px] leading-relaxed" style={{ color: '#6B6C80' }}>
          Free events stay free end to end. Normal ticketed events are charged 5% + ₦100 per paid ticket. All fees are shown before you confirm.
        </p>
      </div>
    </section>
  );
}