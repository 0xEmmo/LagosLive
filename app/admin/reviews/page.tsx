'use client';

import { useEffect, useMemo, useState } from 'react';
import { Star, ShieldCheck, EyeOff, Ban, Eye } from 'lucide-react';
import AdminShell from '@/components/admin-shell';
import { PageHeader, Badge, TableShell, Cell, LoadingBlock, ErrorBlock, EmptyBlock, useRoleGuard } from '@/components/ui/dashboard-ui';
import { fetchAllReviews, moderateReview, type ReviewRow, type ReviewModStatus } from '@/lib/admin-queries';

const STAT_COLORS: Record<ReviewModStatus, { bg: string; color: string }> = {
  visible: { bg: 'rgba(0,245,212,0.1)', color: '#00F5D4' },
  hidden: { bg: 'rgba(255,214,0,0.1)', color: '#FFD600' },
  removed: { bg: 'rgba(255,45,149,0.12)', color: '#FF2D95' },
};

const FILTERS: { key: ReviewModStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'visible', label: 'Visible' },
  { key: 'hidden', label: 'Hidden' },
  { key: 'removed', label: 'Removed' },
];

export default function AdminReviewsPage() {
  const { user, ready } = useRoleGuard('support');
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [status, setStatus] = useState<'loading' | 'error' | 'ok'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState<ReviewModStatus | 'all'>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    setStatus('loading');
    fetchAllReviews()
      .then((r) => {
        setReviews(r);
        setStatus('ok');
      })
      .catch(() => setStatus('error'));
  }, [ready, attempt]);

  const counts = useMemo(() => {
    const c: Record<ReviewModStatus, number> = { visible: 0, hidden: 0, removed: 0 };
    for (const r of reviews) {
      const k = r.moderation_status as ReviewModStatus;
      if (k in c) c[k] += 1;
    }
    return c;
  }, [reviews]);

  if (!ready || !user) return null;

  const filtered = filter === 'all' ? reviews : reviews.filter((r) => r.moderation_status === filter);

  const apply = async (review: ReviewRow, next: ReviewModStatus) => {
    if (busyId) return;
    let reason = '';
    if (next !== 'visible') {
      const input = window.prompt(
        `Reason for ${next === 'hidden' ? 'hiding' : 'removing'} this review? It's recorded in the audit log.`,
        ''
      );
      if (input === null) return;
      reason = input.trim();
      if (!reason) {
        alert('A reason is required.');
        return;
      }
    }
    setBusyId(review.id);
    try {
      await moderateReview(review.id, next, reason);
      setReviews((prev) => prev.map((r) => (r.id === review.id ? { ...r, moderation_status: next } : r)));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AdminShell>
      <div className="mx-auto max-w-[980px] p-5">
        <PageHeader
          title="Reviews"
          subtitle={`${counts.hidden + counts.removed} of ${reviews.length} under moderation`}
          right={
            <div className="flex items-center gap-2">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className="rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors"
                  style={
                    filter === f.key
                      ? { background: 'rgba(255,155,62,0.16)', border: '1px solid rgba(255,155,62,0.4)', color: '#FFB347' }
                      : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#A7A8B5' }
                  }
                >
                  {f.label}
                  {f.key !== 'all' ? ` (${counts[f.key]})` : ''}
                </button>
              ))}
            </div>
          }
        />

        {status === 'loading' ? (
          <LoadingBlock />
        ) : status === 'error' ? (
          <ErrorBlock message="Couldn't load reviews." onRetry={() => setAttempt((a) => a + 1)} />
        ) : filtered.length === 0 ? (
          <EmptyBlock title="No reviews here" subtitle="Reviews appear once attendees submit them." />
        ) : (
          <TableShell head={['Event', 'Rating', 'Review', 'Status', 'Moderated', 'Actions']}>
            {filtered.map((review) => (
              <tr key={review.id}>
                <Cell>
                  <span className="block max-w-[180px] truncate text-[12.5px] font-semibold" style={{ color: '#FFFFFF' }}>
                    {review.parties?.title ?? `Event #${review.party_id}`}
                  </span>
                </Cell>
                <Cell>
                  <span className="inline-flex items-center gap-1 text-[12.5px]" style={{ color: '#FFB347' }}>
                    <Star size={13} fill="#FFB347" strokeWidth={0} />
                    {Number(review.rating).toFixed(1)}
                  </span>
                </Cell>
                <Cell>
                  <span className="block max-w-[300px] truncate text-[12px]" style={{ color: '#A7A8B5' }}>
                    {review.review_text || '—'}
                  </span>
                </Cell>
                <Cell>
                  <Badge label={review.moderation_status} bg={STAT_COLORS[review.moderation_status as ReviewModStatus].bg} color={STAT_COLORS[review.moderation_status as ReviewModStatus].color} />
                </Cell>
                <Cell>
                  {review.moderated_at ? (
                    <span className="block text-[11px]" style={{ color: '#6B6C80' }}>
                      {new Date(review.moderated_at).toLocaleString()}
                      <span className="block truncate italic">{review.moderation_reason || ''}</span>
                    </span>
                  ) : (
                    <span className="text-[11px]" style={{ color: '#6B6C80' }}>—</span>
                  )}
                </Cell>
                <Cell>
                  <div className="flex items-center gap-1.5">
                    {review.moderation_status !== 'visible' && (
                      <button
                        onClick={() => apply(review, 'visible')}
                        disabled={busyId === review.id}
                        className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-50"
                        style={{ background: 'rgba(0,245,212,0.1)', border: '1px solid rgba(0,245,212,0.25)', color: '#00F5D4' }}
                        title="Restore visibility"
                      >
                        <Eye size={13} strokeWidth={2.2} />
                      </button>
                    )}
                    {review.moderation_status === 'visible' && (
                      <button
                        onClick={() => apply(review, 'hidden')}
                        disabled={busyId === review.id}
                        className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-50"
                        style={{ background: 'rgba(255,214,0,0.1)', border: '1px solid rgba(255,214,0,0.25)', color: '#FFD600' }}
                        title="Hide from event page"
                      >
                        <EyeOff size={13} strokeWidth={2.2} />
                      </button>
                    )}
                    {review.moderation_status !== 'removed' && (
                      <button
                        onClick={() => apply(review, 'removed')}
                        disabled={busyId === review.id}
                        className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-50"
                        style={{ background: 'rgba(255,45,149,0.12)', border: '1px solid rgba(255,45,149,0.3)', color: '#FF2D95' }}
                        title="Permanently remove (audit logged)"
                      >
                        <Ban size={13} strokeWidth={2.2} />
                      </button>
                    )}
                  </div>
                </Cell>
              </tr>
            ))}
          </TableShell>
        )}

        <div className="mt-4 flex items-center gap-2 rounded-2xl px-4 py-3 text-[11px]" style={{ background: 'rgba(255,255,255,0.03)', color: '#6B6C80' }}>
          <ShieldCheck size={14} style={{ color: '#00F5D4' }} />
          <span>Hidden reviews are kept for context but hidden from attendees. Removed reviews are permanently deleted from listings. Every action is recorded with the reviewer of the event and the reason in the audit log.</span>
        </div>
      </div>
    </AdminShell>
  );
}