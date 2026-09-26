'use client';

import { useEffect, useState } from 'react';
import { Wallet, ArrowDownRight, ArrowUpRight, Clock, RotateCcw, RefreshCw, AlertTriangle } from 'lucide-react';
import AdminShell from '@/components/admin-shell';
import { StatCard, PageHeader, Badge, TableShell, Cell, LoadingBlock, ErrorBlock, EmptyBlock, usePermissionGuard } from '@/components/ui/dashboard-ui';
import { RevenueLineChart, HorizontalBarChart, ChartCard } from '@/components/ui/charts';
import { fetchAllOrders, fetchPayouts, fetchRevenueTrend, fetchEventsByCategory, updatePayoutStatus, sendPayoutTransfer, type AdminOrderJoined, type PayoutRow } from '@/lib/admin-queries';
import { formatNaira } from '@/lib/filters';

const PAYMENT_BADGE: Record<string, { bg: string; color: string }> = {
  confirmed: { bg: 'rgba(0,245,212,0.1)', color: '#00F5D4' },
  pending: { bg: 'rgba(255,214,0,0.1)', color: '#FFD600' },
  failed: { bg: 'rgba(255,45,149,0.12)', color: '#FF2D95' },
  cancelled: { bg: 'rgba(107,108,128,0.15)', color: '#6B6C80' },
};

const PAYOUT_STATUS: Record<string, { bg: string; color: string }> = {
  pending: { bg: 'rgba(255,214,0,0.1)', color: '#FFD600' },
  processing: { bg: 'rgba(176,106,255,0.12)', color: '#B06AFF' },
  approved: { bg: 'rgba(0,245,212,0.1)', color: '#00F5D4' },
  // A transfer has been sent and is not confirmed. Distinct from 'approved'
  // because the next step is Paystack's, not finance's.
  transfer_pending: { bg: 'rgba(0,191,255,0.14)', color: '#00BFFF' },
  paid: { bg: 'rgba(0,245,212,0.18)', color: '#00F5D4' },
  rejected: { bg: 'rgba(255,45,149,0.12)', color: '#FF2D95' },
  reconciliation_required: { bg: 'rgba(255,138,0,0.16)', color: '#FF8A00' },
};

// There is deliberately no `approved -> paid` step. Reaching `paid` requires a
// transfer code returned by Paystack, so it happens when the transfer is
// confirmed, not from this screen.
const NEXT_STATUS: Record<string, string> = {
  pending: 'processing',
  processing: 'approved',
  // A reversed transfer is resolved by choosing an outcome, not by advancing.
  // 'approved' retries against a corrected account; 'rejected' writes the
  // revenue off. Both clear the reversal and let the host's freeze be lifted.
  reconciliation_required: 'approved',
};

const ACTION_LABEL: Record<string, string> = {
  pending: 'Process',
  processing: 'Approve',
  reconciliation_required: 'Resolve: retry',
};

/**
 * Payouts that can still be sent from this screen.
 *
 * 'transfer_pending' is deliberately excluded. A transfer is already at the
 * bank for those, and offering a Send button would be offering the one action
 * that cannot be undone.
 */
const AWAITING_TRANSFER = new Set(['approved']);

/** Payouts whose money has left this platform but has not landed yet. */
const TRANSFER_IN_FLIGHT = new Set(['transfer_pending']);

/**
 * States with no Reject button.
 *
 * 'paid' is final. 'transfer_pending' is excluded because a transfer is already
 * at the bank: the state machine allows it to be given back to 'approved' (the
 * transfer did not go out) but not to be rejected, since rejecting a payout whose
 * money is in flight would write off revenue the host may well receive.
 */
const NOT_REJECTABLE = new Set(['paid', 'transfer_pending']);

