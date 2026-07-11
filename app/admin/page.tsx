'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, Ban, RotateCcw } from 'lucide-react';
import BackButton from '@/components/BackButton';
import { useParties } from '@/lib/hooks/useParties';
import { updatePartyStatus } from '@/lib/queries';
import { useLagosLiveStore } from '@/lib/store';
import type { Party, PartyStatus } from '@/lib/types';

const STATUS_STYLE: Record<PartyStatus, { label: string; bg: string; color: string }> = {
  pending: { label: 'Pending Review', bg: 'rgba(255,197,103,0.22)', color: '#9A6A00' },
  approved: { label: 'Live', bg: 'rgba(0,153,94,0.14)', color: '#00995E' },
  rejected: { label: 'Rejected', bg: 'rgba(214,64,44,0.12)', color: '#D6402C' },
  suspended: { label: 'Suspended', bg: 'rgba(214,64,44,0.12)', color: '#D6402C' },
};

function ActionButton({
  icon,
  label,
  onClick,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  tone: 'positive' | 'negative' | 'neutral';
}) {
  const colors = {
    positive: { bg: 'rgba(0,153,94,0.1)', border: 'rgba(0,153,94,0.3)', color: '#00995E' },
    negative: { bg: 'rgba(214,64,44,0.1)', border: 'rgba(214,64,44,0.3)', color: '#D6402C' },
    neutral: { bg: 'var(--c-glass)', border: 'var(--c-border3)', color: 'var(--c-text-muted)' },
  }[tone];
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-[10px] border px-3 py-2 text-[12px] font-semibold transition-transform duration-150 active:scale-95"
      style={{ background: colors.bg, borderColor: colors.border, color: colors.color }}
    >
      {icon}
      {label}
    </button>
  );
}

function EventRow({ party, onSetStatus }: { party: Party; onSetStatus: (id: number, status: PartyStatus) => void }) {
  const statusStyle = STATUS_STYLE[party.status];
  return (
    <div className="rounded-xl border p-4" style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate font-heading text-sm font-bold" style={{ color: 'var(--c-text)' }}>{party.title}</div>
          <div className="text-xs" style={{ color: 'var(--c-text-faint)' }}>
            {party.date} · {party.time} · by {party.organizer}
          </div>
        </div>
        <span className="flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: statusStyle.bg, color: statusStyle.color }}>
          {statusStyle.label}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {party.status === 'pending' && (
          <>
            <ActionButton icon={<Check size={13} strokeWidth={2.5} />} label="Approve" tone="positive" onClick={() => onSetStatus(party.id, 'approved')} />
            <ActionButton icon={<X size={13} strokeWidth={2.5} />} label="Reject" tone="negative" onClick={() => onSetStatus(party.id, 'rejected')} />
          </>
        )}
        {party.status === 'approved' && (
          <ActionButton icon={<Ban size={13} strokeWidth={2.5} />} label="Suspend" tone="negative" onClick={() => onSetStatus(party.id, 'suspended')} />
        )}
        {(party.status === 'suspended' || party.status === 'rejected') && (
          <ActionButton icon={<RotateCcw size={13} strokeWidth={2.5} />} label="Reinstate" tone="positive" onClick={() => onSetStatus(party.id, 'approved')} />
        )}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const user = useLagosLiveStore((s) => s.user);
  const authLoading = useLagosLiveStore((s) => s.authLoading);
  const { parties: fetchedParties } = useParties();
  const [parties, setParties] = useState<Party[]>([]);

  useEffect(() => {
    if (!authLoading && (!user || !user.isAdmin)) router.replace('/');
  }, [authLoading, user, router]);

  useEffect(() => {
    setParties(fetchedParties);
  }, [fetchedParties]);

  if (!user || !user.isAdmin) return null;

  const setStatus = async (id: number, status: PartyStatus) => {
    setParties((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
    try {
      await updatePartyStatus(id, status);
    } catch {
      setParties(fetchedParties); // roll back to last known-good server state
    }
  };

  const pending = parties.filter((p) => p.status === 'pending');
  const rest = parties.filter((p) => p.status !== 'pending').sort((a, b) => b.id - a.id);

  return (
    <div className="mx-auto max-w-[640px] animate-fade-in">
      <div
        className="sticky top-0 z-40 flex items-center gap-3 border-b px-5 py-3.5 backdrop-blur-[22px] backdrop-saturate-150"
        style={{ background: 'var(--c-header)', borderColor: 'var(--c-border)' }}
      >
        <BackButton href="/host" />
        <span className="font-heading text-[13px] font-bold uppercase tracking-[1px]" style={{ color: 'var(--c-text)' }}>
          Admin — Event Moderation
        </span>
      </div>

      <div className="p-5">
        <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[1.3px]" style={{ color: 'var(--c-text-muted)' }}>
          Pending Review ({pending.length})
        </div>
        <div className="mb-6 flex flex-col gap-2.5">
          {pending.length === 0 ? (
            <div className="text-sm" style={{ color: 'var(--c-text-faint)' }}>Nothing waiting on review.</div>
          ) : (
            pending.map((p) => <EventRow key={p.id} party={p} onSetStatus={setStatus} />)
          )}
        </div>

        <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[1.3px]" style={{ color: 'var(--c-text-muted)' }}>
          All Other Events
        </div>
        <div className="flex flex-col gap-2.5">
          {rest.map((p) => (
            <EventRow key={p.id} party={p} onSetStatus={setStatus} />
          ))}
        </div>
      </div>
    </div>
  );
}
