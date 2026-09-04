'use client';

import { useEffect, useState } from 'react';
import { BarChart3, DollarSign, Ticket, TrendingUp, AlertTriangle } from 'lucide-react';
import AdminShell from '@/components/admin-shell';
import { StatCard, PageHeader, Badge, LoadingBlock, ErrorBlock, useRoleGuard } from '@/components/ui/dashboard-ui';
import { fetchAllOrders, type AdminOrderJoined } from '@/lib/admin-queries';
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

export default function AnalyticsPage() {
  const { user, ready } = useRoleGuard('admin');
  const [orders, setOrders] = useState<AdminOrderJoined[]>([]);
  const [parties, setParties] = useState<PartyRow[]>([]);
  const [status, setStatus] = useState<'loading' | 'error' | 'ok'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [sortAsc, setSortAsc] = useState(false);

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

  if (!ready || !user) return null;

  const confirmed = orders.filter((o) => o.payment_status === 'confirmed');
  const totalRevenue = confirmed.reduce((s, o) => s + o.total, 0);
  const totalTickets = confirmed.reduce((s, o) => s + o.quantity, 0);
  const avgOrderValue = confirmed.length > 0 ? totalRevenue / confirmed.length : 0;
  const refundOrders = orders.filter((o) => o.refund_status !== 'none').length;
  const refundRate = orders.length > 0 ? ((refundOrders / orders.length) * 100).toFixed(1) : '0.0';

  const statusCounts: Record<string, number> = {};
  for (const o of orders) {
    statusCounts[o.payment_status] = (statusCounts[o.payment_status] || 0) + 1;
  }

  const revenueByEvent: { id: number; title: string; revenue: number }[] = parties.map((p) => ({
    id: p.id,
    title: p.title,
    revenue: confirmed.filter((o) => o.party_id === p.id).reduce((s, o) => s + o.total, 0),
  }));
  revenueByEvent.sort((a, b) => (sortAsc ? a.revenue - b.revenue : b.revenue - a.revenue));
  const maxRevenue = Math.max(1, ...revenueByEvent.map((e) => e.revenue));

  const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
    confirmed: { bg: 'rgba(0,245,212,0.1)', color: '#00F5D4' },
    pending: { bg: 'rgba(255,214,0,0.1)', color: '#FFD600' },
    failed: { bg: 'rgba(255,45,149,0.12)', color: '#FF2D95' },
    cancelled: { bg: 'rgba(107,108,128,0.15)', color: '#6B6C80' },
  };

  return (
    <AdminShell>
      <div className="mx-auto max-w-[980px] p-5">
        <PageHeader
          title="Analytics"
          subtitle="Platform performance metrics"
          right={
            <button
              onClick={() => setSortAsc((v) => !v)}
              className="rounded-lg px-3 py-1.5 text-[11px] font-bold"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#A7A8B5' }}
            >
              Sort: {sortAsc ? 'Low → High' : 'High → Low'}
            </button>
          }
        />

        {status === 'loading' ? (
          <LoadingBlock />
        ) : status === 'error' ? (
          <ErrorBlock message="Couldn't load analytics." onRetry={() => setAttempt((a) => a + 1)} />
        ) : (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Total Revenue" value={formatNaira(totalRevenue)} icon={DollarSign} color="#00F5D4" />
              <StatCard label="Tickets Sold" value={String(totalTickets)} icon={Ticket} color="#FF2D95" />
              <StatCard label="Avg Order Value" value={formatNaira(avgOrderValue)} icon={TrendingUp} color="#B06AFF" />
              <StatCard label="Refund Rate" value={`${refundRate}%`} icon={AlertTriangle} color="#FF8A00" sub={`${refundOrders} orders`} />
            </div>

            <div>
              <h2 className="mb-3 font-heading text-[15px] font-bold" style={{ color: '#FFFFFF' }}>Revenue by Event</h2>
              {revenueByEvent.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-2xl py-10 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="text-[13px] font-semibold" style={{ color: '#FFFFFF' }}>No events yet</div>
                </div>
              ) : (
                <div className="flex flex-col gap-2 rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  {revenueByEvent.map((e) => (
                    <div key={e.id} className="flex items-center gap-3">
                      <div className="w-[180px] shrink-0 truncate text-[12px] font-medium" style={{ color: '#D5D6E0' }}>
                        {e.title}
                      </div>
                      <div className="relative min-w-0 flex-1">
                        <div className="h-5 rounded-md" style={{ background: 'rgba(255,255,255,0.04)' }}>
                          <div
                            className="h-full rounded-md transition-all duration-500"
                            style={{
                              width: `${Math.max(e.revenue > 0 ? 4 : 0, (e.revenue / maxRevenue) * 100)}%`,
                              background: e.revenue > 0 ? 'linear-gradient(90deg, #FF2D95, #B06AFF)' : 'transparent',
                            }}
                          />
                        </div>
                      </div>
                      <div className="w-[100px] shrink-0 text-right text-[12px] font-semibold tabular-nums" style={{ color: e.revenue > 0 ? '#FFFFFF' : '#6B6C80' }}>
                        {formatNaira(e.revenue)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h2 className="mb-3 font-heading text-[15px] font-bold" style={{ color: '#FFFFFF' }}>Orders by Payment Status</h2>
              <div className="flex flex-wrap gap-3">
                {Object.entries(statusCounts).map(([s, count]) => (
                  <div key={s} className="flex items-center gap-2 rounded-xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <Badge label={s} bg={STATUS_COLORS[s]?.bg ?? 'rgba(107,108,128,0.15)'} color={STATUS_COLORS[s]?.color ?? '#6B6C80'} />
                    <span className="text-[14px] font-bold tabular-nums" style={{ color: '#FFFFFF' }}>{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