export default function RevenuePage() {
  const { user, ready } = usePermissionGuard('revenue.view');
  const [orders, setOrders] = useState<AdminOrderJoined[]>([]);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [revenueTrend, setRevenueTrend] = useState<{ label: string; value: number }[]>([]);
  const [eventsByCategory, setEventsByCategory] = useState<{ label: string; value: number }[]>([]);
  const [status, setStatus] = useState<'loading' | 'error' | 'ok'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [sendMsg, setSendMsg] = useState<string | null>(null);

  /**
   * Sends an approved payout to the host's verified account.
   *
   * The server picks the destination and the amount, and only marks the payout
   * paid once Paystack reports the transfer went out — a queued transfer comes
   * back as "in progress" and is finished by the provider webhook.
   */
  const handleSendTransfer = async (payout: PayoutRow) => {
    if (!confirm(
      `Send ${formatNaira(payout.amount)} to ${payout.bank_last4 ? `•••• ${payout.bank_last4}` : 'the host\'s account'}? This moves real money.`,
    )) return;
    setSendingId(payout.id);
    setActionError(null);
    setSendMsg(null);
    try {
      const result = await sendPayoutTransfer(payout.id);
      if (result.sent) {
        setSendMsg(`Payout #${payout.id} sent and confirmed by Paystack.`);
        notifyPayout(payout.id, 'paid', payout.bank_last4);
        setPayouts((prev) => prev.map((p) => (p.id === payout.id ? { ...p, status: 'paid' } : p)));
      } else {
        setSendMsg(result.message ?? `Transfer ${result.transferStatus ?? 'pending'} for payout #${payout.id}.`);
      }
      setAttempt((a) => a + 1);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not send the payout.');
    } finally {
      setSendingId(null);
    }
  };

  useEffect(() => {
    if (!ready) return;
    setStatus('loading');
    Promise.all([fetchAllOrders(), fetchPayouts(), fetchRevenueTrend(), fetchEventsByCategory()])
      .then(([o, p, trend, cats]) => {
        setOrders(o);
        setPayouts(p);
        setRevenueTrend(trend);
        setEventsByCategory(cats);
        setStatus('ok');
      })
      .catch(() => setStatus('error'));
  }, [ready, attempt]);

  if (!ready || !user) return null;

  const confirmed = orders.filter((o) => o.payment_status === 'confirmed');
  const totalRevenue = confirmed.reduce((s, o) => s + o.total, 0);
  const now = new Date();
  const thisMonth = confirmed.filter((o) => {
    const d = new Date(o.created_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const thisMonthRevenue = thisMonth.reduce((s, o) => s + o.total, 0);
  const pendingPayouts = payouts
    .filter((p) => ['pending', 'processing', 'transfer_pending'].includes(p.status))
    .reduce((s, p) => s + p.amount, 0);
  const refundCount = orders.filter((o) => o.refund_status !== 'none').length;
  const refundAmount = orders.filter((o) => o.refund_status === 'refunded').reduce((s, o) => s + o.refund_amount, 0);
  // Reversed transfers, surfaced above the payout table rather than buried in it.
  // A reversal means money moved and came back, which is the one payout event
  // that a host will notice as missing from their account, so it is the one that
  // should not wait to be found.
  const reconciliation = payouts.filter((p) => p.status === 'reconciliation_required');

  const handlePayoutAction = async (payout: PayoutRow) => {
    const next = NEXT_STATUS[payout.status];
    if (!next) return;
    try {
      setActionError(null);
      await updatePayoutStatus(payout.id, next);
      setPayouts((prev) => prev.map((p) => (p.id === payout.id ? { ...p, status: next } : p)));
      if (next === 'approved') {
        notifyPayout(payout.id, next, payout.bank_last4);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not update the payout.');
    }
  };

  const handlePayoutReject = async (payout: PayoutRow) => {
    if (payout.status === 'paid') return;
    if (!confirm(`Reject this payout of ${formatNaira(payout.amount)}? The host will be notified.`)) return;
    try {
      setActionError(null);
      await updatePayoutStatus(payout.id, 'rejected');
      setPayouts((prev) => prev.map((p) => (p.id === payout.id ? { ...p, status: 'rejected' } : p)));
      notifyPayout(payout.id, 'rejected', payout.bank_last4);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not reject the payout.');
    }
  };

  const notifyPayout = (payoutId: number, status: string, _bankLast4?: string | null) => {
    fetch('/api/admin/notify-payout-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payoutId, status }),
    }).catch((err) => console.error('[payout] notification failed', err));
  };

  return (
    <AdminShell>
      <div className="mx-auto max-w-[980px] p-5">
        <PageHeader
          title="Revenue & Payouts"
          subtitle="Financial overview and payout management"
          right={
            <button
              onClick={() => setAttempt((a) => a + 1)}
              className="flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-[12.5px] font-semibold"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#A7A8B5' }}
            >
              <RefreshCw size={13} strokeWidth={2.5} /> Refresh
            </button>
          }
        />

        {status === 'loading' ? (
          <LoadingBlock />
        ) : status === 'error' ? (
          <ErrorBlock message="Couldn't load revenue data." onRetry={() => setAttempt((a) => a + 1)} />
        ) : (
          <div className="flex flex-col gap-6">
            {reconciliation.length > 0 && (
              <ReconciliationPanel
                items={reconciliation}
                onAct={handlePayoutAction}
                onReject={handlePayoutReject}
                busyId={sendingId}
              />
            )}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Total Revenue" value={formatNaira(totalRevenue)} icon={Wallet} color="#00F5D4" sub="confirmed orders" />
              <StatCard label="This Month" value={formatNaira(thisMonthRevenue)} icon={ArrowUpRight} color="#FF2D95" sub={`${thisMonth.length} orders`} />
              <StatCard label="Pending Payouts" value={formatNaira(pendingPayouts)} icon={Clock} color="#B06AFF" sub="processing + pending" />
              <StatCard label="Refunds" value={`${refundCount} (${formatNaira(refundAmount)})`} icon={RotateCcw} color="#FF8A00" sub="orders refunded" />
            </div>

            {/* Charts */}
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title="30-Day Revenue Trend">
                <RevenueLineChart data={revenueTrend} />
              </ChartCard>
              <ChartCard title="Revenue by Category">
                <HorizontalBarChart data={eventsByCategory.map((c) => ({ label: c.label, value: c.value * 1000 }))} />
              </ChartCard>
            </div>

            {/* Recent Transactions */}
            <div>
              <h2 className="mb-3 font-heading text-[15px] font-bold" style={{ color: '#FFFFFF' }}>Recent Transactions</h2>
              {orders.length === 0 ? (
                <EmptyBlock title="No transactions" subtitle="Orders will appear here once sales come in." />
              ) : (
                <div className="overflow-x-auto">
                  <TableShell head={['Date', 'Event', 'Guest', 'Amount', 'Status', 'Refund']}>
                    {orders.slice(0, 20).map((o) => (
                      <tr key={o.id}>
                        <Cell>{new Date(o.created_at).toLocaleDateString()}</Cell>
                        <Cell>{o.parties?.title ?? '—'}</Cell>
                        <Cell>{o.customer_email ?? 'Guest'}</Cell>
                        <Cell align="right">{formatNaira(o.total)}</Cell>
                        <Cell>
                          <Badge
                            label={o.payment_status}
                            bg={PAYMENT_BADGE[o.payment_status]?.bg ?? 'rgba(107,108,128,0.15)'}
                            color={PAYMENT_BADGE[o.payment_status]?.color ?? '#6B6C80'}
                          />
                        </Cell>
                        <Cell>{o.refund_status !== 'none' ? <Badge label={o.refund_status} bg="rgba(255,138,0,0.1)" color="#FF8A00" /> : '—'}</Cell>
                      </tr>
                    ))}
                  </TableShell>
                </div>
              )}
            </div>

            {/* Payouts */}
            <div>
              <h2 className="mb-3 font-heading text-[15px] font-bold" style={{ color: '#FFFFFF' }}>Payouts</h2>
              {actionError && (
                <p
                  role="alert"
                  className="mb-3 text-[12px] font-semibold"
                  style={{ color: '#FF8A00' }}
                >
                  {actionError}
                </p>
              )}
              {sendMsg && (
                <p className="mb-3 text-[12px] font-semibold" style={{ color: '#00F5D4' }}>
                  {sendMsg}
                </p>
              )}
              {payouts.length === 0 ? (
                <EmptyBlock title="No payouts" subtitle="Payout records will appear here." />
              ) : (
                <div className="overflow-x-auto">
                  <TableShell head={['Period', 'Revenue', 'Platform Fee', 'Amount', 'Status', 'Bank', 'Transfer', 'Action']}>
                    {payouts.map((p) => (
                      <tr key={p.id}>
                        <Cell>
                          <span className="whitespace-nowrap">
                            {new Date(p.period_start).toLocaleDateString()} – {new Date(p.period_end).toLocaleDateString()}
                          </span>
                        </Cell>
                        <Cell align="right">{formatNaira(p.revenue)}</Cell>
                        <Cell align="right">{formatNaira(p.platform_fee)}</Cell>
                        <Cell align="right">{formatNaira(p.amount)}</Cell>
                        <Cell>
                          <Badge
                            label={p.status}
                            bg={PAYOUT_STATUS[p.status]?.bg ?? 'rgba(107,108,128,0.15)'}
                            color={PAYOUT_STATUS[p.status]?.color ?? '#6B6C80'}
                          />
                        </Cell>
                        <Cell>{p.bank_last4 ? `•••• ${p.bank_last4}` : '—'}</Cell>
                        {/* The transfer code is recorded by mark_payout_paid, so a paid
                            payout can be traced back to an actual provider transfer. */}
                        <Cell>
                          {p.transfer_code ? (
                            <span title={p.transfer_reference ?? undefined}>{p.transfer_code}</span>
                          ) : (
                            '—'
                          )}
                        </Cell>
                        <Cell>
                          <div className="flex items-center gap-1.5">
                            {ACTION_LABEL[p.status] && (
                              <button
                                onClick={() => handlePayoutAction(p)}
                                className="rounded-lg px-3 py-1.5 text-[11px] font-bold transition-colors"
                                style={{ background: 'rgba(255,45,149,0.12)', border: '1px solid rgba(255,45,149,0.3)', color: '#FF2D95' }}
                              >
                                {ACTION_LABEL[p.status]}
                              </button>
                            )}
                            {/* Sending is the only way a payout becomes paid, and the
                                server decides whether it actually did. */}
                            {AWAITING_TRANSFER.has(p.status) && (
                              <button
                                onClick={() => handleSendTransfer(p)}
                                disabled={sendingId === p.id}
                                className="rounded-lg px-3 py-1.5 text-[11px] font-bold transition-colors disabled:opacity-50"
                                style={{ background: 'rgba(0,245,212,0.12)', border: '1px solid rgba(0,245,212,0.3)', color: '#00F5D4' }}
                              >
                                {sendingId === p.id ? 'Sending...' : 'Send transfer'}
                              </button>
                            )}
                            {/* Rejection is allowed from any unresolved state, including
                                `approved` and `reconciliation_required` — which is why
                                this button sits outside the action-label check above. */}
                            {!NOT_REJECTABLE.has(p.status) && (
                              <button
                                onClick={() => handlePayoutReject(p)}
                                className="rounded-lg px-3 py-1.5 text-[11px] font-bold transition-colors"
                                style={{ background: 'rgba(255,45,149,0.06)', border: '1px solid rgba(255,45,149,0.2)', color: '#FF8A00' }}
                              >
                                Reject
                              </button>
                            )}
                            {TRANSFER_IN_FLIGHT.has(p.status) && (
                              <span className="text-[11px] font-semibold text-[#6B6C80]">
                                Awaiting bank
                              </span>
                            )}
                          </div>
                        </Cell>
                      </tr>
                    ))}
                  </TableShell>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}

/**
 * Reversed transfers, above the payout table.
 *
 * Each row is a payout whose money was sent and then came back. Both facts are
 * shown, because deciding what to do needs both: the transfer that was attempted
 * and the reason the bank gave for returning it. The original transfer code and
 * paid timestamp are deliberately still on the payout — the payout genuinely was
 * paid, then reversed, and erasing the first half would make a returned transfer
 * indistinguishable from one that never happened.
 *
 * The host's account is not suspended by this. Most returns are a mistyped
 * account number, and the fastest route back to normal is a corrected account
 * plus a retry, not a suspension.
 */
function ReconciliationPanel({
  items,
  onAct,
  onReject,
  busyId,
}: {
  items: PayoutRow[];
  onAct: (payout: PayoutRow) => void;
  onReject: (payout: PayoutRow) => void;
  busyId: number | null;
}) {
  return (
    <div className="rounded-2xl p-4" style={{ background: 'rgba(255,138,0,0.06)', border: '1px solid rgba(255,138,0,0.28)' }}>
      <div className="mb-3 flex items-start gap-2.5">
        <AlertTriangle size={17} strokeWidth={1.8} color="#FF8A00" className="mt-0.5 shrink-0" />
        <div>
          <div className="text-[13px] font-bold" style={{ color: '#FFFFFF' }}>
            {items.length === 1 ? '1 payout transfer was returned' : `${items.length} payout transfers were returned`}
          </div>
          <div className="text-[11.5px]" style={{ color: '#A7A8B5' }}>
            The money was sent and then came back, so the host has not been paid and their revenue
            is owed again. Their payouts are frozen until this is resolved; their account and events
            are not affected. Check the bank account, then retry — or reject to release the revenue.
          </div>
        </div>
      </div>
      <div className="space-y-2">
        {items.map((p) => (
          <div
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl px-3.5 py-2.5"
            style={{ background: 'rgba(0,0,0,0.3)' }}
          >
            <div className="min-w-0 text-[11.5px]">
              <div style={{ color: '#FFFFFF' }}>
                Payout #{p.id} · {formatNaira(p.amount)}
                {p.bank_last4 ? ` · •••• ${p.bank_last4}` : ''}
              </div>
              <div style={{ color: '#A7A8B5' }}>
                {p.reversal_reason || 'The bank or provider returned this transfer.'}
              </div>
              <div style={{ color: '#6B6C80' }}>
                Sent as{' '}
                <span className="font-mono">
                  {p.transfer_code ?? p.transfer_reference ?? 'an unrecorded transfer'}
                </span>
                {p.reversed_at ? ` · returned ${new Date(p.reversed_at).toLocaleDateString('en-NG')}` : ''}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => onAct(p)}
                disabled={busyId === p.id}
                className="rounded-lg px-3 py-1.5 text-[11px] font-bold disabled:opacity-50"
                style={{ background: 'rgba(0,245,212,0.12)', border: '1px solid rgba(0,245,212,0.3)', color: '#00F5D4' }}
              >
                Retry to corrected account
              </button>
              <button
                onClick={() => onReject(p)}
                className="rounded-lg px-3 py-1.5 text-[11px] font-bold"
                style={{ background: 'rgba(255,45,149,0.06)', border: '1px solid rgba(255,45,149,0.2)', color: '#FF2D95' }}
              >
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
