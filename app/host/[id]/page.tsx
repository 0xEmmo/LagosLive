'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, notFound } from 'next/navigation';
import {
  Loader2,
  AlertTriangle,
  RefreshCw,
  Ticket,
  Wallet,
  Users,
  Clock,
  Hourglass,
  XCircle,
  Eye,
  Pencil,
  Share2,
  QrCode,
  MapPin,
  TrendingUp,
  Star,
  Send,
  BadgeCheck,
  PenLine,
  type LucideIcon,
} from 'lucide-react';
import BackButton from '@/components/BackButton';
import PartyPhoto from '@/components/PartyPhoto';
import SalesChart from '@/components/SalesChart';
import { fetchOrganizerEventAnalytics, partyShareUrl, fetchEventReviews, submitEventForReview, withdrawEvent, fetchPartyHostVerified, type OrganizerEventAnalytics } from '@/lib/queries';
import { formatNaira } from '@/lib/filters';
import { partyPhoto } from '@/lib/data';
import { useParty } from '@/lib/hooks/useParty';
import { useLagosLiveStore } from '@/lib/store';
import type { PartyStatus, Review } from '@/lib/types';

const STATUS_STYLE: Record<PartyStatus, { label: string; bg: string; color: string }> = {
  draft: { label: 'Draft', bg: 'rgba(255,255,255,0.08)', color: '#D5D6E0' },
  pending: { label: 'Pending Review', bg: 'rgba(255,214,0,0.1)', color: '#FFD600' },
  approved: { label: 'Live', bg: 'rgba(0,245,212,0.08)', color: '#00F5D4' },
  rejected: { label: 'Rejected', bg: 'rgba(255,138,0,0.08)', color: '#FF8A00' },
  suspended: { label: 'Suspended', bg: 'rgba(255,138,0,0.08)', color: '#FF8A00' },
};

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: LucideIcon; color: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.8px]" style={{ color: '#6B6C80' }}>{label}</span>
        <Icon size={14} strokeWidth={2} color={color} className="flex-shrink-0" />
      </div>
      <div className="font-display truncate text-[19px] leading-tight" style={{ color: '#FFFFFF' }}>{value}</div>
    </div>
  );
}

function ProgressBar({ sold, total, from, to }: { sold: number; total: number; from: string; to: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((sold / total) * 100)) : 0;
  return (
    <div className="h-[6px] w-full overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: `linear-gradient(to right, ${from}, ${to})` }} />
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-[190px] animate-pulse rounded-2xl" style={{ background: 'rgba(255,255,255,0.04)' }} />
      <div className="grid grid-cols-2 gap-2.5">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-[84px] animate-pulse rounded-2xl" style={{ background: 'rgba(255,255,255,0.04)' }} />
        ))}
      </div>
      <div className="h-[220px] animate-pulse rounded-2xl" style={{ background: 'rgba(255,255,255,0.04)' }} />
    </div>
  );
}

