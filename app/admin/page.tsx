'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, X, Ban, RotateCcw, Eye, Pencil, Trash2, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import BackButton from '@/components/BackButton';
import PartyPhoto from '@/components/PartyPhoto';
import { partyPhoto, VC } from '@/lib/data';
import { useParties } from '@/lib/hooks/useParties';
import { updatePartyStatus, deleteParty } from '@/lib/queries';
import { useLagosLiveStore } from '@/lib/store';
import type { Party, PartyStatus } from '@/lib/types';

const STATUS_STYLE: Record<PartyStatus, { label: string; bg: string; color: string }> = {
  pending: { label: 'Pending Review', bg: 'rgba(255,214,0,0.1)', color: '#FFD600' },
  approved: { label: 'Live', bg: 'rgba(0,245,212,0.08)', color: '#00F5D4' },
  rejected: { label: 'Rejected', bg: 'rgba(255,138,0,0.08)', color: '#FF8A00' },
  suspended: { label: 'Suspended', bg: 'rgba(255,138,0,0.08)', color: '#FF8A00' },
};

const STATUS_TOAST: Record<PartyStatus, { title: string; subtitle: string }> = {
  approved: { title: 'Event approved', subtitle: 'The event is now live and publicly visible.' },
  rejected: { title: 'Event rejected', subtitle: 'The event won\'t appear on the public site.' },
  suspended: { title: 'Event suspended', subtitle: 'The event is hidden from the public until reinstated.' },
  pending: { title: 'Status updated', subtitle: 'The event is back to pending review.' },
};

type Tone = 'positive' | 'negative' | 'neutral';

const TONE_COLORS: Record<Tone, { bg: string; border: string; color: string }> = {
  positive: { bg: 'rgba(0,245,212,0.08)', border: 'rgba(0,245,212,0.2)', color: '#00F5D4' },
  negative: { bg: 'rgba(255,138,0,0.08)', border: 'rgba(255,138,0,0.2)', color: '#FF8A00' },
  neutral: { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)', color: '#A7A8B5' },
};

const actionClass =
  'flex items-center gap-1.5 rounded-[10px] border px-3 py-2 text-[12px] font-semibold transition-all duration-200 active:scale-95';

function ActionButton({ icon, label, onClick, tone }: { icon: React.ReactNode; label: string; onClick: () => void; tone: Tone }) {
  const colors = TONE_COLORS[tone];
  return (
    <button onClick={onClick} className={actionClass} style={{ background: colors.bg, borderColor: colors.border, color: colors.color }}>
      {icon}
      {label}
    </button>
  );
}

function ActionLink({ icon, label, href, tone }: { icon: React.ReactNode; label: string; href: string; tone: Tone }) {
  const colors = TONE_COLORS[tone];
  return (
    <Link href={href} className={actionClass} style={{ background: colors.bg, borderColor: colors.border, color: colors.color }}>
      {icon}
      {label}
    </Link>
  );
}

function StatusBadge({ status }: { status: PartyStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span className="flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function DetailItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-[0.7px]" style={{ color: '#6B6C80' }}>{label}</div>
      <div className="truncate text-[12.5px] font-medium" style={{ color: color ?? '#FFFFFF' }}>{value || '—'}</div>
    </div>
  );
}

