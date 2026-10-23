'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Clock3,
  Download,
  ExternalLink,
  Eye,
  MousePointerClick,
  Ticket,
  TrendingUp,
  Users,
} from 'lucide-react';
import AdminShell from '@/components/admin-shell';
import { StatCard, PageHeader, LoadingBlock, ErrorBlock, useRoleGuard } from '@/components/ui/dashboard-ui';
import { HorizontalBarChart, PieChartDisplay, RevenueLineChart, TicketsLineChart, VerticalBarChart, ChartCard } from '@/components/ui/charts';
import { fetchAllOrders, filterOrdersByDays, toCsv, downloadCsv, type AdminOrderJoined } from '@/lib/admin-queries';
import { supabase } from '@/lib/supabase/client';
import { formatNaira } from '@/lib/filters';
import type { AnalyticsSummary } from '@/lib/analytics';

interface PartyRow {
  id: number;
  title: string;
  starts_at: string;
  status: string;
  capacity: number;
  spots_left: number;
  fee_num: number;
}

const RANGES = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: 'All', days: 0 },
];

function formatDuration(seconds: number): string {
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export default function AnalyticsPage() {
  const { user, ready } = useRoleGuard('admin');
  const [orders, setOrders] = useState<AdminOrderJoined[]>([]);
  const [parties, setParties] = useState<PartyRow[]>([]);
  const [status, setStatus] = useState<'loading' | 'error' | 'ok'>('loading');
  const [trafficStatus, setTrafficStatus] = useState<'loading' | 'error' | 'ok'>('loading');
  const [traffic, setTraffic] = useState<AnalyticsSummary | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [rangeDays, setRangeDays] = useState(30);

  useEffect(() => {
    if (!ready) return;
    setStatus('loading');
    Promise.all([
      fetchAllOrders(),
      supabase.from('parties').select('id, title, starts_at, status, capacity, spots_left, fee_num'),
    ])
      .then(([o, p]) => {
        if (p.error) throw p.error;
        setOrders(o);
        setParties((p.data ?? []) as PartyRow[]);
        setStatus('ok');
      })
      .catch(() => setStatus('error'));
  }, [ready, attempt]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setTrafficStatus('loading');
    fetch(`/api/admin/analytics?days=${rangeDays}`, { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json() as { analytics?: AnalyticsSummary; error?: string };
        if (!response.ok || !payload.analytics) throw new Error(payload.error ?? 'Could not load web analytics.');
        if (!cancelled) {
          setTraffic(payload.analytics);
          setTrafficStatus('ok');
        }
      })
      .catch(() => {
        if (!cancelled) setTrafficStatus('error');
      });
    return () => { cancelled = true; };
  }, [ready, rangeDays, attempt]);

  const salesOrders = useMemo(() => orders.filter((o) => o.tier !== 'complimentary'), [orders]);
  const filtered = useMemo(() => filterOrdersByDays(salesOrders, rangeDays), [salesOrders, rangeDays]);
  const confirmed = useMemo(() => filtered.filter((o) => o.payment_status === 'confirmed'), [filtered]);

  const totalRevenue = confirmed.reduce((s, o) => s + o.total, 0);
  const totalTickets = confirmed.reduce((s, o) => s + o.quantity, 0);
  const avgOrderValue = confirmed.length > 0 ? totalRevenue / confirmed.length : 0;
  const refundOrders = filtered.filter((o) => o.refund_status !== 'none').length;
  const refundRate = filtered.length > 0 ? ((refundOrders / filtered.length) * 100).toFixed(1) : '0.0';

  const revenueTrend = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = rangeDays || 30;
    const buckets = new Map<string, { label: string; value: number }>();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400000);
      buckets.set(d.toDateString(), {
        label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        value: 0,
      });
    }
    for (const o of confirmed) {
      const key = new Date(o.created_at).toDateString();
      const b = buckets.get(key);
      if (b) b.value += o.total;
    }
    return [...buckets.values()];
  }, [confirmed, rangeDays]);

  const eventsByCategory = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of parties) {
      if (p.status !== 'approved') continue;
      counts.General = (counts.General || 0) + 1;
    }
    const vibeCounts: Record<string, number> = {};
    for (const o of confirmed) {
      const party = parties.find((p) => p.id === o.party_id);
      if (!party) continue;
      const label = party.fee_num > 0 ? 'Paid Events' : 'Free Events';
      vibeCounts[label] = (vibeCounts[label] || 0) + 1;
    }
    return Object.entries(Object.keys(vibeCounts).length > 0 ? vibeCounts : counts)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [confirmed, parties]);

  const ordersByStatus = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const o of filtered) counts[o.payment_status] = (counts[o.payment_status] || 0) + 1;
    return Object.entries(counts).map(([label, value]) => ({ label, value }));
  }, [filtered]);

  const revenueByEvent = useMemo(() => {
    const map = new Map<number, { id: number; title: string; revenue: number; tickets: number }>();
    for (const p of parties) map.set(p.id, { id: p.id, title: p.title, revenue: 0, tickets: 0 });
    for (const o of confirmed) {
      const entry = map.get(o.party_id);
      if (entry) {
        entry.revenue += o.total;
        entry.tickets += o.quantity;
      }
    }
    return [...map.values()].filter((e) => e.revenue > 0).sort((a, b) => b.revenue - a.revenue);
  }, [confirmed, parties]);

  const handleExportCsv = () => {
    const rows = filtered.map((o) => ({
      id: o.id,
      event: o.parties?.title ?? '',
      tier: o.tier,
      quantity: o.quantity,
      total: o.total,
      payment_status: o.payment_status,
      created_at: o.created_at,
    }));
    const csv = toCsv(rows, ['id', 'event', 'tier', 'quantity', 'total', 'payment_status', 'created_at']);
    downloadCsv(`analytics-${rangeDays || 'all'}d.csv`, csv);
  };

  const handleExportTrafficCsv = () => {
    if (!traffic) return;
    const rows = traffic.daily.map((day) => ({
      date: day.label,
      page_views: day.pageViews,
      visitors: day.visitors,
    }));
    downloadCsv(`website-traffic-${rangeDays || 'all'}d.csv`, toCsv(rows, ['date', 'page_views', 'visitors']));
  };

  if (!ready || !user) return null;

  return (
    <AdminShell>
      <div className="mx-auto max-w-[1100px] p-5">
        <PageHeader
          title="Analytics"
          subtitle="Sales performance plus anonymous website traffic"
          right={
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleExportTrafficCsv}
                disabled={!traffic}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold disabled:opacity-40"
                style={{ background: 'rgba(0,245,212,0.1)', border: '1px solid rgba(0,245,212,0.25)', color: '#00F5D4' }}
              >
                <Download size={12} strokeWidth={2.5} /> Export traffic
              </button>
              <button
                onClick={handleExportCsv}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold"
                style={{ background: 'rgba(43,104,255,0.12)', border: '1px solid rgba(43,104,255,0.25)', color: '#79A3FF' }}
              >
                <Download size={12} strokeWidth={2.5} /> Export sales
              </button>
            </div>
          }
        />

        <div className="mb-5 flex gap-1 rounded-xl p-1" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setRangeDays(r.days)}
              className="flex-1 rounded-lg px-3 py-2 text-[11px] font-bold transition-all"
              style={rangeDays === r.days ? { background: 'rgba(43,104,255,0.15)', color: '#2B68FF' } : { color: '#6B6C80' }}
            >
              {r.label}
            </button>
          ))}
        </div>

        <section className="mb-8" aria-labelledby="website-traffic-heading">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="website-traffic-heading" className="font-heading text-[16px] font-bold" style={{ color: '#FFFFFF' }}>Website traffic</h2>
              <p className="mt-1 text-[11px]" style={{ color: '#6B6C80' }}>Guests and signed-in visitors counted together using anonymous first-party IDs. No names, emails or IP addresses.</p>
            </div>
            {traffic && <span className="text-[10px]" style={{ color: '#6B6C80' }}>{traffic.bounceRate}% bounce rate</span>}
          </div>

          {trafficStatus === 'loading' ? (
            <LoadingBlock />
          ) : trafficStatus === 'error' ? (
            <ErrorBlock message="Web traffic is not available yet. Apply the analytics migration, then retry." onRetry={() => setAttempt((value) => value + 1)} />
          ) : traffic ? (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="Unique Visitors" value={traffic.uniqueVisitors.toLocaleString()} icon={Users} color="#00F5D4" sub={`${rangeDays || 'all'} day range`} />
                <StatCard label="Sessions" value={traffic.sessions.toLocaleString()} icon={Activity} color="#79A3FF" />
                <StatCard label="Page Views" value={traffic.pageViews.toLocaleString()} icon={Eye} color="#2B68FF" />
                <StatCard label="Avg Session" value={formatDuration(traffic.averageSessionSeconds)} icon={Clock3} color="#FFD600" />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <ChartCard title="Page views by day">
                  <TicketsLineChart data={traffic.daily.map((day) => ({ label: day.label, value: day.pageViews, visitors: day.visitors }))} />
                </ChartCard>
                <ChartCard title="Top pages">
                  <HorizontalBarChart data={traffic.topPages} />
                </ChartCard>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <ChartCard title="Visitor device mix">
                  <PieChartDisplay data={traffic.devices.length > 0 ? traffic.devices : [{ label: 'No data', value: 1 }]} />
                </ChartCard>
                <ChartCard title="Guest vs signed-in page views">
                  <PieChartDisplay
                    data={traffic.guestPageViews + traffic.signedInPageViews > 0
                      ? [{ label: 'Guest', value: traffic.guestPageViews }, { label: 'Signed in', value: traffic.signedInPageViews }]
                      : [{ label: 'No data', value: 1 }]}
                  />
                </ChartCard>
                <ChartCard title="Tracked interactions">
                  <HorizontalBarChart data={traffic.interactions.length > 0 ? traffic.interactions : [{ label: 'No data', value: 1 }]} />
                </ChartCard>
              </div>

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="Buy-ticket clicks" value={traffic.funnel.buyTicketClicks.toLocaleString()} icon={MousePointerClick} color="#FF8A00" />
                <StatCard label="Checkout starts" value={traffic.funnel.checkoutStarts.toLocaleString()} icon={BarChart3} color="#FFB347" />
                <StatCard label="Completed purchases" value={traffic.funnel.purchases.toLocaleString()} icon={Ticket} color="#3ECF8E" />
                <StatCard label="Total time" value={formatDuration(traffic.totalTimeSeconds)} icon={Clock3} color="#B06AFF" sub="measured page time" />
              </div>
            </div>
          ) : null}
        </section>

        <section aria-labelledby="sales-heading">
          <div className="mb-3 flex items-end justify-between gap-2">
            <div>
              <h2 id="sales-heading" className="font-heading text-[16px] font-bold" style={{ color: '#FFFFFF' }}>Sales performance</h2>
              <p className="mt-1 text-[11px]" style={{ color: '#6B6C80' }}>Confirmed ticket revenue and order performance.</p>
            </div>
          </div>

          {status === 'loading' ? (
            <LoadingBlock />
          ) : status === 'error' ? (
            <ErrorBlock message="Couldn't load sales analytics." onRetry={() => setAttempt((value) => value + 1)} />
          ) : (
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="Revenue" value={formatNaira(totalRevenue)} icon={TrendingUp} color="#00F5D4" sub={`${rangeDays ? rangeDays + 'd' : 'all'} range`} />
                <StatCard label="Tickets Sold" value={String(totalTickets)} icon={Ticket} color="#2B68FF" />
                <StatCard label="Avg Order" value={formatNaira(avgOrderValue)} icon={TrendingUp} color="#79A3FF" />
                <StatCard label="Refund Rate" value={`${refundRate}%`} icon={AlertTriangle} color="#FF8A00" sub={`${refundOrders} orders`} />
              </div>

              <ChartCard title="Revenue Trend">
                <RevenueLineChart data={revenueTrend} />
              </ChartCard>

              <div className="grid gap-4 lg:grid-cols-2">
                <ChartCard title="Orders by Status">
                  <VerticalBarChart data={ordersByStatus} />
                </ChartCard>
                <ChartCard title="Events by Type">
                  <PieChartDisplay data={eventsByCategory.length > 0 ? eventsByCategory : [{ label: 'No data', value: 1 }]} />
                </ChartCard>
              </div>

              <div>
                <h2 className="mb-3 font-heading text-[15px] font-bold" style={{ color: '#FFFFFF' }}>Revenue by Event</h2>
                {revenueByEvent.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 rounded-2xl py-10 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div className="text-[13px] font-semibold" style={{ color: '#FFFFFF' }}>No revenue data</div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    {revenueByEvent.slice(0, 10).map((event) => (
                      <Link key={event.id} href={`/admin/events/${event.id}`} className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-white/5">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[12px] font-medium" style={{ color: '#D5D6E0' }}>{event.title}</div>
                          <div className="text-[10px]" style={{ color: '#6B6C80' }}>{event.tickets} tickets</div>
                        </div>
                        <div className="shrink-0 text-right text-[12px] font-semibold tabular-nums" style={{ color: '#FFFFFF' }}>{formatNaira(event.revenue)}</div>
                        <ExternalLink size={12} color="#6B6C80" />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
