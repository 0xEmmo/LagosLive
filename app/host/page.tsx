'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, CalendarPlus, ShieldCheck, CalendarDays, Clock, Ticket, Wallet, Settings, ListOrdered, Activity, AlertTriangle, RefreshCw, type LucideIcon } from 'lucide-react';
import BackButton from '@/components/BackButton';
import PartyPhoto from '@/components/PartyPhoto';
import HostBottomNav from '@/components/HostBottomNav';
import { RevenueLineChart, PieChartDisplay, ChartCard } from '@/components/ui/charts';
import { fetchPartiesByOwner, fetchOrganizerOrderStats, type OrganizerPartyStats } from '@/lib/queries';
import { fetchHostOrders, type AdminOrderJoined } from '@/lib/admin-queries';
import { formatNaira } from '@/lib/filters';
import { partyPhoto } from '@/lib/data';
import { useLagosLiveStore } from '@/lib/store';
import type { Party, PartyStatus } from '@/lib/types';

const STATUS_STYLE: Record<PartyStatus, { label: string; bg: string; color: string }> = {
  pending: { label: 'Pending Review', bg: 'rgba(255,214,0,0.1)', color: '#FFD600' },
  approved: { label: 'Live', bg: 'rgba(0,245,212,0.08)', color: '#00F5D4' },
  rejected: { label: 'Rejected', bg: 'rgba(255,138,0,0.08)', color: '#FF8A00' },
  suspended: { label: 'Suspended', bg: 'rgba(255,138,0,0.08)', color: '#FF8A00' },
};

function StatCard({ label, value, sub, icon: Icon, color }: { label: string; value: string; sub?: string; icon: LucideIcon; color: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[1px]" style={{ color: '#6B6C80' }}>{label}</span>
        <Icon size={15} strokeWidth={2} color={color} />
      </div>
      <div className="font-display truncate text-[22px] leading-tight" style={{ color: '#FFFFFF' }}>{value}</div>
      {sub && <div className="mt-1 text-[11px]" style={{ color: '#A7A8B5' }}>{sub}</div>}
    </div>
  );
}

function StatSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-[92px] animate-pulse rounded-2xl" style={{ background: 'rgba(255,255,255,0.04)' }} />
      ))}
    </div>
  );
}

function EventCardSkeleton() {
  return (
    <div className="flex flex-col gap-2.5">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-[92px] animate-pulse rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }} />
      ))}
    </div>
  );
}

