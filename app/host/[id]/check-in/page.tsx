'use client';

import { useEffect, useState } from 'react';
import { useRouter, notFound } from 'next/navigation';
import { Loader2, AlertTriangle, RefreshCw, Search, CheckCircle2, Clock, Users } from 'lucide-react';
import BackButton from '@/components/BackButton';
import { useParty } from '@/lib/hooks/useParty';
import { useLagosLiveStore } from '@/lib/store';
import { fetchEventOrders, setOrderCheckIn, type AdminOrderJoined } from '@/lib/admin-queries';
import { formatNaira } from '@/lib/filters';
import { Ticket, CalendarX } from 'lucide-react';

const PAYMENT_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  confirmed: { label: 'Paid', bg: 'rgba(0,245,212,0.08)', color: '#00F5D4' },
  pending: { label: 'Pending', bg: 'rgba(255,214,0,0.1)', color: '#FFD600' },
  failed: { label: 'Failed', bg: 'rgba(255,138,0,0.08)', color: '#FF8A00' },
  cancelled: { label: 'Cancelled', bg: 'rgba(255,45,149,0.1)', color: '#FF2D95' },
};

export default function HostCheckInPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const user = useLagosLiveStore((s) => s.user);
  const authLoading = useLagosLiveStore((s) => s.authLoading);
  const showToast = useLagosLiveStore((s) => s.showToast);
  const { party, loading } = useParty(Number(params.id));
  const [orders, setOrders] = useState<AdminOrderJoined[]>([]);
  const [status, setStatus] = useState<'loading' | 'error' | 'ok'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login?next=' + encodeURIComponent(`/host/${params.id}/check-in`));
  }, [authLoading, user, router, params.id]);

  useEffect(() => {
    if (!user || !party) return;
    if (party.createdBy !== user.id) {
      router.replace('/host');
      return;
    }
    setStatus('loading');
    fetchEventOrders(party.id)
      .then((o) => setOrders(o))
      .then(() => setStatus('ok'))
      .catch(() => setStatus('error'));
  }, [party, user, router, attempt]);

  const toggle = async (order: AdminOrderJoined) => {
    if (order.payment_status !== 'confirmed') {
      showToast('Not confirmed', 'Only confirmed orders can be checked in.');
      return;
    }
    const next = order.check_in_status === 'checked_in' ? false : true;
    const prev = orders;
    setOrders((os) => os.map((o) => (o.id === order.id ? { ...o, check_in_status: next ? 'checked_in' : 'unchecked', checked_in_at: next ? new Date().toISOString() : null } : o)));
    try {
      await setOrderCheckIn(order.id, next);
      showToast(next ? 'Checked in' : 'Check-in removed', `Order ${order.order_ref}`);
    } catch {
      setOrders(prev);
      showToast('Something went wrong', "Couldn't update check-in.");
    }
  };

  if (!user) {
    if (authLoading) return <CenteredLoader />;
    return null;
  }
  if (authLoading || loading) {
    if (loading && !party) return <CenteredLoader />;
  }
  if (!party) {
    if (loading) return <CenteredLoader />;
    notFound();
  }
  if (party.createdBy !== user.id) return null;

  const confirmed = orders.filter((o) => o.payment_status === 'confirmed');
  const checkedIn = confirmed.filter((o) => o.check_in_status === 'checked_in').length;
  const q = query.trim().toLowerCase();
  const filtered = confirmed.filter(
    (o) =>
      !q ||
      (o.order_ref?.toLowerCase().includes(q) ?? false) ||
      (o.customer_email?.toLowerCase().includes(q) ?? false)
  );

  return (
    <div className="mx-auto max-w-[600px] animate-fade-in">
      <div className="sticky top-0 z-40 flex items-center gap-3 border-b px-5 py-3.5 backdrop-blur-[22px] backdrop-saturate-150" style={{ background: 'var(--c-header)', borderColor: 'rgba(255,255,255,0.04)' }}>
        <BackButton href={`/host/${party.id}`} />
        <span className="font-heading text-[13px] font-bold uppercase tracking-[1px]" style={{ color: '#FFFFFF' }}>Check-in</span>
      </div>

      <div className="flex flex-col gap-4 p-5">
        <div>
          <div className="font-heading text-[17px] font-bold" style={{ color: '#FFFFFF' }}>{party.title}</div>
          <div className="mt-0.5 text-[12px]" style={{ color: '#A7A8B5' }}>{party.date} · {party.time} · {party.location}</div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <MiniStat label="Confirmed" value={String(confirmed.length)} color="#00F5D4" icon={<Ticket size={14} color="#00F5D4" />} />
          <MiniStat label="Checked In" value={`${checkedIn} / ${confirmed.length}`} color="#B06AFF" icon={<CheckCircle2 size={14} color="#B06AFF" />} />
        </div>

        <div className="relative">
          <Search size={15} strokeWidth={2} color="#6B6C80" className="absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search order ref or guest email…"
            className="w-full rounded-[12px] py-2.5 pl-10 pr-3 text-[13px] outline-none"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFFFFF' }}
          />
        </div>

        {status === 'loading' ? (
          <div className="flex flex-col gap-2.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[74px] animate-pulse rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }} />
            ))}
          </div>
        ) : status === 'error' ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl px-6 py-12 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,138,0,0.2)' }}>
            <AlertTriangle size={26} strokeWidth={1.5} color="#FF8A00" />
            <div className="text-sm" style={{ color: '#A7A8B5' }}>Couldn&apos;t load check-in list. Try again.</div>
            <button onClick={() => setAttempt((a) => a + 1)} className="flex items-center gap-2 rounded-[10px] px-4 py-2 text-[13px] font-semibold" style={{ background: 'rgba(255,138,0,0.12)', border: '1px solid rgba(255,138,0,0.3)', color: '#FF8A00' }}>
              <RefreshCw size={13} strokeWidth={2.5} /> Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl px-6 py-14 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <CalendarX size={26} strokeWidth={1.5} color="#6B6C80" />
            <div className="text-sm" style={{ color: '#A7A8B5' }}>{confirmed.length === 0 ? 'No confirmed orders yet.' : 'No orders match your search.'}</div>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {filtered.map((o) => {
              const guest = (o.customer_email && o.customer_email !== 'Guest' ? o.customer_email.split('@')[0] : 'Guest') ?? 'Guest';
              const isIn = o.check_in_status === 'checked_in';
              return (
                <div key={o.id} className="flex items-center gap-3 rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: isIn ? '1px solid rgba(0,245,212,0.35)' : '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]" style={{ background: isIn ? 'rgba(0,245,212,0.12)' : 'rgba(255,45,149,0.1)' }}>
                    {isIn ? <CheckCircle2 size={18} color="#00F5D4" /> : <Users size={18} color="#FF2D95" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-bold" style={{ color: '#FFFFFF' }}>{guest}</span>
                      <span className="shrink-0 text-[10.5px]" style={{ color: '#6B6C80' }}>#{o.order_ref}</span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-[11px]" style={{ color: '#A7A8B5' }}>
                      <span>{o.quantity} ticket{o.quantity > 1 ? 's' : ''}</span>
                      <span>· {formatNaira(o.total)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => toggle(o)}
                    className="flex shrink-0 items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-[12px] font-semibold transition-transform active:scale-[0.98]"
                    style={
                      isIn
                        ? { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#A7A8B5' }
                        : { background: 'rgba(0,245,212,0.12)', border: '1px solid rgba(0,245,212,0.3)', color: '#00F5D4' }
                    }
                  >
                    {isIn ? <Clock size={13} /> : <CheckCircle2 size={13} />}
                    {isIn ? 'Uncheck' : 'Check in'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value, color, icon }: { label: string; value: string; color: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.9px]" style={{ color: '#6B6C80' }}>{label}</span>
        {icon}
      </div>
      <div className="font-display text-[19px] leading-tight" style={{ color }}>{value}</div>
    </div>
  );
}

function CenteredLoader() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Loader2 size={26} strokeWidth={2} color="#FF2D95" className="animate-spin" />
    </div>
  );
}
