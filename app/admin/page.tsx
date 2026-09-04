'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, Users, Wallet, Ticket, Clock, ShoppingBag, ArrowRight } from 'lucide-react';
import AdminShell from '@/components/admin-shell';
import { StatCard, PageHeader, LoadingBlock, ErrorBlock, useRoleGuard } from '@/components/ui/dashboard-ui';
import { formatNaira } from '@/lib/filters';
import { fetchOverviewMetrics, type OverviewMetrics } from '@/lib/admin-queries';

export default function AdminDashboardPage() {
  const { user, ready } = useRoleGuard('admin');
  const [metrics, setMetrics] = useState<OverviewMetrics | null>(null);
  const [status, setStatus] = useState<'loading' | 'error' | 'ok'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!ready) return;
    setStatus('loading');
    fetchOverviewMetrics()
      .then((m) => {
        setMetrics(m);
        setStatus('ok');
      })
      .catch(() => setStatus('error'));
  }, [ready, attempt]);

  if (!ready || !user) return null;

  return (
    <AdminShell>
      <div className="mx-auto max-w-[980px] p-5">
        <PageHeader title={`Welcome, ${user.name.split(' ')[0]}`} subtitle="Platform overview" />

        {status === 'loading' ? (
          <LoadingBlock />
        ) : status === 'error' ? (
          <ErrorBlock message="Couldn't load metrics." onRetry={() => setAttempt((a) => a + 1)} />
        ) : metrics ? (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Active Events" value={String(metrics.totalEvents)} icon={CalendarDays} color="#FF2D95" sub={`${metrics.pendingEvents} pending review`} />
              <StatCard label="Hosts" value={String(metrics.totalHosts)} icon={Users} color="#B06AFF" />
              <StatCard label="Revenue" value={formatNaira(metrics.totalRevenue)} icon={Wallet} color="#00F5D4" sub="confirmed sales" />
              <StatCard label="Tickets Sold" value={String(metrics.totalTicketsSold)} icon={Ticket} color="#FFD600" />
              <StatCard label="Upcoming Events" value={String(metrics.upcomingEvents)} icon={Clock} color="#00BFFF" />
              <StatCard label="Recent Orders" value={String(metrics.recentOrders)} icon={ShoppingBag} color="#FFFFFF" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Link
                href="/admin/events"
                className="group flex items-center justify-between rounded-2xl p-5 transition-transform active:scale-[0.99]"
                style={{ ...{ background: 'rgba(255,255,255,0.03)' }, border: '1px solid rgba(255,214,0,0.2)' }}
              >
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[1px]" style={{ color: '#FFD600' }}>Moderation Queue</div>
                  <div className="mt-1 font-display text-[20px]" style={{ color: '#FFFFFF' }}>{metrics.pendingEvents} pending event{metrics.pendingEvents === 1 ? '' : 's'}</div>
                </div>
                <ArrowRight size={18} className="text-[#FFD600] transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                href="/admin/orders"
                className="group flex items-center justify-between rounded-2xl p-5 transition-transform active:scale-[0.99]"
                style={{ ...{ background: 'rgba(255,255,255,0.03)' }, border: '1px solid rgba(0,245,212,0.2)' }}
              >
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[1px]" style={{ color: '#00F5D4' }}>Orders</div>
                  <div className="mt-1 font-display text-[20px]" style={{ color: '#FFFFFF' }}>{metrics.recentOrders} total</div>
                </div>
                <ArrowRight size={18} className="text-[#00F5D4] transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </AdminShell>
  );
}
