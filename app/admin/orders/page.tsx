'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, Search, Download } from 'lucide-react';
import AdminShell from '@/components/admin-shell';
import { PageHeader, LoadingBlock, ErrorBlock, EmptyBlock, TableShell, Cell, Badge, usePermissionGuard } from '@/components/ui/dashboard-ui';
import { fetchAllOrders, type AdminOrderJoined, toCsv, downloadCsv } from '@/lib/admin-queries';
import { useRealtimeOrders } from '@/lib/hooks/useRealtimeOrders';
import { formatNaira } from '@/lib/filters';
import { useLagosLiveStore } from '@/lib/store';

type StatusFilter = 'all' | 'pending' | 'confirmed' | 'failed' | 'cancelled';

const PAYMENT_STYLE: Record<string, { label: string; bg: string; color: string }> = {
  pending: { label: 'Pending', bg: 'rgba(255,214,0,0.12)', color: '#FFD600' },
  confirmed: { label: 'Confirmed', bg: 'rgba(0,245,212,0.1)', color: '#00F5D4' },
  failed: { label: 'Failed', bg: 'rgba(255,138,0,0.1)', color: '#FF8A00' },
  cancelled: { label: 'Cancelled', bg: 'rgba(255,45,149,0.12)', color: '#FF2D95' },
};

