'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, DollarSign, Ticket, TrendingUp, Download } from 'lucide-react';
import AdminShell from '@/components/admin-shell';
import { StatCard, PageHeader, Badge, TableShell, Cell, LoadingBlock, ErrorBlock, usePermissionGuard } from '@/components/ui/dashboard-ui';
import { RevenueLineChart, VerticalBarChart, ChartCard } from '@/components/ui/charts';
import { fetchEventOrders, fetchAdminEvent, toCsv, downloadCsv, type AdminOrderJoined, type AdminEventJoined } from '@/lib/admin-queries';
import { formatNaira } from '@/lib/filters';

export default function EventAnalyticsPage() {
  const params = useParams();
  const { user, ready } = usePermissionGuard('analytics.events');
  const eventId = Number(params.id);

  const [event, setEvent] = useState<AdminEventJoined | null>(null);
  const [orders, setOrders] = useState<AdminOrderJoined[]>([]);
  const [status, setStatus] = useState<'loading' | 'error' | 'ok'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!ready || !user) return;
    setStatus('loading');
    Promise.all([fetchAdminEvent(eventId), fetchEventOrders(eventId)])
      .then(([e, o]) => {
        setEvent(e);
        setOrders(o);
        setStatus('ok');
      })
      .catch(() => setStatus('error'));
  }, [ready, user, eventId, attempt]);

  const confirmed = orders.filter((o) => o.payment_status === 'confirmed');
  const totalRevenue = confirmed.reduce((s, o) => s + o.total, 0);
  const totalTickets = confirmed.reduce((s, o) => s + o.quantity, 0);
  const avgOrder = confirmed.length > 0 ? totalRevenue / confirmed.length : 0;
  const checkedIn = orders.filter((o) => o.check_in_status === 'checked_in').length;

  // Revenue trend (14 days)
  const revenueTrend = (() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const buckets = new Map<string, { label: string; value: number }>();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400000);
      buckets.set(d.toDateString(), {
        label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        value: 0,
      });
    }
    for (const o of confirmed) {
      const b = buckets.get(new Date(o.created_at).toDateString());
      if (b) b.value += o.total;
    }
    return [...buckets.values()];
  })();

  // Orders by status
  const ordersByStatus = (() => {
    const counts: Record<string, number> = {};
    for (const o of orders) counts[o.payment_status] = (counts[o.payment_status] || 0) + 1;
    return Object.entries(counts).map(([label, value]) => ({ label, value }));
  })();

  // Ticket breakdown
  const ticketBreakdown = (() => {
    const map = new Map<string, { sold: number; revenue: number }>();
    for (const o of confirmed) {
      const name = o.tier || 'General';
      const entry = map.get(name) ?? { sold: 0, revenue: 0 };
      entry.sold += o.quantity;
      entry.revenue += o.total;
      map.set(name, entry);
    }
    return [...map.entries()].map(([name, data]) => ({ name, ...data }));
  })();

  const handleExportCsv = () => {
    const rows = orders.map((o) => ({
      ref: o.order_ref,
      tier: o.tier,
      quantity: o.quantity,
      total: o.total,
      payment_status: o.payment_status,
      check_in: o.check_in_status,
      created_at: o.created_at,
    }));
    downloadCsv(`event-${eventId}-orders.csv`, toCsv(rows, ['ref', 'tier', 'quantity', 'total', 'payment_status', 'check_in', 'created_at']));
  };

  if (!ready || !user) return null;

  return (
    <AdminShell>
      <div className="mx-auto max-w-[980px] p-5">
        <div className="mb-4 flex items-center gap-3">
          <Link href="/admin/analytics" className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: '#6B6C80' }}>
            <ArrowLeft size={14} /> Analytics
          </Link>
        </div>

        <PageHeader
          title={event?.title ?? `Event #${eventId}`}
          subtitle={event ? `${event.location} · ${new Date(event.starts_at).toLocaleDateString()}` : 'Event analytics'}
          right={
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold"
              style={{ background: 'rgba(0,245,212,0.1)', border: '1px solid rgba(0,245,212,0.25)', color: '#00F5D4' }}
            >
              <Download size={12} strokeWidth={2.5} /> Export
            </button>
          }
        />

        {status === 'loading' ? (
          <LoadingBlock />
        ) : status === 'error' || !event ? (
          <ErrorBlock message="Couldn't load event analytics." onRetry={() => setAttempt((a) => a + 1)} />
        ) : (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Revenue" value={formatNaira(totalRevenue)} icon={DollarSign} color="#00F5D4" />
              <StatCard label="Tickets Sold" value={`${totalTickets} / ${event.capacity}`} icon={Ticket} color="#FF2D95" sub={`${event.capacity - event.spots_left} checked in`} />
              <StatCard label="Avg Order" value={formatNaira(avgOrder)} icon={TrendingUp} color="#B06AFF" />
              <StatCard label="Check-ins" value={`${checkedIn}`} icon={TrendingUp} color="#FFD600" sub={`${orders.length} total orders`} />
            </div>

            <ChartCard title="Revenue Trend (14d)">
              <RevenueLineChart data={revenueTrend} />
            </ChartCard>

            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title="Orders by Status">
                <VerticalBarChart data={ordersByStatus} />
              </ChartCard>

              <ChartCard title="Ticket Breakdown">
                {ticketBreakdown.length === 0 ? (
                  <div className="text-[12px]" style={{ color: '#6B6C80' }}>No sales yet</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {ticketBreakdown.map((t) => (
                      <div key={t.name} className="flex items-center justify-between rounded-xl px-3 py-2" style={{ background: 'rgba(255,255,255,0.03)' }}>
                        <div>
                          <div className="text-[12px] font-semibold" style={{ color: '#D5D6E0' }}>{t.name}</div>
                          <div className="text-[10px]" style={{ color: '#6B6C80' }}>{t.sold} sold</div>
                        </div>
                        <div className="text-[12px] font-semibold tabular-nums" style={{ color: '#FFFFFF' }}>{formatNaira(t.revenue)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </ChartCard>
            </div>

            {/* Orders table */}
            <div>
              <h2 className="mb-3 font-heading text-[15px] font-bold" style={{ color: '#FFFFFF' }}>All Orders ({orders.length})</h2>
              {orders.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-2xl py-10 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="text-[13px] font-semibold" style={{ color: '#FFFFFF' }}>No orders yet</div>
                </div>
              ) : (
                <TableShell head={['Ref', 'Tier', 'Qty', 'Total', 'Status', 'Check-in', 'Date']}>
                  {orders.slice(0, 50).map((o) => (
                    <tr key={o.id}>
                      <Cell>
                        <Link href={`/admin/orders/${o.id}`} className="text-[11px] font-mono hover:underline" style={{ color: '#FF2D95' }}>
                          {o.order_ref}
                        </Link>
                      </Cell>
                      <Cell>{o.tier}</Cell>
                      <Cell>{o.quantity}</Cell>
                      <Cell>{formatNaira(o.total)}</Cell>
                      <Cell>
                        <Badge
                          label={o.payment_status}
                          bg={o.payment_status === 'confirmed' ? 'rgba(0,245,212,0.1)' : o.payment_status === 'pending' ? 'rgba(255,214,0,0.1)' : 'rgba(255,45,149,0.12)'}
                          color={o.payment_status === 'confirmed' ? '#00F5D4' : o.payment_status === 'pending' ? '#FFD600' : '#FF2D95'}
                        />
                      </Cell>
                      <Cell>
                        <Badge
                          label={o.check_in_status}
                          bg={o.check_in_status === 'checked_in' ? 'rgba(0,245,212,0.1)' : 'rgba(107,108,128,0.15)'}
                          color={o.check_in_status === 'checked_in' ? '#00F5D4' : '#6B6C80'}
                        />
                      </Cell>
                      <Cell>{new Date(o.created_at).toLocaleDateString()}</Cell>
                    </tr>
                  ))}
                </TableShell>
              )}
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
