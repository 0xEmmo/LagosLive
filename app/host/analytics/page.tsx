'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DollarSign, Ticket, TrendingUp, CalendarDays, AlertTriangle } from 'lucide-react';
import BackButton from '@/components/BackButton';
import { useLagosLiveStore } from '@/lib/store';
import { fetchHostOrders, fetchHostAnalytics, type AdminOrderJoined } from '@/lib/admin-queries';
import { RevenueLineChart, PieChartDisplay, ChartCard } from '@/components/ui/charts';
import { formatNaira } from '@/lib/filters';

export default function HostAnalyticsPage() {
  const router = useRouter();
  const user = useLagosLiveStore((s) => s.user);
  const authLoading = useLagosLiveStore((s) => s.authLoading);
  const [orders, setOrders] = useState<AdminOrderJoined[]>([]);
  const [summary, setSummary] = useState<{ totalRevenue: number; totalTicketsSold: number; avgOrderValue: number; eventsCount: number } | null>(null);
  const [status, setStatus] = useState<'loading' | 'error' | 'ok'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login?next=%2Fhost%2Fanalytics');
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    setStatus('loading');
    Promise.all([fetchHostOrders(user.id), fetchHostAnalytics(user.id)])
      .then(([o, s]) => {
        setOrders(o);
        setSummary(s);
        setStatus('ok');
      })
      .catch(() => setStatus('error'));
  }, [user, attempt]);

  const confirmed = useMemo(() => orders.filter((o) => o.payment_status === 'confirmed'), [orders]);

  // Revenue trend (last 30 days)
  const revenueTrend = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const buckets = new Map<string, { label: string; value: number }>();
    for (let i = 29; i >= 0; i--) {
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
  }, [confirmed]);

  // Sales by event
  const salesByEvent = useMemo(() => {
    const map = new Map<number, { label: string; value: number }>();
    for (const o of confirmed) {
      const title = o.parties?.title ?? 'Unknown';
      const existing = map.get(o.party_id);
      if (existing) {
        existing.value += o.quantity;
      } else {
        map.set(o.party_id, { label: title, value: o.quantity });
      }
    }
    return [...map.values()].sort((a, b) => b.value - a.value);
  }, [confirmed]);

  // Orders by status
  const ordersByStatus = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const o of orders) {
      counts[o.payment_status] = (counts[o.payment_status] || 0) + 1;
    }
    return Object.entries(counts).map(([label, value]) => ({ label, value }));
  }, [orders]);

  const statusColors: Record<string, string> = {
    confirmed: '#00F5D4',
    pending: '#FFD600',
    failed: '#FF2D95',
    cancelled: '#6B6C80',
  };

  if (!user) return null;

  return (
    <div className="mx-auto max-w-[600px] animate-fade-in">
      <div className="sticky top-0 z-40 flex items-center gap-3 border-b px-5 py-3.5 backdrop-blur-[22px] backdrop-saturate-150" style={{ background: 'var(--c-header)', borderColor: 'rgba(255,255,255,0.04)' }}>
        <BackButton href="/host" />
        <span className="font-heading text-[13px] font-bold uppercase tracking-[1px]" style={{ color: '#FFFFFF' }}>Analytics</span>
      </div>

      <div className="flex flex-col gap-5 p-5">
        {status === 'loading' ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-[100px] animate-pulse rounded-2xl" style={{ background: 'rgba(255,255,255,0.04)' }} />
            ))}
          </div>
        ) : status === 'error' ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl px-6 py-12 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,138,0,0.2)' }}>
            <AlertTriangle size={26} strokeWidth={1.5} color="#FF8A00" />
            <div className="text-sm" style={{ color: '#A7A8B5' }}>Couldn&apos;t load analytics. Try again.</div>
            <button onClick={() => setAttempt((a) => a + 1)} className="flex items-center gap-2 rounded-[10px] px-4 py-2 text-[13px] font-semibold" style={{ background: 'rgba(255,138,0,0.12)', border: '1px solid rgba(255,138,0,0.3)', color: '#FF8A00' }}>
              Retry
            </button>
          </div>
        ) : (
          <>
            {/* Metric cards */}
            <div className="grid grid-cols-2 gap-2.5">
              <MetricCard label="Total Revenue" value={formatNaira(summary?.totalRevenue ?? 0)} icon={<DollarSign size={14} color="#00F5D4" />} color="#00F5D4" />
              <MetricCard label="Tickets Sold" value={String(summary?.totalTicketsSold ?? 0)} icon={<Ticket size={14} color="#FF2D95" />} color="#FF2D95" />
              <MetricCard label="Avg Order" value={formatNaira(summary?.avgOrderValue ?? 0)} icon={<TrendingUp size={14} color="#B06AFF" />} color="#B06AFF" />
              <MetricCard label="My Events" value={String(summary?.eventsCount ?? 0)} icon={<CalendarDays size={14} color="#FFD600" />} color="#FFD600" />
            </div>

            {/* Revenue trend */}
            <ChartCard title="Revenue Trend (30d)">
              <RevenueLineChart data={revenueTrend} />
            </ChartCard>

            {/* Sales by event */}
            {salesByEvent.length > 0 && (
              <ChartCard title="Tickets by Event">
                <PieChartDisplay data={salesByEvent.slice(0, 6)} />
              </ChartCard>
            )}

            {/* Orders by status */}
            {ordersByStatus.length > 0 && (
              <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="mb-3 text-[11px] font-bold uppercase tracking-[1px]" style={{ color: '#A7A8B5' }}>Orders by Status</div>
                <div className="flex flex-wrap gap-2">
                  {ordersByStatus.map((s) => (
                    <div key={s.label} className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <div className="h-2.5 w-2.5 rounded-full" style={{ background: statusColors[s.label] ?? '#6B6C80' }} />
                      <span className="text-[11px] font-semibold" style={{ color: '#D5D6E0' }}>{s.label}</span>
                      <span className="text-[12px] font-bold tabular-nums" style={{ color: '#FFFFFF' }}>{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent orders */}
            {confirmed.length > 0 && (
              <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="mb-3 text-[11px] font-bold uppercase tracking-[1px]" style={{ color: '#A7A8B5' }}>Recent Confirmed Orders</div>
                <div className="flex flex-col gap-2">
                  {confirmed.slice(0, 5).map((o) => (
                    <div key={o.id} className="flex items-center justify-between border-b pb-2 text-[12px]" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                      <div>
                        <div className="font-medium" style={{ color: '#D5D6E0' }}>{o.parties?.title ?? 'Event'}</div>
                        <div style={{ color: '#6B6C80' }}>{o.quantity}x {o.tier}</div>
                      </div>
                      <div className="font-semibold tabular-nums" style={{ color: '#00F5D4' }}>{formatNaira(o.total)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.9px]" style={{ color: '#6B6C80' }}>{label}</span>
        {icon}
      </div>
      <div className="font-display truncate text-[19px] leading-tight" style={{ color }}>{value}</div>
    </div>
  );
}