export default function HostDashboardPage() {
  const router = useRouter();
  const user = useLagosLiveStore((s) => s.user);
  const authLoading = useLagosLiveStore((s) => s.authLoading);
  const [parties, setParties] = useState<Party[]>([]);
  const [stats, setStats] = useState<Record<number, OrganizerPartyStats>>({});
  const [recentOrders, setRecentOrders] = useState<AdminOrderJoined[]>([]);
  const [revenueTrend, setRevenueTrend] = useState<{ label: string; value: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login?next=%2Fhost');
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const data = await fetchPartiesByOwner(user.id);
        if (cancelled) return;
        setParties(data);
        const s = await fetchOrganizerOrderStats(data.map((p) => p.id));
        if (!cancelled) setStats(s);
        const orders = await fetchHostOrders(user.id);
        if (!cancelled) setRecentOrders(orders.slice(0, 10));
        // Build revenue trend from their orders
        const confirmedOrders = orders.filter((o) => o.payment_status === 'confirmed');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const buckets = new Map<string, { key: string; label: string; value: number }>();
        for (let i = 29; i >= 0; i--) {
          const d = new Date(today.getTime() - i * 86400000);
          buckets.set(d.toDateString(), {
            key: d.toDateString(),
            label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            value: 0,
          });
        }
        for (const o of confirmedOrders) {
          const b = buckets.get(new Date(o.created_at).toDateString());
          if (b) b.value += o.total;
        }
        if (!cancelled) setRevenueTrend([...buckets.values()]);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load your dashboard.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, attempt]);

  if (!user) return null;

  const totalTicketsSold = Object.values(stats).reduce((sum, s) => sum + s.ticketsSold, 0);
  const totalRevenue = Object.values(stats).reduce((sum, s) => sum + s.revenue, 0);
  const upcomingCount = parties.filter((p) => !p.cancelledAt && new Date(p.startsAt).getTime() > Date.now()).length;
  const activeCount = parties.filter((p) => p.status === 'approved' && !p.cancelledAt).length;

  // Build sales by event data for pie chart
  const salesByEvent = parties
    .map((p) => ({ label: p.title, value: stats[p.id]?.ticketsSold ?? 0 }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const PAYMENT_STYLE: Record<string, { label: string; bg: string; color: string }> = {
    confirmed: { label: 'Confirmed', bg: 'rgba(0,245,212,0.1)', color: '#00F5D4' },
    pending: { label: 'Pending', bg: 'rgba(255,214,0,0.12)', color: '#FFD600' },
    failed: { label: 'Failed', bg: 'rgba(255,138,0,0.1)', color: '#FF8A00' },
    cancelled: { label: 'Cancelled', bg: 'rgba(255,45,149,0.12)', color: '#FF2D95' },
  };

  return (
    <div className="mx-auto max-w-[600px] animate-fade-in pb-24">
      <div
        className="sticky top-0 z-40 flex items-center justify-between border-b px-5 py-3.5 backdrop-blur-[22px] backdrop-saturate-150"
        style={{ background: 'var(--c-header)', borderColor: 'rgba(255,255,255,0.04)' }}
      >
        <div className="flex items-center gap-3">
          <BackButton href="/profile" />
          <span className="font-heading text-[13px] font-bold uppercase tracking-[1px]" style={{ color: '#FFFFFF' }}>
            Dashboard
          </span>
        </div>
        <div className="flex items-center gap-2">
          {user.isAdmin && (
            <Link
              href="/admin"
              className="flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-[13px] font-semibold glass glass-hover"
              style={{ color: '#A7A8B5' }}
            >
              <ShieldCheck size={14} strokeWidth={2} />
              Admin
            </Link>
          )}
          <Link
            href="/host/orders"
            className="flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-[13px] font-semibold glass glass-hover"
            style={{ color: '#A7A8B5' }}
          >
            <ListOrdered size={14} strokeWidth={2} />
            Orders
          </Link>
          <Link
            href="/host/payouts"
            className="flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-[13px] font-semibold glass glass-hover"
            style={{ color: '#A7A8B5' }}
          >
            <Wallet size={14} strokeWidth={2} />
            Payouts
          </Link>
          <Link
            href="/host/analytics"
            className="flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-[13px] font-semibold glass glass-hover"
            style={{ color: '#A7A8B5' }}
          >
            <Activity size={14} strokeWidth={2} />
            Analytics
          </Link>
          <Link
            href="/host/new"
            className="btn-primary flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-semibold"
          >
            <Plus size={14} strokeWidth={2.5} />
            New
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-5">
        {loading ? (
          <>
            <StatSkeleton />
            <EventCardSkeleton />
          </>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl px-6 py-12 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,138,0,0.2)' }}>
            <AlertTriangle size={26} strokeWidth={1.5} color="#FF8A00" />
            <div className="text-sm" style={{ color: '#A7A8B5' }}>
              Couldn&apos;t load your dashboard. Check your connection and try again.
            </div>
            <button
              onClick={() => setAttempt((a) => a + 1)}
              className="flex items-center gap-2 rounded-[10px] px-4 py-2 text-[13px] font-semibold"
              style={{ background: 'rgba(255,138,0,0.12)', border: '1px solid rgba(255,138,0,0.3)', color: '#FF8A00' }}
            >
              <RefreshCw size={13} strokeWidth={2.5} />
              Retry
            </button>
          </div>
        ) : parties.length === 0 ? (
          <div className="flex flex-col items-center gap-4 px-6 py-[64px] text-center">
            <div
              className="flex h-[72px] w-[72px] items-center justify-center rounded-full"
              style={{ background: 'rgba(255,45,149,0.08)', border: '1px solid rgba(255,45,149,0.15)' }}
            >
              <CalendarPlus size={32} strokeWidth={1.5} color="#FF2D95" />
            </div>
            <div className="font-display text-[28px] tracking-[0.5px]" style={{ color: '#FFFFFF' }}>
              Your next big night starts here.
            </div>
            <div className="max-w-[280px] text-sm" style={{ color: '#A7A8B5' }}>
              List your own party or event to get it in front of the Lagos Live crowd. New listings need a quick admin review before they go live.
            </div>
            <Link href="/host/new" className="btn-primary mt-1 px-8 py-3.5 text-sm font-semibold">
              Create Event
            </Link>
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 gap-2.5">
              <StatCard label="Total Events" value={String(parties.length)} icon={CalendarDays} color="#FF2D95" />
              <StatCard label="Active Events" value={String(activeCount)} icon={Clock} color="#00F5D4" />
              <StatCard label="Tickets Sold" value={String(totalTicketsSold)} icon={Ticket} color="#00BFFF" sub="confirmed sales" />
              <StatCard label="Revenue" value={formatNaira(totalRevenue)} icon={Wallet} color="#B06AFF" sub="confirmed only" />
              <StatCard label="Upcoming" value={String(upcomingCount)} icon={CalendarDays} color="#FFD600" sub={upcomingCount > 0 ? 'still ahead' : 'none scheduled'} />
            </div>

            {/* Charts */}
            {revenueTrend.some((d) => d.value > 0) && (
              <ChartCard title="30-Day Revenue">
                <RevenueLineChart data={revenueTrend} />
              </ChartCard>
            )}

            {salesByEvent.length > 0 && (
              <ChartCard title="Sales by Event">
                <PieChartDisplay data={salesByEvent} />
              </ChartCard>
            )}

            {/* Recent Orders */}
            {recentOrders.length > 0 && (
              <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-[1px]" style={{ color: '#A7A8B5' }}>Recent Orders</span>
                  <Link href="/host/orders" className="text-[11px] font-semibold" style={{ color: '#FF2D95' }}>View all →</Link>
                </div>
                <div className="flex flex-col gap-2">
                  {recentOrders.map((o) => {
                    const st = PAYMENT_STYLE[o.payment_status] ?? PAYMENT_STYLE.pending;
                    return (
                      <div key={o.id} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.02)' }}>
                        <div className="min-w-0">
                          <div className="text-[12px] font-semibold truncate" style={{ color: '#FFFFFF' }}>{o.customer_email ?? 'Guest'}</div>
                          <div className="text-[10.5px]" style={{ color: '#6B6C80' }}>{o.parties?.title ?? '—'} · {o.quantity} ticket{o.quantity === 1 ? '' : 's'}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-semibold" style={{ color: '#FFFFFF' }}>{formatNaira(o.total)}</span>
                          <span className="shrink-0 rounded-full px-2 py-[2px] text-[9.5px] font-semibold" style={{ background: st.bg, color: st.color }}>
                            {st.label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Event List */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-bold" style={{ color: '#FFFFFF' }}>Your Events</span>
                <Link href="/host/new" className="text-[11px] font-semibold" style={{ color: '#FF2D95' }}>+ Create New</Link>
              </div>
              {parties.map((p) => {
                const s = stats[p.id];
                const statusStyle = STATUS_STYLE[p.status];
                const sold = s?.ticketsSold ?? 0;
                const remaining = Math.max(0, p.capacity - sold);
                const cancelled = !!p.cancelledAt;
                return (
                  <Link
                    key={p.id}
                    href={`/host/${p.id}`}
                    className="flex items-center gap-3 rounded-xl p-2.5 transition-all duration-200 active:scale-[0.98]"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', opacity: cancelled ? 0.5 : 1 }}
                  >
                    <div className="relative h-[68px] w-[68px] flex-shrink-0 overflow-hidden rounded-[12px]" style={{ background: p.gradient }}>
                      <PartyPhoto src={partyPhoto(p.id, p.coverUrl)} alt={p.title} gradient={p.gradient} sizes="68px" />
                      {cancelled && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                          <span className="text-[9px] font-bold uppercase tracking-[0.5px]" style={{ color: '#FFFFFF' }}>Cancelled</span>
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate font-heading text-[13px] font-bold" style={{ color: cancelled ? '#A7A8B5' : '#FFFFFF', textDecoration: cancelled ? 'line-through' : 'none' }}>{p.title}</div>
                          <div className="mt-0.5 text-[11px]" style={{ color: '#A7A8B5' }}>{p.date} · {p.time}</div>
                        </div>
                        {cancelled ? (
                          <span
                            className="flex-shrink-0 rounded-full px-2 py-[3px] text-[10px] font-semibold uppercase tracking-[0.5px]"
                            style={{ background: 'rgba(255,45,149,0.14)', color: '#FF2D95', border: '1px solid rgba(255,45,149,0.3)' }}
                          >
                            Cancelled
                          </span>
                        ) : (
                          <span
                            className="flex-shrink-0 rounded-full px-2 py-[3px] text-[10px] font-semibold"
                            style={{ background: statusStyle.bg, color: statusStyle.color }}
                          >
                            {statusStyle.label}
                          </span>
                        )}
                      </div>
                      {!cancelled && (
                        <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]" style={{ color: '#A7A8B5' }}>
                          <span>
                            <span className="font-bold" style={{ color: '#00F5D4' }}>{sold}</span> sold · <span className="font-semibold" style={{ color: '#FFFFFF' }}>{remaining}</span> left
                          </span>
                          <span className="font-semibold gradient-text">{formatNaira(s?.revenue ?? 0)}</span>
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>
      <HostBottomNav />
    </div>
  );
}
