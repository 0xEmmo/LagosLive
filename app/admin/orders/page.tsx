'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import AdminShell from '@/components/admin-shell';
import { PageHeader, LoadingBlock, ErrorBlock, EmptyBlock, TableShell, Cell, Badge, useRoleGuard } from '@/components/ui/dashboard-ui';
import { fetchAllOrders, type AdminOrderJoined } from '@/lib/admin-queries';
import { formatNaira } from '@/lib/filters';

type StatusFilter = 'all' | 'pending' | 'confirmed' | 'failed' | 'cancelled';

const PAYMENT_STYLE: Record<string, { label: string; bg: string; color: string }> = {
  pending: { label: 'Pending', bg: 'rgba(255,214,0,0.12)', color: '#FFD600' },
  confirmed: { label: 'Confirmed', bg: 'rgba(0,245,212,0.1)', color: '#00F5D4' },
  failed: { label: 'Failed', bg: 'rgba(255,138,0,0.1)', color: '#FF8A00' },
  cancelled: { label: 'Cancelled', bg: 'rgba(255,45,149,0.12)', color: '#FF2D95' },
};

export default function AdminOrdersPage() {
  const { ready } = useRoleGuard('finance');
  const [orders, setOrders] = useState<AdminOrderJoined[]>([]);
  const [status, setStatus] = useState<'loading' | 'error' | 'ok'>('loading');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [attempt, setAttempt] = useState(0);

  const load = async () => {
    setStatus('loading');
    try {
      const data = await fetchAllOrders();
      setOrders(data);
      setStatus('ok');
    } catch {
      setStatus('error');
    }
  };

  useEffect(() => {
    if (!ready) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, attempt]);

  const filtered = useMemo(
    () => (filter === 'all' ? orders : orders.filter((o) => o.payment_status === filter)),
    [orders, filter]
  );

  if (!ready) return null;

  return (
    <AdminShell>
      <div className="mx-auto max-w-[980px] p-5">
        <PageHeader
          title="Orders"
          subtitle="All ticket orders across the platform"
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

        <div className="mb-4 flex flex-wrap gap-2">
          {(['all', 'pending', 'confirmed', 'failed', 'cancelled'] as StatusFilter[]).map((f) => {
            const active = filter === f;
            const count = f === 'all' ? orders.length : orders.filter((o) => o.payment_status === f).length;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
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

        {status === 'loading' ? (
          <LoadingBlock />
        ) : status === 'error' ? (
          <ErrorBlock message="Couldn't load orders." onRetry={() => setAttempt((a) => a + 1)} />
        ) : filtered.length === 0 ? (
          <EmptyBlock title="No orders" subtitle="No orders match this filter." />
        ) : (
          <TableShell head={['Order', 'Guest', 'Event', 'Tickets', 'Amount', 'Status', 'Date', '']}>
            {filtered.map((order) => {
              const st = PAYMENT_STYLE[order.payment_status] ?? PAYMENT_STYLE.pending;
              return (
                <tr key={order.id} className="transition-colors hover:bg-white/[0.02]">
                  <Cell>
                    <Link href={`/admin/orders/${order.id}`} className="font-heading font-bold" style={{ color: '#FFFFFF' }}>
                      {order.order_ref}
                    </Link>
                  </Cell>
                  <Cell>{order.customer_email ?? 'Guest'}</Cell>
                  <Cell>{order.parties?.title ?? '—'}</Cell>
                  <Cell>{order.quantity}</Cell>
                  <Cell><span className="font-semibold">{formatNaira(order.total)}</span></Cell>
                  <Cell>
                    <Badge label={st.label} bg={st.bg} color={st.color} />
                  </Cell>
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
          </TableShell>
        )}
      </div>
    </AdminShell>
  );
}
