'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { hostStartHref } from '@/lib/data';
import { useLagosLiveStore } from '@/lib/store';

const FAQS = [
  {
    q: 'How much does it cost to host an event on Lagos Live?',
    a: 'Creating and listing your event is completely free. When you request a payout, a 15% platform fee applies to your confirmed ticket revenue — so you keep the bigger share.',
  },
  {
    q: 'When do I get paid, and how?',
    a: 'Each of your events comes with a payouts dashboard. Once your confirmed revenue grows past the minimum, you can request a payout and our team processes it to your verified bank account.',
  },
  {
    q: 'Can I sell multiple ticket types or different prices?',
    a: 'Yes. Add as many ticket tiers as you need — each with its own name, price and quantity. Free events use a single General Entry tier.',
  },
  {
    q: 'How does check-in work at the door?',
    a: 'Every sold ticket comes with a unique QR code. On event day, open the check-in screen and scan each guest\u2019s ticket to mark it used. Organizers and staff with the right role can both run check-in.',
  },
  {
    q: 'Can I create promo codes or discounts?',
    a: 'Yes. Promo codes apply percentage discounts to paid tickets so you can reward early birds, friends and partners.',
  },
  {
    q: 'Can attendees buy without creating an account?',
    a: 'Yes — attendees can check out as guests. If they create a free account, their tickets are saved and easier to manage.',
  },
  {
    q: 'Can I track how my event is selling?',
    a: 'Your host dashboard shows live ticket sales and revenue per event, so you always know how the night is shaping up.',
  },
  {
    q: 'What happens if a ticket needs a refund?',
    a: 'Refund requests are reviewed by our support team directly — reach out from the Support page and we\u2019ll help sort it out.',
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-[16px]" style={{ background: '#171725', border: '1px solid rgba(255,255,255,0.08)' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <span className="font-heading text-[14px] font-semibold leading-snug" style={{ color: '#FFFFFF' }}>
          {q}
        </span>
        <ChevronDown
          size={17}
          strokeWidth={2}
          className={`flex-shrink-0 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
          style={{ color: '#FF2D95' }}
        />
      </button>
      {open && (
        <p className="px-5 pb-5 text-[13.5px] leading-[1.75]" style={{ color: '#A7A8B5' }}>
          {a}
        </p>
      )}
    </div>
  );
}

export default function Faq() {
  const user = useLagosLiveStore((s) => s.user);

  return (
    <section className="mx-auto max-w-[760px] px-5 py-14 md:py-16">
      <div className="mb-8 flex flex-col items-center text-center">
        <h2 className="font-display text-[34px] leading-[1] tracking-[1px] md:text-[46px]" style={{ color: '#FFFFFF' }}>
          Questions, <span className="gradient-text">answered</span>
        </h2>
        <p className="mt-2 text-[14px]" style={{ color: '#A7A8B5' }}>
          Everything about hosting and buying on Lagos Live.
        </p>
      </div>

      <div className="flex flex-col gap-2.5">
        {FAQS.map(({ q, a }) => (
          <FaqItem key={q} q={q} a={a} />
        ))}
      </div>

      <div className="mt-9 text-center text-[13px]" style={{ color: '#A7A8B5' }}>
        Still have a question?{' '}
        <Link href={hostStartHref(user)} className="font-semibold transition-colors" style={{ color: '#FF2D95' }}>
          Become a host
        </Link>{' '}
        or{' '}
        <Link href="/explore" className="font-semibold transition-colors" style={{ color: '#00BFFF' }}>
          explore events
        </Link>
        .
      </div>
    </section>
  );
}