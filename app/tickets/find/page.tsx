'use client';

import BackButton from '@/components/BackButton';
import GuestFind from '@/components/GuestFind';

// Standalone guest ticket recovery page. Always shows the email + order
// reference lookup, regardless of sign-in state, so the route is directly
// linkable (e.g. from footers and the checkout success screen).

export default function FindTicketPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-[520px] flex-col animate-fade-in">
      <div
        className="sticky top-0 z-40 flex items-center gap-3 border-b px-5 py-3.5 backdrop-blur-[22px] backdrop-saturate-150"
        style={{ background: 'var(--c-header)', borderColor: 'rgba(255,255,255,0.04)' }}
      >
        <BackButton href="/tickets" />
        <span className="font-heading text-[13px] font-bold uppercase tracking-[1px]" style={{ color: '#FFFFFF' }}>
          Find My Ticket
        </span>
      </div>

      <GuestFind />
    </div>
  );
}