export default function AdminOrdersPage() {
  const { ready } = usePermissionGuard('orders.view');
  const showToast = useLagosLiveStore((s) => s.showToast);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const PAGE_SIZE = 50;

  const { data, loading, error, lastLiveAt, refresh } = useRealtimeOrders<AdminOrderJoined>(fetchAllOrders, {
    enabled: ready,
  });
  const orders = data ?? [];

  useEffect(() => {
    setPage(1);
  }, [filter, search]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders
      .filter((o) => filter === 'all' || o.payment_status === filter)
      .filter((o) => !q || o.order_ref.toLowerCase().includes(q) || (o.customer_email ?? '').toLowerCase().includes(q) || (o.parties?.title ?? '').toLowerCase().includes(q));
  }, [orders, filter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const exportCsv = () => {
    const csv = toCsv(
      filtered.map((o) => ({
        'Order Ref': o.order_ref,
        'Guest': o.customer_email ?? 'Guest',
        'Event': o.parties?.title ?? '—',
        'Tickets': o.quantity,
        'Amount': o.total / 100,
        'Status': o.payment_status,
        'Date': new Date(o.created_at).toLocaleDateString(),
        'Payment Ref': o.payment_ref ?? '',
      })),
      ['Order Ref', 'Guest', 'Event', 'Tickets', 'Amount', 'Status', 'Date', 'Payment Ref']
    );
    downloadCsv(`orders-export-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    showToast('Export complete', `${filtered.length} orders exported.`);
  };

  if (!ready) return null;

  return (
    <AdminShell>
      <div className="mx-auto max-w-[980px] p-5">
        <PageHeader
          title="Orders"
          subtitle={`${filtered.length} order${filtered.length === 1 ? '' : 's'}`}
          right={
            <div className="flex gap-2">
              <button
                onClick={exportCsv}
                className="flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-[12.5px] font-semibold"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#A7A8B5' }}
              >
                <Download size={13} /> Export
              </button>
              <button
                onClick={() => refresh()}
                className="flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-[12.5px] font-semibold"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#A7A8B5' }}
              >
                <RefreshCw size={13} strokeWidth={2.5} /> Refresh
                {lastLiveAt && <span className="ml-1 flex items-center gap-1 text-[10px] font-semibold" style={{ color: '#00F5D4' }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: '#00F5D4' }} />Live</span>}
              </button>
            </div>
          }
        />

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-xl px-3.5 py-2.5 min-w-[200px]" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <Search size={14} strokeWidth={2} color="#6B6C80" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search by order ref, guest, or event..."
              className="w-full bg-transparent text-[13px] outline-none"
              style={{ color: '#FFFFFF' }}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(['all', 'pending', 'confirmed', 'failed', 'cancelled'] as StatusFilter[]).map((f) => {
              const active = filter === f;
              const count = f === 'all' ? orders.length : orders.filter((o) => o.payment_status === f).length;
              return (
                <button
                  key={f}
                  onClick={() => { setFilter(f); setPage(1); }}
                  className="rounded-full px-3.5 py-1.5 text-[12px] font-semibold capitalize transition-colors"
                  style={
                    active
                      ? { background: 'rgba(255,45,149,0.16)', border: '1px solid rgba(255,45,149,0.4)', color: '#FF2D95' }
                      : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#A7A8B5' }
                  }
                >
                  {f} <span style={{ opacity: 0.6 }}>({count})</span>
                </button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <LoadingBlock />
        ) : error ? (
          <ErrorBlock message="Couldn't load orders." onRetry={() => refresh()} />
        ) : filtered.length === 0 ? (
          <EmptyBlock title="No orders" subtitle="No orders match this filter." />
        ) : (
          <>
            {/* Mobile view */}
            <div className="flex flex-col gap-2.5 md:hidden">
              {paged.map((order) => {
                const st = PAYMENT_STYLE[order.payment_status] ?? PAYMENT_STYLE.pending;
                return (
                  <Link
                    key={order.id}
                    href={`/admin/orders/${order.id}`}
                    className="block rounded-2xl p-4 transition-all active:scale-[0.98]"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-heading font-bold text-[13px]" style={{ color: '#FFFFFF' }}>{order.order_ref}</div>
                        <div className="text-[11px] mt-0.5" style={{ color: '#A7A8B5' }}>{order.customer_email ?? 'Guest'} · {order.parties?.title ?? '—'}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-[13px]" style={{ color: '#FFFFFF' }}>{formatNaira(order.total)}</div>
                        <Badge label={st.label} bg={st.bg} color={st.color} />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden overflow-hidden rounded-2xl md:block" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                    {['Order', 'Guest', 'Event', 'Tickets', 'Amount', 'Status', 'Date', ''].map((h) => (
                      <th key={h} className="px-4 py-3 text-[10.5px] font-bold uppercase tracking-[1px]" style={{ color: '#6B6C80', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paged.map((order) => {
                    const st = PAYMENT_STYLE[order.payment_status] ?? PAYMENT_STYLE.pending;
                    return (
                      <tr key={order.id} className="transition-colors hover:bg-white/[0.02]">
                        <Cell>
                          <Link href={`/admin/orders/${order.id}`} className="font-heading font-bold hover:underline" style={{ color: '#FFFFFF' }}>
                            {order.order_ref}
                          </Link>
                        </Cell>
                        <Cell>{order.customer_email ?? 'Guest'}</Cell>
                        <Cell className="max-w-[140px] truncate">{order.parties?.title ?? '—'}</Cell>
                        <Cell>{order.quantity}</Cell>
                        <Cell><span className="font-semibold">{formatNaira(order.total)}</span></Cell>
                        <Cell><Badge label={st.label} bg={st.bg} color={st.color} /></Cell>
                        <Cell>{new Date(order.created_at).toLocaleDateString()}</Cell>
                        <Cell align="right">
                          <Link
                            href={`/admin/orders/${order.id}`}
                            className="inline-flex rounded-[9px] border px-2.5 py-1.5 text-[11.5px] font-semibold"
                            style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.1)', color: '#A7A8B5' }}
                          >
                            View
                          </Link>
                        </Cell>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded-lg px-3 py-1.5 text-[12px] font-semibold disabled:opacity-40"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#A7A8B5' }}
                >
                  Previous
                </button>
                <span className="text-[12px]" style={{ color: '#6B6C80' }}>Page {page} of {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="rounded-lg px-3 py-1.5 text-[12px] font-semibold disabled:opacity-40"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#A7A8B5' }}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </AdminShell>
  );
}
