'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Send, Mail, CalendarDays, Wallet, Ticket, ClipboardCheck, RotateCcw } from 'lucide-react';
import AdminShell from '@/components/admin-shell';
import { PageHeader, StatCard, LoadingBlock, ErrorBlock, EmptyBlock, Badge, usePermissionGuard } from '@/components/ui/dashboard-ui';
import { usePermission } from '@/lib/hooks/usePermission';
import { fetchOrderById, fetchAdminNotes, createAdminNote, type AdminOrderJoined } from '@/lib/admin-queries';
import { formatNaira } from '@/lib/filters';
import { useLagosLiveStore } from '@/lib/store';

const PAYMENT_STYLE: Record<string, { label: string; bg: string; color: string }> = {
  pending: { label: 'Pending', bg: 'rgba(255,214,0,0.12)', color: '#FFD600' },
  confirmed: { label: 'Confirmed', bg: 'rgba(0,245,212,0.1)', color: '#00F5D4' },
  failed: { label: 'Failed', bg: 'rgba(255,138,0,0.1)', color: '#FF8A00' },
  cancelled: { label: 'Cancelled', bg: 'rgba(255,45,149,0.12)', color: '#FF2D95' },
};

const REFUND_STYLE: Record<string, { label: string; bg: string; color: string }> = {
  none: { label: 'None', bg: 'rgba(255,255,255,0.06)', color: '#A7A8B5' },
  requested: { label: 'Requested', bg: 'rgba(255,214,0,0.12)', color: '#FFD600' },
  processing: { label: 'Processing', bg: 'rgba(176,106,255,0.1)', color: '#B06AFF' },
  refunded: { label: 'Refunded', bg: 'rgba(0,245,212,0.1)', color: '#00F5D4' },
  rejected: { label: 'Rejected', bg: 'rgba(255,45,149,0.12)', color: '#FF2D95' },
  failed: { label: 'Failed', bg: 'rgba(255,138,0,0.1)', color: '#FF8A00' },
};

interface Note {
  id: number;
  body: string;
  created_at: string;
  author_id: string | null;
}

