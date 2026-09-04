'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, Users, Wallet, Ticket, Clock, ShoppingBag, ArrowRight, Flag, RefreshCw } from 'lucide-react';
import AdminShell from '@/components/admin-shell';
import { StatCard, PageHeader, LoadingBlock, ErrorBlock, TableShell, Cell, Badge, useRoleGuard } from '@/components/ui/dashboard-ui';
import { RevenueLineChart, PieChartDisplay, VerticalBarChart, ChartCard } from '@/components/ui/charts';
import { formatNaira } from '@/lib/filters';
import {
  fetchOverviewMetrics,
  fetchRevenueTrend,
  fetchEventsByCategory,
  fetchOrdersByStatus,
  fetchRecentOrders,
  type OverviewMetrics,
  type AdminOrderJoined,
} from '@/lib/admin-queries';

const PAYMENT_STYLE: Record<string, { label: string; bg: string; color: string }> = {
  pending: { label: 'Pending', bg: 'rgba(255,214,0,0.12)', color: '#FFD600' },
  confirmed: { label: 'Confirmed', bg: 'rgba(0,245,212,0.1)', color: '#00F5D4' },
  failed: { label: 'Failed', bg: 'rgba(255,138,0,0.1)', color: '#FF8A00' },
  cancelled: { label: 'Cancelled', bg: 'rgba(255,45,149,0.12)', color: '#FF2D95' },
};

