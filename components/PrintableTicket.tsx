'use client';

import QRCode from 'react-qr-code';
import type { ReactNode } from 'react';
import { CheckCheck, Download, ShieldCheck } from 'lucide-react';
import PartyPhoto from '@/components/PartyPhoto';
import { Wordmark } from '@/components/Logo';
import { partyPhoto } from '@/lib/data';
import { formatNaira } from '@/lib/filters';
import { getTicketSkin } from '@/lib/ticket-skin';
import type { CustomerTicket } from '@/lib/types';

function EarlyBirdMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none">
      <path d="M3 14.5c2.5-.2 4.6-1.5 6.1-3.5 1.4-1.8 2.5-4.5 4.1-5.1 1.2-.5 2.3.1 2.5 1.3l.2 1.2 3.6-1.1-1.9 3.2 3.3 1.1-4.4 1.1c-.5 2.4-2.3 4.3-4.8 5.1-2.7.9-5.8.2-8.7-1.1l2.5-.8L3 14.5Z" fill="currentColor" />
      <circle cx="15.1" cy="7.7" r=".55" fill="currentColor" />
    </svg>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-[var(--pass-muted)]">{label}</div>
      <div className="mt-1 break-words text-[13px] font-bold leading-snug text-[var(--pass-fg)]">{children}</div>
    </div>
  );
}

export default function PrintableTicket({
  ticket,
  holder,
  used,
}: {
  ticket: CustomerTicket;
  holder: string;
  used: boolean;
}) {
  const { party } = ticket;
  const skin = getTicketSkin(ticket.ticketTypeName, party.gradient);

  return (
    <div id="ticket-print-area" className="ticket-print-area w-full max-w-[520px]">
      <div className="ticket-actions mb-5 flex flex-col items-center gap-2 text-center">
        <button
          type="button"
          onClick={() => window.print()}
          className="btn-primary inline-flex min-h-11 items-center gap-2 px-5 py-3 text-sm font-bold"
          aria-label="Download ticket as PDF or print"
        >
          <Download size={16} strokeWidth={2.5} />
          Download ticket
        </button>
        <p className="text-[11px]" style={{ color: 'var(--c-text-muted)' }}>Choose “Save as PDF” in your browser&apos;s print dialog.</p>
      </div>

      <article className="ticket-card ticket-pass overflow-hidden rounded-[26px] border shadow-[0_20px_60px_rgba(0,0,0,.22)]">
        <header className="ticket-pass-hero relative flex min-h-[236px] flex-col justify-between overflow-hidden px-5 py-5 sm:min-h-[270px] sm:px-7 sm:py-6">
          <div className="absolute inset-0 bg-[var(--pass-surface)]">
            <PartyPhoto src={partyPhoto(party.id, party.coverUrl)} alt={party.title} gradient={party.gradient} sizes="(max-width: 560px) 100vw, 520px" priority tone="editorial" />
          </div>
          <div className="ticket-pass-image-shade absolute inset-0" />
          <div className="relative z-10 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 rounded-full bg-black/35 px-3 py-2 text-white backdrop-blur-sm">
              <Wordmark size={20} />
              <span className="text-[9px] font-bold uppercase tracking-[0.18em]">Admit one pass</span>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.08em] text-emerald-700 shadow-sm">
              <ShieldCheck size={12} /> Confirmed
            </span>
          </div>
          <div className="relative z-10 max-w-[420px] text-white">
            <div className="text-[9px] font-extrabold uppercase tracking-[0.2em] text-white/75">You&apos;re going to</div>
            <h1 className="mt-2 break-words font-heading text-[32px] font-black uppercase leading-[0.98] tracking-[-0.025em] drop-shadow sm:text-[42px]">{party.title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-bold text-white/90">
              <span>{party.date}</span><span aria-hidden="true">·</span><span>{party.time}</span>
            </div>
          </div>
        </header>

        <section className="ticket-pass-details grid grid-cols-2 gap-x-5 gap-y-5 px-5 py-5 sm:px-7 sm:py-6">
          <Detail label="Venue">{party.location}</Detail>
          <Detail label="Ticket holder">{holder}</Detail>
          <Detail label="Address">{party.address || 'Lagos, Nigeria'}</Detail>
          <Detail label="Admission">{ticket.quantity} {ticket.quantity === 1 ? 'guest' : 'guests'}</Detail>
        </section>

        <div className="ticket-pass-perforation relative flex items-center justify-center border-y border-dashed px-5 py-2">
          <span className="text-[8px] font-extrabold uppercase tracking-[0.22em] text-[var(--pass-muted)]">Tear here · keep your stub</span>
        </div>

        <footer className="ticket-pass-stub grid grid-cols-[minmax(0,1fr)_132px] items-center gap-4 px-5 py-5 sm:grid-cols-[minmax(0,1fr)_148px] sm:gap-6 sm:px-7 sm:py-6">
          <div className="min-w-0">
            <div className="inline-flex max-w-full items-center gap-2 rounded-full px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.1em]" style={{ background: skin.stubBackground, color: skin.stubColor }}>
              <span className="truncate">{ticket.ticketTypeName}</span>
              {skin.kind === 'early' && <EarlyBirdMark />}
            </div>
            <div className="mt-4 text-[9px] font-extrabold uppercase tracking-[0.16em] text-[var(--pass-muted)]">Pass code</div>
            <div className="mt-1 break-all font-mono text-[11px] font-bold tracking-[0.035em] text-[var(--pass-fg)]">{ticket.orderRef}</div>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
              <Detail label="Paid">{ticket.total === 0 ? 'Free' : formatNaira(ticket.total)}</Detail>
              <Detail label="Ticket status">{used ? 'Already scanned' : 'Valid for entry'}</Detail>
            </div>
          </div>
          <div className="relative rounded-2xl border border-[var(--pass-border)] bg-white p-2.5 shadow-sm">
            <QRCode
              value={ticket.orderRef}
              size={128}
              fgColor="#101828"
              bgColor="#FFFFFF"
              style={{ display: 'block', width: '100%', height: 'auto' }}
              aria-label={`Scan ticket code ${ticket.orderRef} at the gate`}
            />
            {used && (
              <div className="absolute inset-1 flex items-center justify-center rounded-xl bg-white/80">
                <span className="-rotate-12 rounded-md border-2 border-red-600 px-2 py-1 text-xs font-black uppercase tracking-[0.12em] text-red-700">Used</span>
              </div>
            )}
            <div className="mt-2 text-center text-[8px] font-extrabold uppercase tracking-[0.12em] text-slate-500">{used ? 'Already scanned' : 'Scan at the gate'}</div>
          </div>
        </footer>

        <div className="ticket-pass-note flex items-start gap-2 border-t px-5 py-3 text-[10px] leading-relaxed sm:px-7">
          {used ? <CheckCheck size={14} className="mt-0.5 shrink-0" /> : <ShieldCheck size={14} className="mt-0.5 shrink-0" />}
          <span>{used ? `Scanned at the gate${ticket.checkedInAt ? ` on ${new Date(ticket.checkedInAt).toLocaleString()}` : ''}. This pass is no longer valid for entry.` : 'Keep your QR code private. Show it at the entrance for scanning; this pass is valid for the listed admission.'}</span>
        </div>
      </article>
    </div>
  );
}
