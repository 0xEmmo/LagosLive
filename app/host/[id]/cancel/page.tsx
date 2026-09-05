'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, notFound } from 'next/navigation';
import { AlertTriangle, CalendarDays, Loader2, Users } from 'lucide-react';
import BackButton from '@/components/BackButton';
import { useParty } from '@/lib/hooks/useParty';
import { fetchOrganizerOrderStats, type OrganizerPartyStats } from '@/lib/queries';
import { formatNaira } from '@/lib/filters';
import { useLagosLiveStore } from '@/lib/store';

export default function CancelEventPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const user = useLagosLiveStore((s) => s.user);
  const authLoading = useLagosLiveStore((s) => s.authLoading);
  const showToast = useLagosLiveStore((s) => s.showToast);
  const { party, loading } = useParty(Number(params.id));

  const [reason, setReason] = useState('');
  const [stats, setStats] = useState<OrganizerPartyStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login?next=' + encodeURIComponent(`/host/${params.id}/cancel`));
  }, [authLoading, user, router, params.id]);

  useEffect(() => {
    if (!party || !user) return;
    if (party.createdBy !== user.id) {
      router.replace('/host');
      return;
    }
    fetchOrganizerOrderStats([party.id])
      .then((s) => setStats(s[party.id] ?? null))
      .catch(() => setStats(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [party]);

  const handleCancel = async () => {
    if (!reason.trim()) {
      showToast('Add a reason', 'Please provide a reason for cancellation before continuing.');
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch('/api/host/cancel-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: params.id, reason: reason.trim() }),
      });
      const json = (await response.json()) as { success?: boolean; refunded_count?: number; error?: string };
      if (!response.ok || !json.success) throw new Error(json.error ?? 'Cancellation failed');
      showToast('Event cancelled', `${json.refunded_count ?? 0} ${(json.refunded_count ?? 0) === 1 ? 'guest was' : 'guests were'} refunded.`);
      router.push('/host');
    } catch (err) {
      console.error('[cancel-event] page error', err);
      showToast('Could not cancel', err instanceof Error ? err.message : 'Please try again.');
      setIsLoading(false);
    }
  };

  if (!user) {
    if (authLoading) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 size={26} strokeWidth={2} color="#FF2D95" className="animate-spin" />
        </div>
      );
    }
    return null;
  }

  if (!party) {
    if (loading) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 size={26} strokeWidth={2} color="#FF2D95" className="animate-spin" />
        </div>
      );
    }
    notFound();
  }

  if (party.createdBy !== user.id) return null;

  const confirmedCount = stats?.ordersCount ?? 0;

  return (
    <div className="mx-auto max-w-[600px] animate-fade-in pb-24">
      <div
        className="sticky top-0 z-40 flex items-center gap-3 border-b px-5 py-3.5 backdrop-blur-[22px] backdrop-saturate-150"
        style={{ background: 'var(--c-header)', borderColor: 'rgba(255,255,255,0.04)' }}
      >
        <BackButton href={`/host/${party.id}`} />
        <span className="font-heading text-[13px] font-bold uppercase tracking-[1px]" style={{ color: '#FFFFFF' }}>
          Cancel Event
        </span>
      </div>

      <div className="flex flex-col gap-5 p-5">
        {party.cancelledAt ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl px-6 py-14 text-center" style={{ background: 'rgba(255,45,149,0.05)', border: '1px solid rgba(255,45,149,0.2)' }}>
            <div className="flex h-[64px] w-[64px] items-center justify-center rounded-full" style={{ background: 'rgba(255,45,149,0.1)' }}>
              <CalendarDays size={28} strokeWidth={1.5} color="#FF2D95" />
            </div>
            <div className="font-display text-[26px] tracking-[1px]" style={{ color: '#FFFFFF' }}>
              Event already cancelled
            </div>
            <Link href="/host" className="btn-primary px-7 py-3 text-sm font-semibold">
              Back to Dashboard
            </Link>
          </div>
        ) : (
          <>
            {/* Event summary */}
            <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,45,149,0.16)' }}>
              <div className="font-heading text-[18px] font-bold" style={{ color: '#FFFFFF' }}>{party.title}</div>
              <div className="mt-1 text-[12px]" style={{ color: '#A7A8B5' }}>{party.date} · {party.time}</div>
              <div className="mt-1 text-[12px]" style={{ color: '#A7A8B5' }}>{party.location}</div>
              <div className="mt-3 flex items-center gap-2 text-[12px]" style={{ color: '#A7A8B5' }}>
                <Users size={13} strokeWidth={2} color="#FF2D95" />
                {confirmedCount} {confirmedCount === 1 ? 'guest' : 'guests'} to refund
                {confirmedCount > 0 && (
                  <span style={{ color: '#6B6C80' }}>
                    · {formatNaira(stats?.revenue ?? 0)} refunded
                  </span>
                )}
              </div>
            </div>

            {/* Reason */}
            <div>
              <label className="mb-2 block text-[11px] font-bold uppercase tracking-[1.2px]" style={{ color: '#A7A8B5' }}>
                Reason for Cancellation
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value.slice(0, 500))}
                placeholder="e.g., Venue unavailable, Artist cancelled, Weather, Other"
                rows={4}
                className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all duration-200"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#FFFFFF' }}
              />
              <p className="mt-1.5 text-xs" style={{ color: '#6B6C80' }}>
                {reason.length}/500 — guests will see this reason in their refund notification.
              </p>
            </div>

            {/* Warning */}
            <div className="rounded-xl p-4" style={{ background: 'rgba(255,45,149,0.08)', border: '1px solid rgba(255,45,149,0.25)' }}>
              <div className="flex items-start gap-2.5">
                <AlertTriangle size={16} strokeWidth={2} color="#FF2D95" className="mt-0.5 flex-shrink-0" />
                <p className="text-[13px] leading-[1.6]" style={{ color: '#F2A5C9' }}>
                  <strong style={{ color: '#FF2D95' }}>This action cannot be undone.</strong>{' '}
                  All guests will receive instant refunds and a cancellation email.
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2.5">
              <button
                onClick={handleCancel}
                disabled={isLoading || !reason.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-[14px] py-4 text-[13px] font-bold uppercase tracking-[0.5px] transition-all duration-200 disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg,#FF2D95,#8A2BE2)', color: '#FFFFFF', boxShadow: '0 10px 30px rgba(255,45,149,0.3)' }}
              >
                {isLoading ? (
                  <>
                    <Loader2 size={15} strokeWidth={2.5} className="animate-spin" />
                    Cancelling…
                  </>
                ) : (
                  'Cancel Event & Refund All Guests'
                )}
              </button>
              <Link
                href={`/host/${party.id}`}
                className="flex w-full items-center justify-center rounded-[14px] py-4 text-[13px] font-bold transition-all duration-200 active:scale-[0.98]"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#A7A8B5' }}
              >
                Go Back
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}