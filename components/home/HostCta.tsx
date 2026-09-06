'use client';

import Link from 'next/link';
import { CalendarHeart, ArrowUpRight } from 'lucide-react';
import { hostStartHref } from '@/lib/data';
import { useLagosLiveStore } from '@/lib/store';

export default function HostCta() {
  const user = useLagosLiveStore((s) => s.user);

  return (
    <section className="mx-auto max-w-[1080px] px-5 py-6 md:py-10">
      <Link
        href={hostStartHref(user)}
        className="group relative block overflow-hidden rounded-[28px] p-7 transition-all duration-300 hover:border-[#FF2D95]/50 md:p-12"
        style={{
          background: 'linear-gradient(135deg, rgba(255,45,149,0.16), rgba(138,43,226,0.12) 55%, rgba(0,191,255,0.07))',
          border: '1px solid rgba(255,45,149,0.28)',
        }}
      >
        <div
          className="pointer-events-none absolute -right-10 -top-14 h-[240px] w-[240px] rounded-full transition-transform duration-500 group-hover:scale-125"
          style={{ background: 'radial-gradient(circle, rgba(255,45,149,0.3), transparent)', filter: 'blur(22px)' }}
        />
        <div className="relative z-[1] flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <CalendarHeart size={18} strokeWidth={2} style={{ color: '#FF2D95' }} />
              <span className="text-[11px] font-bold uppercase tracking-[1.2px]" style={{ color: '#FF5CAD' }}>
                Hosts
              </span>
            </div>
            <h2 className="font-display text-[34px] leading-[1] tracking-[1px] md:text-[46px]" style={{ color: '#FFFFFF' }}>
              Your next event starts <span className="gradient-text">here</span>
            </h2>
            <p className="mt-2 max-w-[380px] text-[14px] leading-[1.7]" style={{ color: '#A7A8B5' }}>
              Create an event in minutes and put it in front of thousands of people looking for something to do in Lagos.
            </p>
          </div>
          <span
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-full px-6 py-3 text-sm font-bold text-white transition-all duration-200 active:scale-95"
            style={{ background: 'linear-gradient(135deg,#FF2D95,#8A2BE2)', boxShadow: '0 10px 28px rgba(255,45,149,0.35)' }}
          >
            Create Your Event
            <ArrowUpRight size={15} strokeWidth={2.5} />
          </span>
        </div>
      </Link>
    </section>
  );
}