// Rich card used for events waiting on review — shows every field an admin needs
// to make the approve/reject call without leaving the list.
function PendingCard({
  party,
  onSetStatus,
  onDelete,
}: {
  party: Party;
  onSetStatus: (id: number, status: PartyStatus) => void;
  onDelete: (party: Party) => void;
}) {
  return (
    <div
      className="overflow-hidden rounded-2xl"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,214,0,0.14)' }}
    >
      <div className="flex gap-3.5 p-4 pb-3">
        <div className="relative h-[76px] w-[76px] flex-shrink-0 overflow-hidden rounded-[12px]" style={{ background: party.gradient }}>
          <PartyPhoto src={partyPhoto(party.id)} alt={party.title} gradient={party.gradient} sizes="76px" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-heading text-[15px] font-bold leading-tight" style={{ color: '#FFFFFF' }}>
                {party.title}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px]" style={{ color: '#A7A8B5' }}>
                <span className="flex items-center gap-1 font-semibold" style={{ color: VC[party.vibe] }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: VC[party.vibe] }} />
                  {party.vibe}
                </span>
                <span>{party.date}</span>
                <span>{party.time}</span>
              </div>
            </div>
            <StatusBadge status={party.status} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 px-4 sm:grid-cols-3">
        <DetailItem label="Venue" value={party.location} />
        <DetailItem label="Address" value={party.address} />
        <DetailItem label="Organizer" value={party.organizer} />
        <DetailItem label="Entry" value={party.feeNum === 0 ? 'Free Entry' : party.fee} color="#FF2D95" />
        <DetailItem label="Capacity" value={`${party.capacity} · ${party.spotsLeft} left`} />
        <DetailItem label="Rides / Distance" value={`${party.distance} km away`} color="#00BFFF" />
      </div>

      <p className="px-4 pt-3 text-[12.5px] leading-relaxed line-clamp-3" style={{ color: '#A7A8B5' }}>
        {party.description}
      </p>

      <div className="flex flex-wrap gap-2 p-4 pt-3">
        <ActionLink icon={<Eye size={13} strokeWidth={2} />} label="Preview" href={`/party/${party.id}`} tone="neutral" />
        <ActionLink icon={<Pencil size={13} strokeWidth={2} />} label="Edit" href={`/host/${party.id}/edit`} tone="neutral" />
        <div className="ml-auto flex flex-wrap gap-2">
          <ActionButton icon={<Check size={13} strokeWidth={2} />} label="Approve" tone="positive" onClick={() => onSetStatus(party.id, 'approved')} />
          <ActionButton icon={<X size={13} strokeWidth={2} />} label="Reject" tone="negative" onClick={() => onSetStatus(party.id, 'rejected')} />
        </div>
      </div>
    </div>
  );
}

