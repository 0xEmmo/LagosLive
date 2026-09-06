'use client';

import { useEffect, useState } from 'react';
import { Wallet, ArrowDownRight, ArrowUpRight, Clock, RotateCcw, RefreshCw } from 'lucide-react';
import AdminShell from '@/components/admin-shell';
import { StatCard, PageHeader, Badge, TableShell, Cell, LoadingBlock, ErrorBlock, EmptyBlock, usePermissionGuard } from '@/components/ui/dashboard-ui';
import { RevenueLineChart, HorizontalBarChart, ChartCard } from '@/components/ui/charts';
import { fetchAllOrders, fetchPayouts, fetchRevenueTrend, fetchEventsByCategory, updatePayoutStatus, logAudit, type AdminOrderJoined, type PayoutRow } from '@/lib/admin-queries';
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
  paid: { bg: 'rgba(0,245,212,0.18)', color: '#00F5D4' },
  rejected: { bg: 'rgba(255,45,149,0.12)', color: '#FF2D95' },
};

const NEXT_STATUS: Record<string, string> = {
  pending: 'processing',
  processing: 'approved',
  approved: 'paid',
};

const ACTION_LABEL: Record<string, string> = {
  pending: 'Process',
  processing: 'Approve',
  approved: 'Mark Paid',
};

export default function RevenuePage() {
  const { user, ready } = usePermissionGuard('revenue.view');
  const [orders, setOrders] = useState<AdminOrderJoined[]>([]);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [revenueTrend, setRevenueTrend] = useState<{ label: string; value: number }[]>([]);
  const [eventsByCategory, setEventsByCategory] = useState<{ label: string; value: number }[]>([]);
  const [status, setStatus] = useState<'loading' | 'error' | 'ok'>('loading');
  const [attempt, setAttempt] = useState(0);

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
    .filter((p) => p.status === 'pending' || p.status === 'processing')
    .reduce((s, p) => s + p.amount, 0);
  const refundCount = orders.filter((o) => o.refund_status !== 'none').length;
  const refundAmount = orders.filter((o) => o.refund_status === 'refunded').reduce((s, o) => s + o.refund_amount, 0);

  const handlePayoutAction = async (payout: PayoutRow) => {
    const next = NEXT_STATUS[payout.status];
    if (!next) return;
    try {
      await updatePayoutStatus(payout.id, next);
      await logAudit('payout_status', 'payout', payout.id, { status: next });
      setPayouts((prev) => prev.map((p) => (p.id === payout.id ? { ...p, status: next } : p)));
      if (next === 'approved' || next === 'paid') {
        notifyPayout(payout.id, next, payout.bank_last4);
      }
    } catch {
      /* silent – RLS may block */
    }
  };

  const handlePayoutReject = async (payout: PayoutRow) => {
    if (payout.status !== 'pending') return;
    if (!confirm(`Reject this payout of ${formatNaira(payout.amount)}? The host will be notified.`)) return;
    try {
      await updatePayoutStatus(payout.id, 'rejected');
      await logAudit('payout_reject', 'payout', payout.id);
      setPayouts((prev) => prev.map((p) => (p.id === payout.id ? { ...p, status: 'rejected' } : p)));
      notifyPayout(payout.id, 'rejected', payout.bank_last4);
    } catch {
      /* silent */
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
              {payouts.length === 0 ? (
                <EmptyBlock title="No payouts" subtitle="Payout records will appear here." />
              ) : (
                <div className="overflow-x-auto">
                  <TableShell head={['Period', 'Revenue', 'Platform Fee', 'Amount', 'Status', 'Bank', 'Action']}>
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
                         <Cell>
                          {ACTION_LABEL[p.status] && (
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handlePayoutAction(p)}
                                className="rounded-lg px-3 py-1.5 text-[11px] font-bold transition-colors"
                                style={{ background: 'rgba(255,45,149,0.12)', border: '1px solid rgba(255,45,149,0.3)', color: '#FF2D95' }}
                              >
                                {ACTION_LABEL[p.status]}
                              </button>
                              {p.status === 'pending' && (
                                <button
                                  onClick={() => handlePayoutReject(p)}
                                  className="rounded-lg px-3 py-1.5 text-[11px] font-bold transition-colors"
                                  style={{ background: 'rgba(255,45,149,0.06)', border: '1px solid rgba(255,45,149,0.2)', color: '#FF8A00' }}
                                >
                                  Reject
                                </button>
                              )}
                            </div>
                          )}
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
