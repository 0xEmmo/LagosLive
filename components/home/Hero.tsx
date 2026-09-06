'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Image from 'next/image';
import { Sparkles, ArrowRight, Ticket, Search } from 'lucide-react';
import Marquee from '@/components/Marquee';
import { VC, VCB, VCT, VIBE_LABEL, partyPhoto, hostStartHref } from '@/lib/data';
import { sortByTrending } from '@/lib/filters';
import { useLagosLiveStore } from '@/lib/store';
import type { Party } from '@/lib/types';

interface HeroProps {
  parties: Party[];
  loading: boolean;
}

export default function Hero({ parties, loading }: HeroProps) {
  const user = useLagosLiveStore((s) => s.user);
  const router = useRouter();
  const [query, setQuery] = useState('');
  const featured =
    sortByTrending(parties).find((p) => !!partyPhoto(p.id, p.coverUrl)) ??
    (sortByTrending(parties)[0] as Party | undefined);

  const liveNow = !loading && parties.length > 0;
  const ticker = parties.slice(0, 12);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/events?q=${encodeURIComponent(q)}` : '/events');
  };

  return (
    <section className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 15% 35%, rgba(255,45,149,0.14) 0%, transparent 60%), radial-gradient(ellipse 60% 70% at 85% 25%, rgba(138,43,226,0.12) 0%, transparent 60%), radial-gradient(ellipse 50% 50% at 50% 100%, rgba(0,191,255,0.08) 0%, transparent 60%)',
        }}
      />

      <div className="relative z-[1] mx-auto max-w-[1080px] px-5 pb-10 pt-[40px] md:pt-[64px]">
        <div className="grid items-center gap-10 md:grid-cols-[1.05fr_0.95fr] md:gap-14">
          {/* Copy */}
          <div>
            <div
              className="mb-5 inline-flex items-center gap-2 rounded-full px-4 py-1.5"
              style={{ background: 'rgba(255,45,149,0.1)', border: '1px solid rgba(255,45,149,0.22)' }}
            >
              <div className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: '#FF2D95' }} />
                <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: '#FF2D95' }} />
              </div>
              <span className="text-[11px] font-bold uppercase tracking-[1.2px]" style={{ color: '#FF5CAD' }}>
                {loading ? 'Lagos Live is loading…' : liveNow ? `${parties.length} events live in Lagos` : 'The home of Lagos events'}
              </span>
            </div>

            <h1
              className="font-display mb-4 leading-[0.92] tracking-[1px]"
              style={{ fontSize: 'clamp(46px,11vw,92px)', fontWeight: 400 }}
            >
              <span style={{ color: '#FFFFFF' }}>Your event deserves </span>
              <span className="gradient-text">to be seen.</span>
            </h1>

            <p className="mb-6 max-w-[440px] text-[15.5px] leading-[1.65]" style={{ color: '#A7A8B5' }}>
              Create your event, sell tickets, manage your guests and get paid — all from one place.
            </p>

            <form
              onSubmit={submitSearch}
              className="mb-5 flex max-w-[440px] items-center gap-2 rounded-[14px] px-3.5 py-2.5 transition-all duration-200"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)' }}
            >
              <Search size={16} strokeWidth={2} style={{ color: '#6B6C80' }} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={(e) => {
                  e.currentTarget.parentElement!.style.borderColor = 'rgba(255,45,149,0.4)';
                }}
                onBlur={(e) => {
                  e.currentTarget.parentElement!.style.borderColor = 'rgba(255,255,255,0.12)';
                }}
                placeholder="Search events, venues, parties…"
                className="w-full bg-transparent text-sm outline-none"
                style={{ color: '#FFFFFF' }}
              />
              <button type="submit" className="rounded-[10px] px-3.5 py-2 text-[12.5px] font-bold text-white" style={{ background: 'linear-gradient(135deg,#FF2D95,#8A2BE2)' }}>
                Go
              </button>
            </form>

            <div className="mb-5 flex flex-col gap-2.5 sm:flex-row">
              <Link
                href={hostStartHref(user)}
                className="btn-primary flex items-center justify-center gap-2 px-7 py-3.5 text-sm font-bold"
              >
                Host an Event
                <ArrowRight size={15} strokeWidth={2.5} />
              </Link>
              <Link
                href="/events"
                className="flex items-center justify-center gap-2 rounded-[14px] px-7 py-3.5 text-sm font-bold transition-all duration-200 active:opacity-80"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#FFFFFF' }}
              >
                Explore Events
              </Link>
            </div>

            <p className="text-[12px] leading-relaxed" style={{ color: '#6B6C80' }}>
              No complicated setup. No technical skills required. Just create, share and sell.
            </p>
          </div>

          {/* Visual — a real featured event */}
          <div className="relative mx-auto w-full max-w-[420px]">
            {featured && (
              <Link
                href={`/party/${featured.id}`}
                className="relative block overflow-hidden rounded-[28px]"
                style={{
                  background: featured.gradient,
                  border: '1px solid rgba(255,255,255,0.1)',
                  boxShadow: '0 30px 80px rgba(0,0,0,0.55)',
                  aspectRatio: '4/5',
                }}
              >
                {(partyPhoto(featured.id, featured.coverUrl) && (
                  <Image
                    src={partyPhoto(featured.id, featured.coverUrl) as string}
                    alt={featured.title}
                    fill
                    priority
                    sizes="(max-width: 768px) 90vw, 420px"
                    className="object-cover"
                  />
                )) || (
                  <div
                    className="absolute inset-0 flex items-center justify-center"
                    style={{ background: `radial-gradient(circle at 30% 20%, rgba(255,255,255,0.18), transparent 55%), ${featured.gradient}` }}
                  >
                    <Image
                      src="/Lagos Live Skyline Bridge Logo.png"
                      alt=""
                      width={180}
                      height={102}
                      className="h-auto w-[52%] opacity-40"
                    />
                  </div>
                )}
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{ background: 'linear-gradient(to top, rgba(7,7,11,0.92) 0%, rgba(7,7,11,0.2) 55%, transparent 80%)' }}
                />
                <div className="absolute left-4 right-4 top-4 z-[1] flex items-center justify-between">
                  <span
                    className="rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.5px]"
                    style={{ background: VCB[featured.vibe], color: VCT[featured.vibe], border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}
                  >
                    {featured.vibe}
                  </span>
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold"
                    style={{ background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.15)', color: '#FFFFFF', backdropFilter: 'blur(8px)' }}
                  >
                    {VIBE_LABEL[featured.vibe]}
                  </span>
                </div>
                <div className="absolute bottom-4 left-4 right-4 z-[1]">
                  <div className="mb-1 text-[11px] font-semibold" style={{ color: '#00F5D4' }}>{featured.date}</div>
                  <div className="font-heading text-[19px] font-bold leading-tight" style={{ color: '#FFFFFF' }}>
                    {featured.title}
                  </div>
                  <div className="mt-1 text-[12px]" style={{ color: '#A7A8B5' }}>{featured.location}</div>
                </div>
              </Link>
            )}

            {/* Floating ticket chip */}
            <div
              className="absolute -left-3 -top-4 z-[2] flex items-center gap-2 rounded-2xl px-3.5 py-2.5"
              style={{ background: 'rgba(23,23,37,0.92)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 12px 30px rgba(0,0,0,0.45)', backdropFilter: 'blur(10px)' }}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: 'linear-gradient(135deg,#FF2D95,#8A2BE2)' }}>
                <Ticket size={15} strokeWidth={2} color="#FFFFFF" />
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.6px]" style={{ color: '#00F5D4' }}>Sell tickets</div>
                <div className="text-[11px]" style={{ color: '#A7A8B5' }}>5% + ₦100 per paid ticket</div>
              </div>
            </div>
            {/* Floating price chip — real event data only */}
            {featured && (
              <div
                className="absolute -bottom-4 -right-2 z-[2] rounded-2xl px-3.5 py-2.5 text-center"
                style={{ background: 'rgba(23,23,37,0.92)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 12px 30px rgba(0,0,0,0.45)', backdropFilter: 'blur(10px)' }}
              >
                <div className="font-heading text-[13px] font-bold gradient-text">{featured.fee}</div>
                <div className="text-[10px]" style={{ color: '#6B6C80' }}>From this event</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Real-event ticker */}
      {ticker.length > 0 && (
        <div className="relative z-[1] border-y py-2.5" style={{ borderColor: 'rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.015)' }}>
          <Marquee durationSeconds={38}>
            {ticker.map((p) => (
              <span key={p.id} className="flex items-center gap-2 whitespace-nowrap text-[12px] font-medium" style={{ color: '#A7A8B5' }}>
                <span className="h-[6px] w-[6px] rounded-full" style={{ background: VC[p.vibe] }} />
                {p.title}
                <Ticket size={11} strokeWidth={2} style={{ color: 'rgba(255,45,149,0.7)' }} />
                <span className="font-semibold" style={{ color: '#FFFFFF' }}>{p.fee}</span>
                <span style={{ color: 'rgba(255,255,255,0.12)' }}>·</span>
              </span>
            ))}
          </Marquee>
        </div>
      )}
    </section>
  );
}