export default function AdminOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const orderId = Array.isArray(id) ? id[0] : id;
  const { ready } = usePermissionGuard('orders.view');
  const { hasPermission: canRefund } = usePermission('orders.refund');
  const { hasPermission: canRefundTx } = usePermission('transactions.refund');
  const { hasPermission: canResend } = usePermission('orders.resend_ticket');
  const { hasPermission: canWriteNotes } = usePermission('support.reply');
  const canRefundOrder = canRefund || canRefundTx;
  const showToast = useLagosLiveStore((s) => s.showToast);

  const [order, setOrder] = useState<AdminOrderJoined | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteBody, setNoteBody] = useState('');
  const [status, setStatus] = useState<'loading' | 'error' | 'ok'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [refundBusy, setRefundBusy] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [noteBusy, setNoteBusy] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const data = await fetchOrderById(orderId);
      setOrder(data);
      const noteData = await fetchAdminNotes('order', orderId);
      setNotes(noteData);
      setStatus('ok');
    } catch {
      setStatus('error');
    }
  }, [orderId]);

  useEffect(() => {
    if (!ready) return;
    load();
  }, [ready, load, attempt]);

  const setRefund = async (refundStatus: string) => {
    if (!order) return;
    setRefundBusy(true);
    try {
      const res = await fetch('/api/admin/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set_refund',
          orderId,
          refundStatus,
          refundAmount: refundStatus === 'refunded' ? order.total : 0,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Request failed');
      setOrder((o) => (o ? { ...o, refund_status: refundStatus } : o));
      showToast('Refund updated', `Refund status set to ${refundStatus}.`);
    } catch (err) {
      showToast('Something went wrong', err instanceof Error ? err.message : "Couldn't update the refund status.");
    } finally {
      setRefundBusy(false);
    }
  };

  const resendEmail = async () => {
    setEmailBusy(true);
    try {
      const res = await fetch('/api/admin/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resend_email', orderId }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Request failed');
      showToast('Email sent', 'The ticket email was resent.');
    } catch (err) {
      showToast('Something went wrong', err instanceof Error ? err.message : "Couldn't resend the email.");
    } finally {
      setEmailBusy(false);
    }
  };

  const retryRefund = async () => {
    if (!order) return;
    if (!confirm('Retry this refund with Paystack?')) return;
    setRefundBusy(true);
    try {
      const res = await fetch('/api/admin/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'issue_refund', orderId }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Request failed');
      setAttempt((a) => a + 1);
      showToast('Refund issued', 'The refund was sent back to the guest.');
    } catch (err) {
      showToast('Refund failed', err instanceof Error ? err.message : "Couldn't retry the refund.");
    } finally {
      setRefundBusy(false);
    }
  };

  const addNote = async () => {
    const body = noteBody.trim();
    if (!body) return;
    setNoteBusy(true);
    try {
      await createAdminNote('order', orderId, body);
      const noteData = await fetchAdminNotes('order', orderId);
      setNotes(noteData);
      setNoteBody('');
      showToast('Note added', 'Admin note saved.');
    } catch {
      showToast('Something went wrong', "Couldn't add the note.");
    } finally {
      setNoteBusy(false);
    }
  };

  if (!ready) return null;

  const st = order ? PAYMENT_STYLE[order.payment_status] ?? PAYMENT_STYLE.pending : null;
  const rs = order ? REFUND_STYLE[order.refund_status] ?? REFUND_STYLE.none : null;

  return (
    <AdminShell>
      <div className="mx-auto max-w-[980px] p-5">
        {status === 'loading' ? (
          <>
            <LoadingBlock />
          </>
        ) : status === 'error' ? (
          <>
            <ErrorBlock message="Couldn't load this order." onRetry={() => setAttempt((a) => a + 1)} />
          </>
        ) : !order ? (
          <>
            <EmptyBlock title="Order not found" subtitle="This order may have been removed." />
          </>
        ) : (
          <>
            <PageHeader
              title={`Order ${order.order_ref}`}
              subtitle={`Placed ${new Date(order.created_at).toLocaleString()}`}
              right={
                <Link
                  href="/admin/orders"
                  className="flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-[12.5px] font-semibold"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#A7A8B5' }}
                >
                  <ArrowLeft size={13} strokeWidth={2.5} /> Back to orders
                </Link>
              }
            />

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <StatCard label="Guest" value={order.customer_email ?? 'Guest'} icon={Mail} color="#00F5D4" />
              <StatCard label="Event" value={order.parties?.title ?? '—'} icon={CalendarDays} color="#B06AFF" />
              <StatCard label="Amount" value={formatNaira(order.total)} icon={Wallet} color="#FFD600" />
              <StatCard label="Status" value={st?.label ?? '—'} icon={Ticket} color="#FF2D95" />
              <StatCard label="Check-in" value={order.check_in_status ?? '—'} icon={ClipboardCheck} color="#00BFFF" />
              <StatCard label="Refund" value={rs?.label ?? '—'} icon={RotateCcw} color="#FFFFFF" />
            </div>

            {order.payment_ref && (
              <div className="mt-4 rounded-2xl p-4 text-[12.5px]" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[1px]" style={{ color: '#6B6C80' }}>Payment details</div>
                <div className="flex flex-wrap gap-x-6 gap-y-1">
                  <span style={{ color: '#A7A8B5' }}>Ref: <span style={{ color: '#D5D6E0' }}>{order.payment_ref}</span></span>
                  {order.payment_method && (
                    <span style={{ color: '#A7A8B5' }}>Method: <span style={{ color: '#D5D6E0' }}>{order.payment_method}</span></span>
                  )}
                </div>
              </div>
            )}

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {canRefundOrder && (
              <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="mb-3 text-[12px] font-bold" style={{ color: '#FFFFFF' }}>Refund</div>
                <div className="mb-4">
                  <span className="text-xs" style={{ color: '#6B6C80' }}>Current refund status: </span>
                  {rs && <Badge label={rs.label} bg={rs.bg} color={rs.color} />}
                </div>
                <div className="flex flex-wrap gap-2">
                  {(['requested', 'refunded', 'rejected'] as const).map((s) => (
                    <button
                      key={s}
                      disabled={refundBusy}
                      onClick={() => setRefund(s)}
                      className="rounded-[9px] border px-3 py-2 text-[12px] font-semibold capitalize disabled:opacity-50"
                      style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.1)', color: '#D5D6E0' }}
                    >
                      {s}
                    </button>
                  ))}
                  {(order.refund_status === 'failed' || order.refund_status === 'none') && (
                    <button
                      disabled={refundBusy}
                      onClick={retryRefund}
                      className="rounded-[9px] border px-3 py-2 text-[12px] font-semibold disabled:opacity-50"
                      style={{ background: 'rgba(255,138,0,0.1)', borderColor: 'rgba(255,138,0,0.35)', color: '#FF8A00' }}
                    >
                      {refundBusy ? 'Retrying…' : 'Retry refund'}
                    </button>
                  )}
                </div>
              </div>
              )}

              <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="mb-3 text-[12px] font-bold" style={{ color: '#FFFFFF' }}>Customer email</div>
                <p className="mb-4 text-[12.5px]" style={{ color: '#A7A8B5' }}>
                  Resend the ticket confirmation email to {order.customer_email ?? 'the customer'}.
                </p>
                {canResend && (
                <button
                  onClick={resendEmail}
                  disabled={emailBusy}
                  className="flex items-center gap-1.5 rounded-[9px] border px-3 py-2 text-[12px] font-semibold disabled:opacity-50"
                  style={{ background: 'rgba(0,245,212,0.08)', borderColor: 'rgba(0,245,212,0.25)', color: '#00F5D4' }}
                >
                  <Send size={13} /> {emailBusy ? 'Sending…' : 'Resend email'}
                </button>
                )}
              </div>
            </div>

            {canWriteNotes && (
            <div className="mt-5 rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="mb-3 text-[12px] font-bold" style={{ color: '#FFFFFF' }}>Admin notes</div>
              {notes.length === 0 ? (
                <EmptyBlock title="No notes" subtitle="Add the first note for this order." />
              ) : (
                <div className="mb-4 flex flex-col gap-2.5">
                  {notes.map((n) => (
                    <div key={n.id} className="rounded-xl px-3.5 py-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div className="text-[12.5px]" style={{ color: '#D5D6E0' }}>{n.body}</div>
                      <div className="mt-1 text-[10.5px]" style={{ color: '#6B6C80' }}>
                        {new Date(n.created_at).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <textarea
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  rows={2}
                  placeholder="Add a private admin note…"
                  className="flex-1 resize-none rounded-xl px-3.5 py-2.5 text-[13px] outline-none"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFFFFF' }}
                />
                <button
                  onClick={addNote}
                  disabled={noteBusy || !noteBody.trim()}
                  className="self-end rounded-[10px] px-4 py-2 text-[12.5px] font-semibold disabled:opacity-50"
                  style={{ background: 'rgba(255,45,149,0.14)', border: '1px solid rgba(255,45,149,0.35)', color: '#FF2D95' }}
                >
                  Add
                </button>
              </div>
            </div>
            )}
          </>
        )}
      </div>
    </AdminShell>
  );
}