function EventRow({
  party,
  onSetStatus,
  onDelete,
}: {
  party: Party;
  onSetStatus: (id: number, status: PartyStatus) => void;
  onDelete: (party: Party) => void;
}) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate font-heading text-sm font-bold" style={{ color: '#FFFFFF' }}>{party.title}</div>
          <div className="text-xs" style={{ color: '#A7A8B5' }}>
            {party.date} · {party.time} · by {party.organizer}
          </div>
        </div>
        <StatusBadge status={party.status} />
      </div>
      <div className="flex flex-wrap gap-2">
        <ActionLink icon={<Eye size={13} strokeWidth={2} />} label="View" href={`/party/${party.id}`} tone="neutral" />
        <ActionLink icon={<Pencil size={13} strokeWidth={2} />} label="Edit" href={`/host/${party.id}/edit`} tone="neutral" />
        {party.status === 'approved' && (
          <ActionButton icon={<Ban size={13} strokeWidth={2} />} label="Suspend" tone="negative" onClick={() => onSetStatus(party.id, 'suspended')} />
        )}
        {(party.status === 'suspended' || party.status === 'rejected') && (
          <ActionButton icon={<RotateCcw size={13} strokeWidth={2} />} label="Reinstate" tone="positive" onClick={() => onSetStatus(party.id, 'approved')} />
        )}
        {party.status === 'pending' && (
          <>
            <ActionButton icon={<Check size={13} strokeWidth={2} />} label="Approve" tone="positive" onClick={() => onSetStatus(party.id, 'approved')} />
            <ActionButton icon={<X size={13} strokeWidth={2} />} label="Reject" tone="negative" onClick={() => onSetStatus(party.id, 'rejected')} />
          </>
        )}
        <ActionButton icon={<Trash2 size={13} strokeWidth={2} />} label="Delete" tone="negative" onClick={() => onDelete(party)} />
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-2.5">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-[104px] animate-pulse rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }} />
      ))}
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const user = useLagosLiveStore((s) => s.user);
  const authLoading = useLagosLiveStore((s) => s.authLoading);
  const showToast = useLagosLiveStore((s) => s.showToast);
  const { parties: fetchedParties, loading, error, retry } = useParties();
  const [parties, setParties] = useState<Party[]>([]);

  useEffect(() => {
    if (!authLoading && (!user || !user.isAdmin)) router.replace('/');
  }, [authLoading, user, router]);

  useEffect(() => {
    setParties(fetchedParties);
  }, [fetchedParties]);

  if (!user || !user.isAdmin) return null;

  const setStatus = async (id: number, status: PartyStatus) => {
    const party = parties.find((p) => p.id === id);
    if (!party) return;
    if (status === 'rejected' && !confirm(`Reject "${party.title}"? It won't be visible to the public.`)) return;
    if (status === 'suspended' && !confirm(`Suspend "${party.title}"? It will be hidden from the public until you reinstate it.`)) return;
    const prev = parties;
    setParties((p) => p.map((x) => (x.id === id ? { ...x, status } : x)));
    try {
      await updatePartyStatus(id, status);
      const toast = STATUS_TOAST[status];
      showToast(toast.title, toast.subtitle);
    } catch {
      setParties(prev);
      showToast('Something went wrong', "Couldn't update the event status. Try again.");
    }
  };

  const remove = async (party: Party) => {
    if (!confirm(`Delete "${party.title}" permanently? This can't be undone.`)) return;
    const prev = parties;
    setParties((p) => p.filter((x) => x.id !== party.id));
    try {
      await deleteParty(party.id);
      showToast('Event deleted', `"${party.title}" was permanently deleted.`);
    } catch (err) {
      setParties(prev);
      showToast(
        'Something went wrong',
        err instanceof Error && err.message.includes('foreign key')
          ? "Can't delete — this event already has ticket orders. Suspend it instead."
          : 'The event could not be deleted. Try again.'
      );
    }
  };

  const pending = parties.filter((p) => p.status === 'pending');
  const rest = parties.filter((p) => p.status !== 'pending').sort((a, b) => b.id - a.id);

  return (
    <div className="mx-auto max-w-[680px] animate-fade-in">
      <div
        className="sticky top-0 z-40 flex items-center gap-3 border-b px-5 py-3.5 backdrop-blur-[22px] backdrop-saturate-150"
        style={{ background: 'var(--c-header)', borderColor: 'rgba(255,255,255,0.04)' }}
      >
        <BackButton href="/host" />
        <span className="font-heading text-[13px] font-bold uppercase tracking-[1px]" style={{ color: '#FFFFFF' }}>
          Admin — Event Moderation
        </span>
        {pending.length > 0 && (
          <span
            className="ml-auto rounded-full px-2.5 py-1 text-[11px] font-bold"
            style={{ background: 'rgba(255,214,0,0.12)', border: '1px solid rgba(255,214,0,0.3)', color: '#FFD600' }}
          >
            {pending.length} pending
          </span>
        )}
      </div>

      <div className="p-5">
        <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[1.3px]" style={{ color: '#A7A8B5' }}>
          Pending Review ({pending.length})
        </div>

        {loading ? (
          <div className="mb-6">
            <LoadingSkeleton />
          </div>
        ) : error ? (
          <div className="mb-6 flex flex-col items-center gap-3 rounded-2xl px-6 py-10 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,138,0,0.2)' }}>
            <AlertTriangle size={26} strokeWidth={1.5} color="#FF8A00" />
            <div className="text-sm" style={{ color: '#A7A8B5' }}>
              Couldn&apos;t load events. Check your connection and try again.
            </div>
            <button onClick={retry} className="flex items-center gap-2 rounded-[10px] px-4 py-2 text-[13px] font-semibold" style={{ background: 'rgba(255,138,0,0.12)', border: '1px solid rgba(255,138,0,0.3)', color: '#FF8A00' }}>
              <RefreshCw size={13} strokeWidth={2.5} />
              Retry
            </button>
          </div>
        ) : pending.length === 0 ? (
          <div className="mb-6 flex flex-col items-center gap-3 rounded-2xl px-6 py-10 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full" style={{ background: 'rgba(0,245,212,0.08)', border: '1px solid rgba(0,245,212,0.2)' }}>
              <CheckCircle2 size={24} strokeWidth={2} color="#00F5D4" />
            </div>
            <div className="font-display text-[24px] tracking-[1px]" style={{ color: '#FFFFFF' }}>
              All caught up
            </div>
            <div className="max-w-[260px] text-sm" style={{ color: '#A7A8B5' }}>
              Nothing waiting on review. New organizer submissions land here.
            </div>
          </div>
        ) : (
          <div className="mb-6 flex flex-col gap-2.5">
            {pending.map((p) => (
              <PendingCard key={p.id} party={p} onSetStatus={setStatus} onDelete={remove} />
            ))}
          </div>
        )}

        <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[1.3px]" style={{ color: '#A7A8B5' }}>
          All Other Events
        </div>
        {loading ? (
          <LoadingSkeleton />
        ) : error ? (
          <div className="text-sm" style={{ color: '#6B6C80' }}>
            Couldn&apos;t load events.
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {rest.map((p) => (
              <EventRow key={p.id} party={p} onSetStatus={setStatus} onDelete={remove} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
