'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, RefreshCw, Search, Download, CheckCircle, XCircle } from 'lucide-react';
import BackButton from '@/components/BackButton';
import HostBottomNav from '@/components/HostBottomNav';
import { useLagosLiveStore } from '@/lib/store';
import { fetchHostOrders, setOrderCheckIn, type AdminOrderJoined, toCsv, downloadCsv } from '@/lib/admin-queries';
import { useRealtimeOrders } from '@/lib/hooks/useRealtimeOrders';
import { formatNaira } from '@/lib/filters';

const PAYMENT_STYLE: Record<string, { label: string; bg: string; color: string }> = {
  confirmed: { label: 'Confirmed', bg: 'rgba(0,245,212,0.1)', color: '#00F5D4' },
  pending: { label: 'Pending', bg: 'rgba(255,214,0,0.12)', color: '#FFD600' },
  failed: { label: 'Failed', bg: 'rgba(255,138,0,0.1)', color: '#FF8A00' },
  cancelled: { label: 'Cancelled', bg: 'rgba(255,45,149,0.12)', color: '#FF2D95' },
};

export default function HostOrdersPage() {
  const router = useRouter();
  const user = useLagosLiveStore((s) => s.user);
  const authLoading = useLagosLiveStore((s) => s.authLoading);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'pending' | 'failed' | 'cancelled'>('all');

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login?next=%2Fhost%2Forders');
  }, [authLoading, user, router]);

  const { data, setData, loading, error, refresh } = useRealtimeOrders<AdminOrderJoined>(
    () => fetchHostOrders(user!.id),
    { enabled: !!user }
  );
  const orders = data ?? [];
  const mutateOrders = (fn: (prev: AdminOrderJoined[]) => AdminOrderJoined[]) =>
    setData((prev) => fn(prev ?? []));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders
      .filter((o) => filter === 'all' || o.payment_status === filter)
      .filter((o) => !q || o.order_ref.toLowerCase().includes(q) || (o.customer_email ?? '').toLowerCase().includes(q));
  }, [orders, search, filter]);

  const toggleCheckIn = async (order: AdminOrderJoined) => {
    if (order.payment_status !== 'confirmed') return;
    const nextCheckedIn = order.check_in_status !== 'checked_in';
    mutateOrders((prev) => prev.map((o) => o.id === order.id ? { ...o, check_in_status: nextCheckedIn ? 'checked_in' : 'unchecked', checked_in_at: nextCheckedIn ? new Date().toISOString() : null } : o));
    try {
      await setOrderCheckIn(order.id, nextCheckedIn);
    } catch {
      mutateOrders((prev) => prev.map((o) => o.id === order.id ? { ...o, check_in_status: nextCheckedIn ? 'unchecked' : 'checked_in', checked_in_at: nextCheckedIn ? null : order.checked_in_at } : o));
    }
  };

  const exportCsv = () => {
    const csv = toCsv(
      filtered.map((o) => ({
        'Order Ref': o.order_ref,
        'Guest': o.customer_email ?? 'Guest',
        'Event': o.parties?.title ?? '—',
        'Tickets': o.quantity,
        'Amount': o.total / 100,
        'Status': o.payment_status,
        'Checked In': o.check_in_status === 'checked_in' ? 'Yes' : 'No',
        'Date': new Date(o.created_at).toLocaleDateString(),
      })),
      ['Order Ref', 'Guest', 'Event', 'Tickets', 'Amount', 'Status', 'Checked In', 'Date']
    );
    downloadCsv(`my-orders-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  if (!user) return null;

  return (
    <div className="mx-auto max-w-[600px] animate-fade-in pb-24">
      <div className="sticky top-0 z-40 flex items-center justify-between border-b px-5 py-3.5 backdrop-blur-[22px] backdrop-saturate-150" style={{ background: 'var(--c-header)', borderColor: 'rgba(255,255,255,0.04)' }}>
        <div className="flex items-center gap-3">
          <BackButton href="/host" />
          <span className="font-heading text-[13px] font-bold uppercase tracking-[1px]" style={{ color: '#FFFFFF' }}>Orders</span>
        </div>
        <button
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className="flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-[12px] font-semibold disabled:opacity-50"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#A7A8B5' }}
        >
          <Download size={12} /> Export
        </button>
      </div>

      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-center gap-2 rounded-xl px-3.5 py-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <Search size={14} strokeWidth={2} color="#6B6C80" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by order ref or guest..."
            className="w-full bg-transparent text-[13px] outline-none"
            style={{ color: '#FFFFFF' }}
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(['all', 'confirmed', 'pending', 'failed', 'cancelled'] as const).map((f) => {
            const active = filter === f;
            const count = f === 'all' ? orders.length : orders.filter((o) => o.payment_status === f).length;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="rounded-full px-3 py-1.5 text-[11px] font-semibold capitalize transition-colors"
                style={
                  active
                    ? { background: 'rgba(255,45,149,0.16)', border: '1px solid rgba(255,45,149,0.4)', color: '#FF2D95' }
                    : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#A7A8B5' }
                }
              >
                {f} ({count})
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="flex flex-col gap-2.5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-[72px] animate-pulse rounded-2xl" style={{ background: 'rgba(255,255,255,0.04)' }} />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl px-6 py-12 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,138,0,0.2)' }}>
            <AlertTriangle size={26} strokeWidth={1.5} color="#FF8A00" />
            <div className="text-sm" style={{ color: '#A7A8B5' }}>Couldn&apos;t load orders.</div>
            <button onClick={() => refresh()} className="flex items-center gap-2 rounded-[10px] px-4 py-2 text-[13px] font-semibold" style={{ background: 'rgba(255,138,0,0.12)', border: '1px solid rgba(255,138,0,0.3)', color: '#FF8A00' }}>
              <RefreshCw size={13} strokeWidth={2.5} /> Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl px-6 py-14 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="font-display text-[20px]" style={{ color: '#FFFFFF' }}>No orders yet</div>
            <div className="text-sm" style={{ color: '#A7A8B5' }}>Orders will appear here once people buy tickets.</div>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {filtered.map((order) => {
              const st = PAYMENT_STYLE[order.payment_status] ?? PAYMENT_STYLE.pending;
              const isCheckedIn = order.check_in_status === 'checked_in';
              return (
                <div key={order.id} className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[12px] font-heading font-bold" style={{ color: '#FFFFFF' }}>{order.order_ref}</div>
                      <div className="text-[11px] mt-0.5" style={{ color: '#A7A8B5' }}>
                        {order.customer_email ?? 'Guest'} · {order.quantity} ticket{order.quantity === 1 ? '' : 's'}
                      </div>
                      <div className="text-[10.5px] mt-0.5" style={{ color: '#6B6C80' }}>
                        {order.parties?.title ?? '—'} · {new Date(order.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[13px] font-semibold" style={{ color: '#FFFFFF' }}>{formatNaira(order.total)}</div>
                      <span className="inline-flex rounded-full px-2 py-[2px] text-[9.5px] font-semibold" style={{ background: st.bg, color: st.color }}>
                        {st.label}
                      </span>
                    </div>
                  </div>
                  {order.payment_status === 'confirmed' && (
                    <div className="mt-3 border-t pt-3 flex items-center justify-between" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                      <span className="text-[11px]" style={{ color: '#A7A8B5' }}>
                        {isCheckedIn ? '✓ Guest checked in' : 'Not checked in'}
                      </span>
                      <button
                        onClick={() => toggleCheckIn(order)}
                        className="flex items-center gap-1.5 rounded-[9px] border px-2.5 py-1.5 text-[11px] font-semibold"
                        style={{
                          background: isCheckedIn ? 'rgba(0,245,212,0.08)' : 'rgba(255,255,255,0.03)',
                          borderColor: isCheckedIn ? 'rgba(0,245,212,0.3)' : 'rgba(255,255,255,0.1)',
                          color: isCheckedIn ? '#00F5D4' : '#A7A8B5',
                        }}
                      >
                        {isCheckedIn ? <XCircle size={11} /> : <CheckCircle size={11} />}
                        {isCheckedIn ? 'Undo Check-in' : 'Check In'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <HostBottomNav />
    </div>
  );
}