export default function EventAnalyticsPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const user = useLagosLiveStore((s) => s.user);
  const authLoading = useLagosLiveStore((s) => s.authLoading);
  const showToast = useLagosLiveStore((s) => s.showToast);
  const { party, loading } = useParty(Number(params.id));
  const [analytics, setAnalytics] = useState<OrganizerEventAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [hostVerified, setHostVerified] = useState(false);

  useEffect(() => {
    if (!party) return;
    let cancelled = false;
    fetchPartyHostVerified(party.id)
      .then((ok) => !cancelled && setHostVerified(ok))
      .catch(() => { /* non-blocking */ });
    return () => {
      cancelled = true;
    };
  }, [party]);

  useEffect(() => {
    if (!party) return;
    let cancelled = false;
    setReviewsLoading(true);
    fetchEventReviews(party.id)
      .then((rows) => !cancelled && setReviews(rows))
      .catch((err) => console.error('[host] reviews load error', err))
      .finally(() => !cancelled && setReviewsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [party]);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login?next=' + encodeURIComponent(`/host/${params.id}`));
  }, [authLoading, user, router, params.id]);

  useEffect(() => {
    if (!user || !party) return;
    if (party.createdBy !== user.id) {
      router.replace('/host');
      return;
    }
    let cancelled = false;
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    fetchOrganizerEventAnalytics(party.id)
      .then((data) => {
        if (!cancelled) setAnalytics(data);
      })
      .catch((err) => {
        if (!cancelled) setAnalyticsError(err instanceof Error ? err.message : 'Could not load analytics.');
      })
      .finally(() => {
        if (!cancelled) setAnalyticsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [party, user, router, attempt]);

  if (!user) {
    if (authLoading) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 size={26} strokeWidth={2} color="#FF2D95" className="animate-spin" />
        </div>
      );
    }
    return null; // auth effect redirects to /login
  }

  if (authLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 size={26} strokeWidth={2} color="#FF2D95" className="animate-spin" />
      </div>
    );
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

  // Only the organizer of this event sees its performance. A non-owner is
  // bounced back to their own dashboard (the analytics effect also redirects);
  // admins manage other people's events through /admin, not this page.
  if (party.createdBy !== user.id) return null;

  const statusStyle = STATUS_STYLE[party.status];

  const runReviewAction = async (action: 'submit' | 'withdraw') => {
    setReviewBusy(true);
    try {
      if (action === 'submit') await submitEventForReview(party.id);
      else await withdrawEvent(party.id);
      showToast(action === 'submit' ? 'Submitted for review' : 'Moved back to draft', action === 'submit' ? 'Your event is with the review team.' : 'Your event is saved as a draft.');
      setAttempt((a) => a + 1);
    } catch (err) {
      showToast('Something went wrong', err instanceof Error ? err.message : "Couldn't update the event.");
    } finally {
      setReviewBusy(false);
    }
  };
  const cancelledFailed = (analytics?.cancelledOrders ?? 0) + (analytics?.failedOrders ?? 0);
  const totalCapacity = party.capacity;
  const ticketsSold = analytics?.ticketsSold ?? 0;
  const ticketsRemaining = Math.max(0, totalCapacity - ticketsSold);

  return (
    <div className="mx-auto max-w-[600px] animate-fade-in">
      <div
        className="sticky top-0 z-40 flex items-center gap-3 border-b px-5 py-3.5 backdrop-blur-[22px] backdrop-saturate-150"
        style={{ background: 'var(--c-header)', borderColor: 'rgba(255,255,255,0.04)' }}
      >
        <BackButton href="/host" />
        <span className="font-heading text-[13px] font-bold uppercase tracking-[1px]" style={{ color: '#FFFFFF' }}>
          Event Performance
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Link
            href={`/party/${party.id}`}
            className="flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-[12px] font-semibold glass glass-hover"
            style={{ color: '#A7A8B5' }}
          >
            <Eye size={13} strokeWidth={2} />
            View
          </Link>
          <Link
            href={`/host/${party.id}/edit`}
            className="flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-[12px] font-semibold glass glass-hover"
            style={{ color: '#A7A8B5' }}
          >
            <Pencil size={13} strokeWidth={2} />
            Edit
          </Link>
          {!party.cancelledAt && (
            <Link
              href={`/host/${party.id}/cancel`}
              className="flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-[12px] font-bold"
              style={{ background: 'rgba(255,45,149,0.12)', border: '1px solid rgba(255,45,149,0.35)', color: '#FF2D95' }}
            >
              <XCircle size={13} strokeWidth={2} />
              Cancel
            </Link>
          )}
          <Link
            href={`/check-in/${party.id}`}
            className="flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-[12px] font-bold"
            style={{ background: 'linear-gradient(135deg, #FF9B3E 0%, #FF6A00 100%)', color: '#FFFFFF', boxShadow: '0 8px 24px rgba(255,106,0,0.28)' }}
          >
            <QrCode size={13} strokeWidth={2} />
            Check-in
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-5">
        {party.cancelledAt && (
          <div className="rounded-2xl p-4" style={{ background: 'rgba(255,45,149,0.08)', border: '1px solid rgba(255,45,149,0.28)' }}>
            <div className="flex items-center gap-2.5">
              <XCircle size={16} strokeWidth={2} color="#FF2D95" className="flex-shrink-0" />
              <div>
                <div className="text-[13px] font-bold uppercase tracking-[0.5px]" style={{ color: '#FF2D95' }}>
                  Event Cancelled
                </div>
                <div className="mt-0.5 text-[12px]" style={{ color: '#F2A5C9' }}>
                  All guests were refunded. {party.cancellationReason ? `Reason: ${party.cancellationReason}` : ''}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Review flow — Phase 3 trust: draft -> submitted -> approved */}
        {(party.status === 'draft' || party.status === 'rejected' || party.status === 'pending') && !party.cancelledAt && (
          <div className="rounded-2xl p-4" style={{ background: 'rgba(255,214,0,0.05)', border: '1px solid rgba(255,214,0,0.18)' }}>
            {party.status === 'draft' ? (
              <>
                <div className="mb-1 text-[12px] font-bold uppercase tracking-[0.5px]" style={{ color: '#FFD600' }}>
                  Draft — not public yet
                </div>
                <div className="mb-3 text-[12px] leading-[1.6]" style={{ color: '#A7A8B5' }}>
                  Only you can see this event. Submit it for review to put it in front of the admin team.
                </div>
                <button
                  onClick={() => runReviewAction('submit')}
                  disabled={reviewBusy}
                  className="flex w-full items-center justify-center gap-2 rounded-[11px] py-3 text-[13px] font-bold uppercase tracking-[0.5px] transition-all disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #FF9B3E 0%, #FF6A00 100%)', color: '#FFFFFF', boxShadow: '0 10px 28px rgba(255,106,0,0.25)' }}
                >
                  <Send size={14} strokeWidth={2.5} />
                  {reviewBusy ? 'Submitting...' : 'Submit for review'}
                </button>
              </>
            ) : party.status === 'rejected' ? (
              <>
                <div className="mb-1 text-[12px] font-bold uppercase tracking-[0.5px]" style={{ color: '#FF8A00' }}>
                  Not approved
                </div>
                {party.reviewReason && (
                  <div className="mb-3 rounded-xl p-3 text-[12px] leading-[1.6]" style={{ background: 'rgba(255,138,0,0.08)', border: '1px solid rgba(255,138,0,0.2)', color: '#A7A8B5' }}>
                    <span style={{ color: '#FF8A00', fontWeight: 700 }}>Why:</span> {party.reviewReason}
                  </div>
                )}
                <div className="mb-3 text-[12px] leading-[1.6]" style={{ color: '#A7A8B5' }}>
                  Fix the issue above, then resubmit — the admin team will take another look.
                </div>
                <button
                  onClick={() => runReviewAction('submit')}
                  disabled={reviewBusy}
                  className="flex w-full items-center justify-center gap-2 rounded-[11px] py-3 text-[13px] font-bold uppercase tracking-[0.5px] transition-all disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #FF9B3E 0%, #FF6A00 100%)', color: '#FFFFFF', boxShadow: '0 10px 28px rgba(255,106,0,0.25)' }}
                >
                  <Send size={14} strokeWidth={2.5} />
                  {reviewBusy ? 'Submitting...' : 'Resubmit for review'}
                </button>
              </>
            ) : (
              <>
                <div className="mb-1 text-[12px] font-bold uppercase tracking-[0.5px]" style={{ color: '#FFD600' }}>
                  In review
                </div>
                <div className="mb-3 text-[12px] leading-[1.6]" style={{ color: '#A7A8B5' }}>
                  An admin is reviewing this event. It&apos;ll go live as soon as it&apos;s approved. You can still withdraw it.
                </div>
                <button
                  onClick={() => runReviewAction('withdraw')}
                  disabled={reviewBusy}
                  className="flex w-full items-center justify-center gap-2 rounded-[11px] py-3 text-[13px] font-bold transition-all disabled:opacity-50"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#D5D6E0' }}
                >
                  <PenLine size={14} strokeWidth={2} />
                  {reviewBusy ? 'Withdrawing...' : 'Withdraw to draft'}
                </button>
              </>
            )}
          </div>
        )}

        {/* Run the door — Phase 2 check-in */}
        {party.status === 'approved' && !party.cancelledAt && (
          <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(135deg, rgba(255,107,0,0.14) 0%, rgba(255,179,71,0.06) 100%)', border: '1px solid rgba(255,107,0,0.35)' }}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-[12px] font-bold uppercase tracking-[0.5px]" style={{ color: '#FF9B3E' }}>
                Run the door
              </div>
              <QrCode size={14} strokeWidth={2} color="#FF9B3E" />
            </div>
            <Link
              href={`/check-in/${party.id}`}
              className="flex w-full items-center justify-center gap-2 rounded-[12px] py-4 text-[14px] font-bold uppercase tracking-[1px] transition-transform active:scale-[0.98]"
              style={{ background: 'linear-gradient(135deg, #FF9B3E 0%, #FF6A00 100%)', color: '#FFFFFF', boxShadow: '0 12px 32px rgba(255,106,0,0.28)' }}
            >
              <QrCode size={16} strokeWidth={2.2} />
              Check in guests
            </Link>
            <Link href={`/host/${party.id}/check-in`} className="mt-2.5 block text-center text-[11px] font-semibold underline underline-offset-2" style={{ color: '#C9A97B' }}>
              Manual ticket list instead
            </Link>
          </div>
        )}

        {/* Share card */}
        <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,45,149,0.16)' }}>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <div className="text-[12px] font-bold" style={{ color: '#FFFFFF' }}>Promote Your Event</div>
            <Share2 size={14} strokeWidth={2} color="#FF2D95" />
          </div>
          <div className="mb-3 truncate text-[11px]" style={{ color: '#A7A8B5' }}>{partyShareUrl(party.id)}</div>
          <Link
            href={`/host/${party.id}/share`}
            className="flex w-full items-center justify-center gap-1.5 rounded-[9px] py-2.5 text-[12px] font-bold transition-all duration-200"
            style={{ background: 'rgba(255,45,149,0.14)', border: '1px solid rgba(255,45,149,0.4)', color: '#FF2D95' }}
          >
            <QrCode size={13} strokeWidth={2.5} /> Get QR Code & Links
          </Link>
        </div>

        {analyticsLoading ? (
          <PageSkeleton />
        ) : analyticsError ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl px-6 py-14 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,138,0,0.2)' }}>
            <AlertTriangle size={26} strokeWidth={1.5} color="#FF8A00" />
            <div className="text-sm" style={{ color: '#A7A8B5' }}>
              Couldn&apos;t load this event&apos;s performance. Check your connection and try again.
            </div>
            <button
              onClick={() => setAttempt((a) => a + 1)}
              className="flex items-center gap-2 rounded-[10px] px-4 py-2 text-[13px] font-semibold"
              style={{ background: 'rgba(255,138,0,0.12)', border: '1px solid rgba(255,138,0,0.3)', color: '#FF8A00' }}
            >
              <RefreshCw size={13} strokeWidth={2.5} />
              Retry
            </button>
          </div>
        ) : !analytics ? null : (
          <>
            {/* Event header */}
            <div className="overflow-hidden rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="relative" style={{ height: 150, background: party.gradient }}>
                <PartyPhoto src={partyPhoto(party.id, party.coverUrl)} alt={party.title} gradient={party.gradient} sizes="600px" />
                <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(7,7,11,0.92) 0%, rgba(7,7,11,0.15) 70%)' }} />
                <span className="absolute right-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: statusStyle.bg, color: statusStyle.color, backdropFilter: 'blur(8px)' }}>
                  {statusStyle.label}
                </span>
                {hostVerified && (
                  <span className="absolute left-3 top-3 flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: 'rgba(0,245,212,0.14)', border: '1px solid rgba(0,245,212,0.35)', color: '#00F5D4', backdropFilter: 'blur(8px)' }}>
                    <BadgeCheck size={12} strokeWidth={2.2} />
                    Verified Host
                  </span>
                )}
              </div>
              <div className="p-4">
                <div className="font-heading text-[18px] font-bold leading-tight" style={{ color: '#FFFFFF' }}>{party.title}</div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]" style={{ color: '#A7A8B5' }}>
                  <span className="flex items-center gap-1.5">
                    <Clock size={12} strokeWidth={2} color="#FF2D95" />
                    {party.date} · {party.time}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <MapPin size={12} strokeWidth={2} color="#00BFFF" />
                    {party.location}
                  </span>
                </div>
              </div>
            </div>

            {/* Key stats */}
            <div className="grid grid-cols-2 gap-2.5">
              <StatCard label="Tickets Sold" value={String(ticketsSold)} icon={Ticket} color="#00F5D4" />
              <StatCard label="Tickets Remaining" value={String(ticketsRemaining)} icon={Users} color="#FFFFFF" />
              <StatCard label="Total Capacity" value={String(totalCapacity)} icon={Clock} color="#00BFFF" />
              <StatCard label="Confirmed Revenue" value={formatNaira(analytics.revenue)} icon={Wallet} color="#B06AFF" />
              <StatCard label="Pending Orders" value={String(analytics.pendingOrders)} icon={Hourglass} color="#FFD600" />
              <StatCard label="Cancelled / Failed" value={String(cancelledFailed)} icon={XCircle} color="#FF8A00" />
            </div>

            {/* Sales over time */}
            <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="mb-1 flex items-center gap-2">
                <TrendingUp size={14} strokeWidth={2} color="#FF2D95" />
                <span className="text-[11px] font-bold uppercase tracking-[1px]" style={{ color: '#A7A8B5' }}>
                  Tickets Sold · Last 14 Days
                </span>
              </div>
              <div className="pt-3">
                <SalesChart data={analytics.series} />
              </div>
            </div>

            {/* Ticket inventory */}
            <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-[1px]" style={{ color: '#A7A8B5' }}>
                  Ticket Sales by Type
                </span>
                <span className="text-[11px]" style={{ color: '#6B6C80' }}>
                  {ticketsSold} / {totalCapacity} sold
                </span>
              </div>

              <div className="mb-4">
                <ProgressBar sold={ticketsSold} total={totalCapacity} from="#8A2BE2" to="#FF2D95" />
              </div>

              {analytics.ticketTypes.length === 0 ? (
                <div className="text-[12px]" style={{ color: '#6B6C80' }}>
                  No ticket types set up for this event. Sales still count against total capacity.
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {analytics.ticketTypes.map((tt) => (
                    <div key={tt.id}>
                      <div className="mb-1.5 flex items-baseline justify-between gap-2">
                        <span className="text-[13px] font-semibold" style={{ color: '#FFFFFF' }}>{tt.name}</span>
                        <span className="text-[11px]" style={{ color: '#A7A8B5' }}>
                          <span className="font-bold" style={{ color: '#00F5D4' }}>{tt.sold}</span> sold · <span style={{ color: '#FFFFFF' }}>{tt.remaining}</span> left
                        </span>
                      </div>
                      <div className="mb-1.5">
                        <ProgressBar sold={tt.sold} total={tt.total} from="#00BFFF" to="#8A2BE2" />
                      </div>
                      <div className="text-[10px] uppercase tracking-[0.6px]" style={{ color: '#6B6C80' }}>
                        {tt.total} total · {tt.price === 0 ? 'Free' : formatNaira(tt.price)} each
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Reviews */}
            <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-[1px]" style={{ color: '#A7A8B5' }}>
                  Guest Reviews
                </span>
                {party.avgRating > 0 ? (
                  <span className="flex items-center gap-1 text-[12px] font-semibold" style={{ color: '#FFFFFF' }}>
                    <Star size={13} strokeWidth={2} fill="#FFD600" color="#FFD600" />
                    {party.avgRating.toFixed(1)}
                    <span style={{ color: '#6B6C80', fontWeight: 400 }}>({party.reviewCount})</span>
                  </span>
                ) : (
                  <span className="text-[11px]" style={{ color: '#6B6C80' }}>No ratings yet</span>
                )}
              </div>

              {reviewsLoading ? (
                <div className="space-y-2.5">
                  {[0, 1].map((i) => (
                    <div key={i} className="rounded-xl p-3.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div className="mb-2 h-2.5 w-20 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }} />
                      <div className="h-2.5 w-full rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }} />
                    </div>
                  ))}
                </div>
              ) : reviews.length === 0 ? (
                <div className="text-[12px]" style={{ color: '#6B6C80' }}>
                  No reviews yet — they appear here once guests rate the event.
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {reviews.map((r) => (
                    <div key={r.id} className="rounded-xl p-3.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-[12px] font-semibold" style={{ color: '#FFFFFF' }}>{r.guestName}</span>
                        <span className="flex gap-0.5">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              size={10}
                              strokeWidth={2}
                              fill={star <= r.rating ? '#FFD600' : 'none'}
                              color={star <= r.rating ? '#FFD600' : '#3A3A4D'}
                            />
                          ))}
                        </span>
                      </div>
                      {r.reviewText && (
                        <p className="text-[12px] leading-[1.6]" style={{ color: '#A7A8B5' }}>{r.reviewText}</p>
                      )}
                      <div className="mt-1 text-[10px]" style={{ color: '#6B6C80' }}>
                        {new Date(r.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
