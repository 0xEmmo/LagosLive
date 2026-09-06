'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { DollarSign, Ticket, TrendingUp, AlertTriangle, Download, ExternalLink } from 'lucide-react';
import AdminShell from '@/components/admin-shell';
import { StatCard, PageHeader, Badge, LoadingBlock, ErrorBlock, usePermissionGuard } from '@/components/ui/dashboard-ui';
import { RevenueLineChart, PieChartDisplay, VerticalBarChart, ChartCard } from '@/components/ui/charts';
import { fetchAllOrders, filterOrdersByDays, toCsv, downloadCsv, type AdminOrderJoined } from '@/lib/admin-queries';
import { supabase } from '@/lib/supabase/client';
import { formatNaira } from '@/lib/filters';

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

export default function AnalyticsPage() {
  const { user, ready } = usePermissionGuard('analytics.view');
  const [orders, setOrders] = useState<AdminOrderJoined[]>([]);
  const [parties, setParties] = useState<PartyRow[]>([]);
  const [status, setStatus] = useState<'loading' | 'error' | 'ok'>('loading');
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

  const filtered = useMemo(() => filterOrdersByDays(orders, rangeDays), [orders, rangeDays]);
  const confirmed = useMemo(() => filtered.filter((o) => o.payment_status === 'confirmed'), [filtered]);

  const totalRevenue = confirmed.reduce((s, o) => s + o.total, 0);
  const totalTickets = confirmed.reduce((s, o) => s + o.quantity, 0);
  const avgOrderValue = confirmed.length > 0 ? totalRevenue / confirmed.length : 0;
  const refundOrders = filtered.filter((o) => o.refund_status !== 'none').length;
  const refundRate = filtered.length > 0 ? ((refundOrders / filtered.length) * 100).toFixed(1) : '0.0';

  // Revenue trend
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

  // Events by category
  const eventsByCategory = useMemo(() => {
    const partyStatuses = rangeDays > 0
      ? parties.filter((p) => {
          const created = new Date(p.starts_at).getTime();
          return created >= Date.now() - rangeDays * 86400000 || true; // show all approved
        })
      : parties;
    const counts: Record<string, number> = {};
    for (const p of partyStatuses) {
      if (p.status !== 'approved') continue;
      const vibe = 'General';
      counts[vibe] = (counts[vibe] || 0) + 1;
    }
    // Use confirmed orders per event vibe instead
    const vibeCounts: Record<string, number> = {};
    for (const o of confirmed) {
      const party = parties.find((p) => p.id === o.party_id);
      if (!party) continue;
      vibeCounts[party.fee_num > 0 ? 'Paid Events' : 'Free Events'] =
        (vibeCounts[party.fee_num > 0 ? 'Paid Events' : 'Free Events'] || 0) + 1;
    }
    return Object.entries(vibeCounts.length > 0 ? vibeCounts : counts)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [confirmed, parties, rangeDays]);

  // Orders by status
  const ordersByStatus = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const o of filtered) {
      counts[o.payment_status] = (counts[o.payment_status] || 0) + 1;
    }
    return Object.entries(counts).map(([label, value]) => ({ label, value }));
  }, [filtered]);

  // Revenue by event
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

  if (!ready || !user) return null;

  const STATUS_COLORS: Record<string, string> = {
    confirmed: '#00F5D4',
    pending: '#FFD600',
    failed: '#FF2D95',
    cancelled: '#6B6C80',
  };

  return (
    <AdminShell>
      <div className="mx-auto max-w-[980px] p-5">
        <PageHeader
          title="Analytics"
          subtitle="Platform performance metrics"
          right={
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportCsv}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold"
                style={{ background: 'rgba(0,245,212,0.1)', border: '1px solid rgba(0,245,212,0.25)', color: '#00F5D4' }}
              >
                <Download size={12} strokeWidth={2.5} /> Export CSV
              </button>
            </div>
          }
        />

        {/* Time range tabs */}
        <div className="mb-5 flex gap-1 rounded-xl p-1" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setRangeDays(r.days)}
              className="flex-1 rounded-lg px-3 py-2 text-[11px] font-bold transition-all"
              style={
                rangeDays === r.days
                  ? { background: 'rgba(255,45,149,0.15)', color: '#FF2D95' }
                  : { color: '#6B6C80' }
              }
            >
              {r.label}
            </button>
          ))}
        </div>

        {status === 'loading' ? (
          <LoadingBlock />
        ) : status === 'error' ? (
          <ErrorBlock message="Couldn't load analytics." onRetry={() => setAttempt((a) => a + 1)} />
        ) : (
          <div className="flex flex-col gap-6">
            {/* Metric cards */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Revenue" value={formatNaira(totalRevenue)} icon={DollarSign} color="#00F5D4" sub={`${rangeDays ? rangeDays + 'd' : 'all'} range`} />
              <StatCard label="Tickets Sold" value={String(totalTickets)} icon={Ticket} color="#FF2D95" />
              <StatCard label="Avg Order" value={formatNaira(avgOrderValue)} icon={TrendingUp} color="#B06AFF" />
              <StatCard label="Refund Rate" value={`${refundRate}%`} icon={AlertTriangle} color="#FF8A00" sub={`${refundOrders} orders`} />
            </div>

            {/* Revenue trend chart */}
            <ChartCard title="Revenue Trend">
              <RevenueLineChart data={revenueTrend} />
            </ChartCard>

            {/* Two-column: orders by status + events by category */}
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title="Orders by Status">
                <VerticalBarChart data={ordersByStatus} />
              </ChartCard>
              <ChartCard title="Events by Type">
                <PieChartDisplay data={eventsByCategory.length > 0 ? eventsByCategory : [{ label: 'No data', value: 1 }]} />
              </ChartCard>
            </div>

            {/* Revenue by event */}
            <div>
              <h2 className="mb-3 font-heading text-[15px] font-bold" style={{ color: '#FFFFFF' }}>Revenue by Event</h2>
              {revenueByEvent.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-2xl py-10 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="text-[13px] font-semibold" style={{ color: '#FFFFFF' }}>No revenue data</div>
                </div>
              ) : (
                <div className="flex flex-col gap-2 rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  {revenueByEvent.slice(0, 10).map((e) => (
                    <Link key={e.id} href={`/admin/analytics/events/${e.id}`} className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-white/5">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12px] font-medium" style={{ color: '#D5D6E0' }}>{e.title}</div>
                        <div className="text-[10px]" style={{ color: '#6B6C80' }}>{e.tickets} tickets</div>
                      </div>
                      <div className="shrink-0 text-right text-[12px] font-semibold tabular-nums" style={{ color: '#FFFFFF' }}>
                        {formatNaira(e.revenue)}
                      </div>
                      <ExternalLink size={12} color="#6B6C80" />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
