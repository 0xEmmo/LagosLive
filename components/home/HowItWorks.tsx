'use client';

import Link from 'next/link';
import { UserPlus, CalendarRange, TicketCheck, ScanLine, Wallet } from 'lucide-react';
import { hostStartHref } from '@/lib/data';
import { useLagosLiveStore } from '@/lib/store';

const STEPS = [
  { icon: UserPlus, title: 'Create your organizer account', body: 'Sign up in seconds — you can sell tickets right away.' },
  { icon: CalendarRange, title: 'Set up your event', body: 'Add the details, dates, location, ticket tiers and prices.' },
  { icon: TicketCheck, title: 'Share your event page', body: 'Send the link anywhere. Attendees buy directly on the page.' },
  { icon: ScanLine, title: 'Check guests in with QR codes', body: 'Scan tickets at the door with your phone on event day.' },
  { icon: Wallet, title: 'Get paid out', body: 'Confirmed sales are paid to your bank account once you request a payout.' },
];

export default function HowItWorks() {
  const user = useLagosLiveStore((s) => s.user);

  return (
    <section className="mx-auto max-w-[1080px] px-5 py-14 md:py-16">
      <div className="mb-9 flex flex-col items-center text-center">
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5" style={{ background: 'rgba(0,191,255,0.08)', border: '1px solid rgba(0,191,255,0.2)' }}>
          <span className="text-[10px] font-bold uppercase tracking-[1.2px]" style={{ color: '#00BFFF' }}>
            How it works
          </span>
        </div>
        <h2 className="font-display text-[34px] leading-[1] tracking-[1px] md:text-[46px]" style={{ color: '#FFFFFF' }}>
          From idea to <span className="gradient-text">sold out</span>
        </h2>
      </div>

      <ol className="grid gap-4 md:grid-cols-5 md:gap-3">
        {STEPS.map(({ icon: Icon, title, body }, i) => (
          <li
            key={title}
            className="relative rounded-[20px] p-5 pt-8"
            style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <div className="font-display mb-3 text-[30px] leading-none" style={{ color: 'rgba(255,255,255,0.14)' }}>
              0{i + 1}
            </div>
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: 'rgba(0,245,212,0.1)', border: '1px solid rgba(0,245,212,0.25)' }}>
              <Icon size={16} strokeWidth={2} color="#00F5D4" />
            </div>
            <div className="font-heading mb-1.5 text-[13.5px] font-bold leading-snug" style={{ color: '#FFFFFF' }}>
              {title}
            </div>
            <p className="text-[12px] leading-[1.65]" style={{ color: '#A7A8B5' }}>
              {body}
            </p>
          </li>
        ))}
      </ol>

      <div className="mt-9 text-center">
        <Link
          href={hostStartHref(user)}
          className="inline-flex items-center gap-2 rounded-full px-7 py-3 text-sm font-bold transition-all duration-200 active:scale-95"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#FFFFFF' }}
        >
          Create your event
          <span style={{ color: '#FF2D95' }}>→</span>
        </Link>
      </div>
    </section>
  );
}