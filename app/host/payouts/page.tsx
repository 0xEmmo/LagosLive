'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, RefreshCw, Wallet, Landmark, CalendarDays, XCircle, Plus } from 'lucide-react';
import BackButton from '@/components/BackButton';
import { useLagosLiveStore } from '@/lib/store';
import { fetchPayouts, fetchHostOrders, requestPayout, type PayoutRow, type AdminOrderJoined } from '@/lib/admin-queries';
import { formatNaira } from '@/lib/filters';

const STATUS_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  pending: { label: 'Pending', bg: 'rgba(255,214,0,0.1)', color: '#FFD600' },
  processing: { label: 'Processing', bg: 'rgba(176,106,255,0.1)', color: '#B06AFF' },
  approved: { label: 'Approved', bg: 'rgba(0,191,255,0.1)', color: '#00BFFF' },
  paid: { label: 'Paid', bg: 'rgba(0,245,212,0.08)', color: '#00F5D4' },
  rejected: { label: 'Rejected', bg: 'rgba(255,45,149,0.12)', color: '#FF2D95' },
};

const MIN_PAYOUT = 500000; // ₦5,000 in kobo

function fmtDate(iso: string | null, fallback = '—') {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function HostPayoutsPage() {
  const router = useRouter();
  const user = useLagosLiveStore((s) => s.user);
  const authLoading = useLagosLiveStore((s) => s.authLoading);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [orders, setOrders] = useState<AdminOrderJoined[]>([]);
  const [status, setStatus] = useState<'loading' | 'error' | 'ok'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [requesting, setRequesting] = useState(false);
  const [requestMsg, setRequestMsg] = useState('');
  const [showRequestForm, setShowRequestForm] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login?next=%2Fhost%2Fpayouts');
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    setStatus('loading');
    Promise.all([fetchPayouts(), fetchHostOrders(user.id)])
      .then(([p, o]) => {
        setPayouts(p);
        setOrders(o);
        setStatus('ok');
      })
      .catch(() => setStatus('error'));
  }, [user, attempt]);

  if (!user) return null;

  const paid = payouts.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
  const pending = payouts.filter((p) => p.status === 'pending' || p.status === 'processing' || p.status === 'approved').reduce((s, p) => s + p.amount, 0);

  const confirmed = orders.filter((o) => o.payment_status === 'confirmed');
  const totalRevenue = confirmed.reduce((s, o) => s + o.total, 0);
  const paidOut = payouts.filter((p) => p.status === 'paid' || p.status === 'approved' || p.status === 'processing' || p.status === 'pending').reduce((s, p) => s + p.amount, 0);
  const available = Math.max(0, totalRevenue - paidOut);
  const canRequest = available >= MIN_PAYOUT;

  const handleRequestPayout = async () => {
    if (!user || !canRequest) return;
    setRequesting(true);
    setRequestMsg('');
    try {
      const now = new Date();
      const periodStart = new Date(now.getTime() - 30 * 86400000).toISOString().split('T')[0];
      const periodEnd = now.toISOString().split('T')[0];
      const platformFee = Math.round(available * 0.15);
      const payoutAmount = available - platformFee;
      await requestPayout(user.id, payoutAmount, periodStart, periodEnd, available, platformFee, null);
      setRequestMsg('Payout request submitted! It will be reviewed by our team.');
      setShowRequestForm(false);
      setAttempt((a) => a + 1);
    } catch {
      setRequestMsg('Failed to submit payout request. Please try again.');
    } finally {
      setRequesting(false);
    }
  };

  return (
    <div className="mx-auto max-w-[600px] animate-fade-in">
      <div className="sticky top-0 z-40 flex items-center gap-3 border-b px-5 py-3.5 backdrop-blur-[22px] backdrop-saturate-150" style={{ background: 'var(--c-header)', borderColor: 'rgba(255,255,255,0.04)' }}>
        <BackButton href="/host" />
        <span className="font-heading text-[13px] font-bold uppercase tracking-[1px]" style={{ color: '#FFFFFF' }}>Payouts</span>
      </div>

      <div className="flex flex-col gap-4 p-5">
        <div className="grid grid-cols-3 gap-2.5">
          <Stat label="Paid Out" value={formatNaira(paid)} color="#00F5D4" icon={<Landmark size={14} strokeWidth={2} color="#00F5D4" />} />
          <Stat label="Pending" value={formatNaira(pending)} color="#FFD600" icon={<Wallet size={14} strokeWidth={2} color="#FFD600" />} />
          <Stat label="Available" value={formatNaira(available)} color="#B06AFF" icon={<Wallet size={14} strokeWidth={2} color="#B06AFF" />} />
        </div>

        <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="text-[12px]" style={{ color: '#A7A8B5' }}>
            Your revenue is settled to your bank after each payout cycle. Once a payout is <span className="font-semibold" style={{ color: '#00F5D4' }}>Paid</span>, funds should reach your account within a few business days.
          </div>
        </div>

        {/* Request payout */}
        <div className="rounded-2xl p-4" style={{ background: 'rgba(255,45,149,0.04)', border: '1px solid rgba(255,45,149,0.15)' }}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[13px] font-semibold" style={{ color: '#FFFFFF' }}>Request Payout</div>
              <div className="text-[11px]" style={{ color: '#A7A8B5' }}>
                {canRequest
                  ? `Available: ${formatNaira(available)} (min. ${formatNaira(MIN_PAYOUT)})`
                  : `Minimum payout: ${formatNaira(MIN_PAYOUT)}. Available: ${formatNaira(available)}`}
              </div>
            </div>
            <button
              onClick={() => setShowRequestForm(!showRequestForm)}
              disabled={!canRequest}
              className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[12px] font-bold transition-all disabled:opacity-40"
              style={{ background: canRequest ? 'linear-gradient(135deg, #FF2D95, #8A2BE2)' : 'rgba(255,255,255,0.06)', color: '#FFFFFF' }}
            >
              <Plus size={14} strokeWidth={2.5} />
              {canRequest ? 'Request' : 'Unavailable'}
            </button>
          </div>

          {showRequestForm && canRequest && (
            <div className="mt-3 border-t pt-3" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              <div className="rounded-xl p-3 text-[12px]" style={{ background: 'rgba(255,255,255,0.03)', color: '#A7A8B5' }}>
                <div className="mb-2 font-semibold" style={{ color: '#FFFFFF' }}>Payout Summary</div>
                <div className="flex justify-between"><span>Gross revenue</span><span style={{ color: '#FFFFFF' }}>{formatNaira(available)}</span></div>
                <div className="flex justify-between"><span>Platform fee (15%)</span><span style={{ color: '#FFFFFF' }}>-{formatNaira(Math.round(available * 0.15))}</span></div>
                <div className="mt-1 flex justify-between border-t pt-1 font-bold" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                  <span style={{ color: '#00F5D4' }}>You receive</span>
                  <span style={{ color: '#00F5D4' }}>{formatNaira(available - Math.round(available * 0.15))}</span>
                </div>
              </div>
              <button
                onClick={handleRequestPayout}
                disabled={requesting}
                className="mt-3 w-full rounded-xl py-2.5 text-[13px] font-bold transition-all disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #FF2D95, #8A2BE2)', color: '#FFFFFF' }}
              >
                {requesting ? 'Submitting...' : 'Confirm Payout Request'}
              </button>
            </div>
          )}
        </div>

        {requestMsg && (
          <div
            className="rounded-xl px-4 py-3 text-[12px]"
            style={{
              background: requestMsg.includes('Failed') ? 'rgba(255,45,149,0.1)' : 'rgba(0,245,212,0.08)',
              border: `1px solid ${requestMsg.includes('Failed') ? 'rgba(255,45,149,0.25)' : 'rgba(0,245,212,0.2)'}`,
              color: requestMsg.includes('Failed') ? '#FF2D95' : '#00F5D4',
            }}
          >
            {requestMsg}
          </div>
        )}

        {status === 'loading' ? (
          <div className="flex flex-col gap-2.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[96px] animate-pulse rounded-2xl" style={{ background: 'rgba(255,255,255,0.04)' }} />
            ))}
          </div>
        ) : status === 'error' ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl px-6 py-12 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,138,0,0.2)' }}>
            <AlertTriangle size={26} strokeWidth={1.5} color="#FF8A00" />
            <div className="text-sm" style={{ color: '#A7A8B5' }}>Couldn&apos;t load your payouts. Try again.</div>
            <button onClick={() => setAttempt((a) => a + 1)} className="flex items-center gap-2 rounded-[10px] px-4 py-2 text-[13px] font-semibold" style={{ background: 'rgba(255,138,0,0.12)', border: '1px solid rgba(255,138,0,0.3)', color: '#FF8A00' }}>
              <RefreshCw size={13} strokeWidth={2.5} /> Retry
            </button>
          </div>
        ) : payouts.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl px-6 py-14 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <XCircle size={26} strokeWidth={1.5} color="#6B6C80" />
            <div className="text-sm" style={{ color: '#A7A8B5' }}>
              No payouts yet. Once you start selling, your revenue will be settled here each cycle.
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {payouts.map((p) => {
              const sb = STATUS_BADGE[p.status] ?? STATUS_BADGE.pending;
              return (
                <div key={p.id} className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-display text-[19px]" style={{ color: '#FFFFFF' }}>{formatNaira(p.amount)}</div>
                      <div className="mt-1 flex items-center gap-1.5 text-[11px]" style={{ color: '#A7A8B5' }}>
                        <CalendarDays size={12} strokeWidth={2} />
                        {fmtDate(p.period_start)} – {fmtDate(p.period_end)}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-semibold" style={{ background: sb.bg, color: sb.color }}>
                      {sb.label}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-[11px]" style={{ borderColor: 'rgba(255,255,255,0.05)', color: '#A7A8B5' }}>
                    <span>Revenue <span className="font-semibold" style={{ color: '#FFFFFF' }}>{formatNaira(p.revenue)}</span></span>
                    <span>Platform fee <span className="font-semibold" style={{ color: '#FFFFFF' }}>{formatNaira(p.platform_fee)}</span></span>
                    {p.bank_last4 && <span>Bank •••• {p.bank_last4}</span>}
                  </div>
                  {p.paid_at && <div className="mt-2 text-[10.5px]" style={{ color: '#6B6C80' }}>Paid {fmtDate(p.paid_at)}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, color, icon }: { label: string; value: string; color: string; icon: React.ReactNode }) {
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
