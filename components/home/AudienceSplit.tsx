'use client';

import Link from 'next/link';
import { CalendarPlus, Search, ArrowUpRight } from 'lucide-react';
import { hostStartHref } from '@/lib/data';
import { useLagosLiveStore } from '@/lib/store';

export default function AudienceSplit() {
  const user = useLagosLiveStore((s) => s.user);

  return (
    <section className="mx-auto max-w-[1080px] px-5 py-12 md:py-16">
      <h2 className="font-display mb-1 text-center text-[32px] leading-[1] tracking-[1px] md:text-[44px]" style={{ color: '#FFFFFF' }}>
        Whatever you&apos;re here for, <span className="gradient-text">you&apos;re in the right place.</span>
      </h2>
      <p className="mx-auto mb-8 max-w-[420px] text-center text-[14px] leading-[1.6]" style={{ color: '#A7A8B5' }}>
        Lagos Live is where Lagos events get hosted — and where Lagos finds something to do.
      </p>

      <div className="grid gap-4 md:grid-cols-2 md:gap-5">
        {/* Host card */}
        <div
          className="group relative overflow-hidden rounded-[24px] p-6 transition-all duration-300 hover:border-[#FF2D95]/40 md:p-8"
          style={{ background: '#171725', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div
            className="pointer-events-none absolute -right-10 -top-12 h-[180px] w-[180px] rounded-full transition-transform duration-300 group-hover:scale-110"
            style={{ background: 'radial-gradient(circle, rgba(255,45,149,0.22), transparent)', filter: 'blur(16px)' }}
          />
          <div
            className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl"
            style={{ background: 'linear-gradient(135deg,#FF2D95,#8A2BE2)', boxShadow: '0 10px 26px rgba(255,45,149,0.35)' }}
          >
            <CalendarPlus size={22} strokeWidth={2} color="#FFFFFF" />
          </div>
          <h3 className="font-display mb-2 text-[30px] tracking-[1px] md:text-[36px]" style={{ color: '#FFFFFF' }}>
            Hosting an event?
          </h3>
          <p className="mb-6 max-w-[320px] text-sm leading-[1.7]" style={{ color: '#A7A8B5' }}>
            Create your event in minutes. Set your ticket prices, share your link and track every sale.
          </p>
          <Link
            href={hostStartHref(user)}
            className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-[13px] font-bold text-white transition-all duration-200 active:opacity-80"
            style={{ background: 'linear-gradient(135deg,#FF2D95,#8A2BE2)' }}
          >
            Create an Event
            <ArrowUpRight size={14} strokeWidth={2.5} />
          </Link>
        </div>

        {/* Attendee card */}
        <div
          className="group relative overflow-hidden rounded-[24px] p-6 transition-all duration-300 hover:border-[#00BFFF]/40 md:p-8"
          style={{ background: '#171725', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div
            className="pointer-events-none absolute -right-10 -top-12 h-[180px] w-[180px] rounded-full transition-transform duration-300 group-hover:scale-110"
            style={{ background: 'radial-gradient(circle, rgba(0,191,255,0.2), transparent)', filter: 'blur(16px)' }}
          />
          <div
            className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl"
            style={{ background: 'rgba(0,191,255,0.12)', border: '1px solid rgba(0,191,255,0.3)' }}
          >
            <Search size={22} strokeWidth={2} color="#00BFFF" />
          </div>
          <h3 className="font-display mb-2 text-[30px] tracking-[1px] md:text-[36px]" style={{ color: '#FFFFFF' }}>
            Looking for something to do?
          </h3>
          <p className="mb-6 max-w-[320px] text-sm leading-[1.7]" style={{ color: '#A7A8B5' }}>
            Find parties, concerts, festivals, networking events and experiences happening around Lagos.
          </p>
          <Link
            href="/explore"
            className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-[13px] font-bold transition-all duration-200 active:opacity-80"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: '#00BFFF' }}
          >
            Explore Events
            <ArrowUpRight size={14} strokeWidth={2.5} />
          </Link>
        </div>
      </div>
    </section>
  );
}