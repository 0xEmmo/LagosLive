'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Check, X, Ban, RotateCcw } from 'lucide-react';
import AdminShell from '@/components/admin-shell';
import { PageHeader, LoadingBlock, ErrorBlock, EmptyBlock, TableShell, Cell, useRoleGuard, Badge } from '@/components/ui/dashboard-ui';
import { fetchAdminEvent, fetchEventOrders, type AdminEventJoined, type AdminOrderJoined } from '@/lib/admin-queries';
import { updatePartyStatus } from '@/lib/queries';
import { useLagosLiveStore } from '@/lib/store';
import { formatNaira } from '@/lib/filters';

const PAYMENT_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  confirmed: { label: 'Paid', bg: 'rgba(0,245,212,0.08)', color: '#00F5D4' },
  pending: { label: 'Pending', bg: 'rgba(255,214,0,0.1)', color: '#FFD600' },
  failed: { label: 'Failed', bg: 'rgba(255,138,0,0.08)', color: '#FF8A00' },
  cancelled: { label: 'Cancelled', bg: 'rgba(255,45,149,0.1)', color: '#FF2D95' },
};

export default function AdminEventDetailPage() {
  const { ready } = useRoleGuard('admin');
  const params = useParams<{ id: string }>();
  const showToast = useLagosLiveStore((s) => s.showToast);
  const id = Number(params.id);

  const [event, setEvent] = useState<AdminEventJoined | null>(null);
  const [orders, setOrders] = useState<AdminOrderJoined[]>([]);
  const [status, setStatus] = useState<'loading' | 'error' | 'ok'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!ready || !id) return;
    setStatus('loading');
    Promise.all([fetchAdminEvent(id), fetchEventOrders(id)])
      .then(([ev, ords]) => {
        setEvent(ev);
        setOrders(ords);
        setStatus('ok');
      })
      .catch(() => setStatus('error'));
  }, [ready, id, attempt]);

  const setStatusOf = async (next: string) => {
    if (!event) return;
    if ((next === 'rejected' || next === 'suspended') && !confirm(`${next === 'suspended' ? 'Suspend' : 'Reject'} "${event.title}"?`)) return;
    try {
      await updatePartyStatus(event.id, next as never);
      setEvent((e) => (e ? { ...e, status: next } : e));
      showToast('Event updated', next);
    } catch {
      showToast('Something went wrong', "Couldn't update the event.");
    }
  };

  if (!ready) return null;

  const confirmed = orders.filter((o) => o.payment_status === 'confirmed');
  const revenue = confirmed.reduce((s, o) => s + o.total, 0);
  const checkedIn = confirmed.filter((o) => o.check_in_status === 'checked_in').length;

  return (
    <AdminShell>
      <div className="mx-auto max-w-[980px] p-5">
        <Link href="/admin/events" className="mb-4 flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: '#A7A8B5' }}>
          <ArrowLeft size={14} /> Back to events
        </Link>

        {status === 'loading' ? (
          <LoadingBlock />
        ) : status === 'error' ? (
          <ErrorBlock message="Couldn't load this event." onRetry={() => setAttempt((a) => a + 1)} />
        ) : !event ? (
          <EmptyBlock title="Event not found" subtitle="It may have been deleted." />
        ) : (
          <div className="flex flex-col gap-6">
            <PageHeader
              title={event.title}
              subtitle={`${event.date} · ${event.time} · ${event.location} · ${formatNaira(event.fee_num)}`}
              right={
                <div className="flex flex-wrap gap-2">
                  {event.status === 'approved' && (
                    <ActionBtn label="Suspend" icon={<Ban size={13} />} color="#FF8A00" onClick={() => setStatusOf('suspended')} />
                  )}
                  {(event.status === 'suspended' || event.status === 'rejected') && (
                    <ActionBtn label="Reinstate" icon={<RotateCcw size={13} />} color="#00F5D4" onClick={() => setStatusOf('approved')} />
                  )}
                  {event.status === 'pending' && (
                    <>
                      <ActionBtn label="Approve" icon={<Check size={13} />} color="#00F5D4" onClick={() => setStatusOf('approved')} />
                      <ActionBtn label="Reject" icon={<X size={13} />} color="#FF8A00" onClick={() => setStatusOf('rejected')} />
                    </>
                  )}
                </div>
              }
            />

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <MiniStat label="Status" value={event.status.toUpperCase()} color={event.status === 'approved' ? '#00F5D4' : '#FFD600'} />
              <MiniStat label="Revenue" value={formatNaira(revenue)} color="#00F5D4" />
              <MiniStat label="Tickets" value={`${confirmed.length} / ${event.capacity ?? '—'}`} color="#FFFFFF" />
              <MiniStat label="Checked In" value={`${checkedIn} / ${confirmed.length}`} color="#B06AFF" />
            </div>

            <div className="flex flex-col gap-4">
              <div className="text-[13px] font-bold" style={{ color: '#FFFFFF' }}>Attendees & Orders ({orders.length})</div>
              {orders.length === 0 ? (
                <EmptyBlock title="No orders yet" subtitle="Sales will appear here once people buy tickets." />
              ) : (
                <TableShell head={['Order', 'Guest', 'Qty', 'Amount', 'Payment', 'Check-in', 'Refund']}>
                  {orders.map((o) => {
                    const pb = PAYMENT_BADGE[o.payment_status] ?? PAYMENT_BADGE.pending;
                    const guestName =
                      o.customer_email && o.customer_email !== 'Guest'
                        ? o.customer_email.split('@')[0]
                        : 'Guest';
                    return (
                      <tr key={o.id}>
                        <Cell>
                          <Link href={`/admin/orders/${o.id}`} className="font-semibold hover:underline" style={{ color: '#FFFFFF' }}>
                            {o.order_ref}
                          </Link>
                        </Cell>
                        <Cell>{guestName}</Cell>
                        <Cell>{o.quantity}</Cell>
                        <Cell style={{ fontFamily: 'var(--font-display)' }}>{formatNaira(o.total)}</Cell>
                        <Cell><Badge label={pb.label} bg={pb.bg} color={pb.color} /></Cell>
                        <Cell>{o.check_in_status === 'checked_in' ? '✓ Checked in' : '—'}</Cell>
                        <Cell>{o.refund_status && o.refund_status !== 'none' ? o.refund_status : '—'}</Cell>
                      </tr>
                    );
                  })}
                </TableShell>
              )}
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.9px]" style={{ color: '#6B6C80' }}>{label}</div>
      <div className="font-display text-[17px] leading-tight" style={{ color }}>{value}</div>
    </div>
  );
}

function ActionBtn({ label, icon, color, onClick }: { label: string; icon: React.ReactNode; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 rounded-[9px] border px-2.5 py-1.5 text-[11.5px] font-semibold" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.1)', color }}>
      {icon} {label}
    </button>
  );
}