export default function AdminDashboardPage() {
  const { user, ready } = useRoleGuard('admin');
  const [metrics, setMetrics] = useState<OverviewMetrics | null>(null);
  const [revenueTrend, setRevenueTrend] = useState<{ label: string; value: number }[]>([]);
  const [eventsByCategory, setEventsByCategory] = useState<{ label: string; value: number }[]>([]);
  const [ordersByStatus, setOrdersByStatus] = useState<{ label: string; value: number }[]>([]);
  const [recentOrders, setRecentOrders] = useState<AdminOrderJoined[]>([]);
  const [status, setStatus] = useState<'loading' | 'error' | 'ok'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!ready) return;
    setStatus('loading');
    Promise.all([
      fetchOverviewMetrics(),
      fetchRevenueTrend(),
      fetchEventsByCategory(),
      fetchOrdersByStatus(),
      fetchRecentOrders(),
    ])
      .then(([m, trend, cats, orderStatus, orders]) => {
        setMetrics(m);
        setRevenueTrend(trend);
        setEventsByCategory(cats);
        setOrdersByStatus(orderStatus);
        setRecentOrders(orders);
        setStatus('ok');
      })
      .catch(() => setStatus('error'));
  }, [ready, attempt]);

  if (!ready || !user) return null;

  return (
    <AdminShell>
      <div className="mx-auto max-w-[980px] p-5">
        <PageHeader
          title={`Welcome, ${user.name.split(' ')[0]}`}
          subtitle="Platform overview"
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
          <ErrorBlock message="Couldn't load metrics." onRetry={() => setAttempt((a) => a + 1)} />
        ) : metrics ? (
          <div className="flex flex-col gap-6">
            {/* Metric Cards */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Active Events" value={String(metrics.totalEvents)} icon={CalendarDays} color="#FF2D95" sub={`${metrics.pendingEvents} pending review`} />
              <StatCard label="Hosts" value={String(metrics.totalHosts)} icon={Users} color="#B06AFF" />
              <StatCard label="Revenue" value={formatNaira(metrics.totalRevenue)} icon={Wallet} color="#00F5D4" sub="confirmed sales" />
              <StatCard label="Tickets Sold" value={String(metrics.totalTicketsSold)} icon={Ticket} color="#FFD600" />
              <StatCard label="Upcoming Events" value={String(metrics.upcomingEvents)} icon={Clock} color="#00BFFF" />
              <StatCard label="Total Orders" value={String(metrics.recentOrders)} icon={ShoppingBag} color="#FFFFFF" />
            </div>

            {/* Charts Row */}
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title="30-Day Revenue Trend">
                <RevenueLineChart data={revenueTrend} />
              </ChartCard>
              <ChartCard title="Events by Category">
                <PieChartDisplay data={eventsByCategory} />
              </ChartCard>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title="Orders by Status">
                <VerticalBarChart data={ordersByStatus} />
              </ChartCard>

              {/* Quick Actions */}
              <div className="flex flex-col gap-3">
                <Link
                  href="/admin/events"
                  className="group flex items-center justify-between rounded-2xl p-5 transition-transform active:scale-[0.99]"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,214,0,0.2)' }}
                >
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[1px]" style={{ color: '#FFD600' }}>Moderation Queue</div>
                    <div className="mt-1 font-display text-[20px]" style={{ color: '#FFFFFF' }}>{metrics.pendingEvents} pending event{metrics.pendingEvents === 1 ? '' : 's'}</div>
                  </div>
                  <ArrowRight size={18} className="text-[#FFD600] transition-transform group-hover:translate-x-1" />
                </Link>
                <Link
                  href="/admin/hosts"
                  className="group flex items-center justify-between rounded-2xl p-5 transition-transform active:scale-[0.99]"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(176,106,255,0.2)' }}
                >
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[1px]" style={{ color: '#B06AFF' }}>Hosts</div>
                    <div className="mt-1 font-display text-[20px]" style={{ color: '#FFFFFF' }}>{metrics.totalHosts} organizers</div>
                  </div>
                  <ArrowRight size={18} className="text-[#B06AFF] transition-transform group-hover:translate-x-1" />
                </Link>
                <Link
                  href="/admin/orders"
                  className="group flex items-center justify-between rounded-2xl p-5 transition-transform active:scale-[0.99]"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(0,245,212,0.2)' }}
                >
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[1px]" style={{ color: '#00F5D4' }}>Orders</div>
                    <div className="mt-1 font-display text-[20px]" style={{ color: '#FFFFFF' }}>{metrics.recentOrders} total</div>
                  </div>
                  <ArrowRight size={18} className="text-[#00F5D4] transition-transform group-hover:translate-x-1" />
                </Link>
                <Link
                  href="/admin/revenue"
                  className="group flex items-center justify-between rounded-2xl p-5 transition-transform active:scale-[0.99]"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,45,149,0.2)' }}
                >
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[1px]" style={{ color: '#FF2D95' }}>Revenue</div>
                    <div className="mt-1 font-display text-[20px]" style={{ color: '#FFFFFF' }}>{formatNaira(metrics.totalRevenue)}</div>
                  </div>
                  <ArrowRight size={18} className="text-[#FF2D95] transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
            </div>

            {/* Recent Orders */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[13px] font-bold" style={{ color: '#FFFFFF' }}>Recent Orders</span>
                <Link href="/admin/orders" className="text-[11px] font-semibold" style={{ color: '#FF2D95' }}>View all →</Link>
              </div>
              {recentOrders.length === 0 ? (
                <EmptyBlock title="No orders yet" />
              ) : (
                <TableShell head={['Order', 'Guest', 'Event', 'Amount', 'Status', 'Date']}>
                  {recentOrders.map((order) => {
                    const st = PAYMENT_STYLE[order.payment_status] ?? PAYMENT_STYLE.pending;
                    return (
                      <tr key={order.id} className="transition-colors hover:bg-white/[0.02]">
                        <Cell>
                          <Link href={`/admin/orders/${order.id}`} className="font-heading font-bold hover:underline" style={{ color: '#FFFFFF' }}>
                            {order.order_ref}
                          </Link>
                        </Cell>
                        <Cell>{order.customer_email ?? 'Guest'}</Cell>
                        <Cell className="max-w-[120px] truncate">{order.parties?.title ?? '—'}</Cell>
                        <Cell><span className="font-semibold">{formatNaira(order.total)}</span></Cell>
                        <Cell><Badge label={st.label} bg={st.bg} color={st.color} /></Cell>
                        <Cell>{new Date(order.created_at).toLocaleDateString()}</Cell>
                      </tr>
                    );
                  })}
                </TableShell>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </AdminShell>
  );
}

function EmptyBlock({ title }: { title: string }) {
  return (
    <div className="rounded-2xl px-6 py-8 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="font-display text-[16px] tracking-[0.5px]" style={{ color: '#FFFFFF' }}>{title}</div>
    </div>
  );
}
