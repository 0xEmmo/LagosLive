'use client';

import Link from 'next/link';
import { CalendarPlus, TicketPercent, Share2, ScanLine, LineChart, Wallet } from 'lucide-react';
import { hostStartHref } from '@/lib/data';
import { useLagosLiveStore } from '@/lib/store';

const FEATURES = [
  {
    icon: CalendarPlus,
    title: 'Create in minutes',
    body: 'Set your event details, add multiple ticket types and pick your price — all from your phone. No tech skills needed.',
  },
  {
    icon: TicketPercent,
    title: 'Sell tickets your way',
    body: 'Multiple ticket tiers with their own prices and quantities, plus promo codes for discounts. Free events cost nothing to run.',
  },
  {
    icon: Share2,
    title: 'Reach people instantly',
    body: 'Get a shareable event page and link. Promote it on WhatsApp, Instagram or X — sales land straight in your dashboard.',
  },
  {
    icon: ScanLine,
    title: 'Check in at the door',
    body: 'Every ticket carries a unique QR code. Scan it from the check-in screen so you always know who&apos;s inside.',
  },
  {
    icon: LineChart,
    title: 'Track your sales',
    body: 'Follow ticket sales and revenue live per event. See what&apos;s working and what needs a push before the big night.',
  },
  {
    icon: Wallet,
    title: 'Get paid, simply',
    body: 'Confirmed ticket revenue is paid out to your verified account. Free events cost nothing; ticketed events simply carry a 5% + ₦100 fee per paid ticket.',
  },
];

export default function OrganizerFeatures() {
  const user = useLagosLiveStore((s) => s.user);

  return (
    <section id="for-hosts" className="relative scroll-mt-20 overflow-hidden py-14 md:py-20">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(138,43,226,0.12) 0%, transparent 60%), radial-gradient(ellipse 40% 40% at 90% 80%, rgba(255,45,149,0.06) 0%, transparent 60%)',
        }}
      />
      <div className="relative z-[1] mx-auto max-w-[1080px] px-5">
        <div className="mb-10 flex flex-col items-center text-center">
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5" style={{ background: 'rgba(255,45,149,0.1)', border: '1px solid rgba(255,45,149,0.22)' }}>
            <span className="text-[10px] font-bold uppercase tracking-[1.2px]" style={{ color: '#FF5CAD' }}>
              For hosts
            </span>
          </div>
          <h2 className="font-display mb-3 text-[34px] leading-[1] tracking-[1px] md:text-[48px]" style={{ color: '#FFFFFF' }}>
            Run your event like a <span className="gradient-text">pro</span>
          </h2>
          <p className="max-w-[460px] text-[14.5px] leading-[1.7]" style={{ color: '#A7A8B5' }}>
            Everything you need to create, sell, promote, check in and get paid for your next event.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-[22px] p-6 transition-all duration-300 hover:-translate-y-0.5"
              style={{ background: '#171725', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: 'linear-gradient(135deg,#FF2D95,#8A2BE2)', boxShadow: '0 8px 22px rgba(255,45,149,0.3)' }}>
                <Icon size={20} strokeWidth={2} color="#FFFFFF" />
              </div>
              <h3 className="font-heading mb-2 text-[15.5px] font-bold" style={{ color: '#FFFFFF' }}>
                {title}
              </h3>
              <p className="text-[13px] leading-[1.7]" style={{ color: '#A7A8B5' }}>
                {body}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-center gap-3">
          <Link href={hostStartHref(user)} className="btn-primary flex items-center gap-2 px-8 py-3.5 text-sm font-bold">
            Start hosting — it&apos;s free
          </Link>
          <p className="text-[12px]" style={{ color: '#6B6C80' }}>
            Create an account, set up your event and start selling today.
          </p>
        </div>
      </div>
    </section>
  );
}