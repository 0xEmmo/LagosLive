'use client';

import Link from 'next/link';
import { CalendarPlus, Search } from 'lucide-react';
import { hostStartHref } from '@/lib/data';
import { useLagosLiveStore } from '@/lib/store';

export default function FinalCta() {
  const user = useLagosLiveStore((s) => s.user);

  return (
    <section className="mx-auto max-w-[1080px] px-5 pb-14 pt-4 md:pb-16">
      <div
        className="relative overflow-hidden rounded-[30px] px-6 py-14 text-center md:py-20"
        style={{
          background:
            'radial-gradient(ellipse 70% 60% at 50% 0%, rgba(255,45,149,0.18) 0%, transparent 60%), radial-gradient(ellipse 50% 50% at 85% 90%, rgba(0,191,255,0.12) 0%, transparent 60%), #171725',
          border: '1px solid rgba(255,45,149,0.28)',
        }}
      >
        <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={{ background: 'linear-gradient(135deg, #FF2D95, #8A2BE2 45%, #00BFFF)' }} />
        <div className="relative z-[1] mx-auto max-w-[520px]">
          <h2 className="font-display mb-3 text-[38px] leading-[1] tracking-[1px] md:text-[54px]" style={{ color: '#FFFFFF' }}>
            Lagos is always <span className="gradient-text">live</span>
          </h2>
          <p className="mx-auto mb-7 max-w-[400px] text-[14.5px] leading-[1.7]" style={{ color: '#A7A8B5' }}>
            Host your event and get booked out. Find your next night out and get tickets in seconds.
          </p>
          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href={hostStartHref(user)}
              className="btn-primary flex items-center justify-center gap-2 px-7 py-3.5 text-sm font-bold"
            >
              <CalendarPlus size={16} strokeWidth={2} />
              Host an Event
            </Link>
            <Link
              href="/events"
              className="flex items-center justify-center gap-2 rounded-[14px] bg-white px-7 py-3.5 text-sm font-bold transition-all duration-200 active:scale-95"
              style={{ color: '#0A0A12' }}
            >
              <Search size={16} strokeWidth={2} />
              Find an Event
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}