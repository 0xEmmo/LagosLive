'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, Wallet, Landmark, CalendarDays, XCircle, Plus, ShieldCheck } from 'lucide-react';
import HostDashboardNav from '@/components/HostDashboardNav';
import { useLagosLiveStore } from '@/lib/store';
import { fetchPayouts, fetchHostOrders, requestPayout, fetchBankAccounts, registerBankAccount, removeBankAccount, type PayoutRow, type AdminOrderJoined, type HostBankAccount, type NigerianBank } from '@/lib/admin-queries';
import { formatNaira } from '@/lib/filters';

const STATUS_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  pending: { label: 'Pending', bg: 'rgba(255,214,0,0.1)', color: '#FFD600' },
  processing: { label: 'Processing', bg: 'rgba(176,106,255,0.1)', color: '#B06AFF' },
  approved: { label: 'Approved', bg: 'rgba(0,191,255,0.1)', color: '#00BFFF' },
  transfer_pending: { label: 'On its way', bg: 'rgba(0,191,255,0.16)', color: '#00BFFF' },
  paid: { label: 'Paid', bg: 'rgba(0,245,212,0.08)', color: '#00F5D4' },
  rejected: { label: 'Rejected', bg: 'rgba(255,45,149,0.12)', color: '#FF2D95' },
  reconciliation_required: {
    label: 'Under review',
    bg: 'rgba(255,138,0,0.12)',
    color: '#FF8A00',
  },
};

const MIN_PAYOUT = 1000; // ₦1,000

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

  // Verified payout destination. A host cannot request a payout without one,
  // so this is a precondition rather than an optional extra.
  const [accounts, setAccounts] = useState<HostBankAccount[]>([]);
  const [banks, setBanks] = useState<NigerianBank[]>([]);
  const [showBankForm, setShowBankForm] = useState(false);
  const [bankName, setBankName] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [savingBank, setSavingBank] = useState(false);
  const [bankMsg, setBankMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchBankAccounts()
      .then(({ accounts: a, banks: b }) => {
        setAccounts(a);
        setBanks(b);
      })
      .catch(() => setBankMsg({ tone: 'err', text: 'Could not load your bank accounts.' }));
  }, [user, attempt]);

  const activeAccount = accounts[0] ?? null;

  const handleSaveBankAccount = async () => {
    setSavingBank(true);
    setBankMsg(null);
    try {
      const result = await registerBankAccount({ accountNumber, bankCode, accountName });
      // The number is cleared from state the moment it has been exchanged for
      // a recipient code, so it does not linger in a React tree or a heap dump.
      setAccountNumber('');
      setShowBankForm(false);
      setAccountName('');
      if (result.nameMismatch) {
        setBankMsg({
          tone: 'err',
          text: `Saved, but the bank holds this account as "${result.accountName}", not "${accountName}". Payouts will go to the bank's name.`,
        });
      } else {
        setBankMsg({ tone: 'ok', text: `Bank account ending ${result.last4} verified.` });
      }
      setAttempt((a) => a + 1);
    } catch (err) {
      setBankMsg({
        tone: 'err',
        text: err instanceof Error ? err.message : 'Could not verify that account.',
      });
    } finally {
      setSavingBank(false);
    }
  };

  const handleRemoveBankAccount = async () => {
    if (!activeAccount) return;
    if (!confirm(`Remove the account ending ${activeAccount.account_number_last4}?`)) return;
    try {
      await removeBankAccount(activeAccount.id);
      setBankMsg({ tone: 'ok', text: 'Bank account removed.' });
      setAttempt((a) => a + 1);
    } catch (err) {
      setBankMsg({
        tone: 'err',
        text: err instanceof Error ? err.message : 'Could not remove that account.',
      });
    }
  };

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
  // A transfer in flight is money that has left this platform and not yet landed,
  // so it counts as pending rather than paid.
  const pending = payouts.filter((p) => ['pending', 'processing', 'approved', 'transfer_pending'].includes(p.status)).reduce((s, p) => s + p.amount, 0);

  const confirmed = orders.filter((o) => o.payment_status === 'confirmed');
  const totalRevenue = confirmed.reduce((s, o) => s + o.total, 0);
  // A payout awaiting reconciliation is not money that left, so it is neither
  // paid out nor spoken for: the revenue is owed again and the host can be paid
  // for it once finance finishes reviewing the reversal. It is deliberately not
  // in the "pending" figure either, because nothing is in flight.
  //
  // 'transfer_pending' is in here because the money genuinely is committed and
  // must not be counted as available to be requested again.
  const paidOut = payouts.filter((p) => ['paid', 'approved', 'processing', 'pending', 'transfer_pending'].includes(p.status)).reduce((s, p) => s + p.amount, 0);
  const available = Math.max(0, totalRevenue - paidOut);
  const underReview = payouts.filter((p) => p.status === 'reconciliation_required');
  // A verified bank account is a hard precondition, enforced by the server as
  // well: the button is disabled so the host is told why rather than being
  // allowed to submit something that will be refused.
  const hasBankAccount = accounts.length > 0;
  const canRequest =
    underReview.length === 0 &&
    available >= MIN_PAYOUT &&
    user.hostVerificationStatus === 'verified' &&
    hasBankAccount;
  const requestBlockedReason = underReview.length > 0
    ? 'A payout transfer was returned by your bank, so new payouts are on hold until our team has reviewed it. Your events and ticket sales are not affected.'
    : !hasBankAccount
    ? 'Add a verified bank account to receive payouts.'
    : user.hostVerificationStatus !== 'verified'
    ? 'Complete host verification to request payouts.'
    : `Minimum payout: ${formatNaira(MIN_PAYOUT)}. Available: ${formatNaira(available)}`;

  const handleRequestPayout = async () => {
    if (!user || !canRequest) return;
    setRequesting(true);
    setRequestMsg('');
    try {
      // No figures are sent: the server derives revenue, the fee and the period
      // from the host's own confirmed orders. The numbers shown on this screen
      // are a preview and are no longer the source of the payout.
      await requestPayout();
      setRequestMsg('Payout request submitted! It will be reviewed by our team.');
      setShowRequestForm(false);
      setAttempt((a) => a + 1);
    } catch (err) {
      setRequestMsg(err instanceof Error ? err.message : 'Failed to submit payout request. Please try again.');
    } finally {
      setRequesting(false);
    }
  };

  return (
    <div className="mx-auto max-w-[600px] animate-fade-in pb-24 md:max-w-[1000px]">
      <HostDashboardNav title="Payouts" />

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

        {underReview.length > 0 && (
          <div
            className="rounded-2xl p-4"
            style={{ background: 'rgba(255,138,0,0.07)', border: '1px solid rgba(255,138,0,0.3)' }}
          >
            <div className="flex items-start gap-3">
              <AlertTriangle size={18} strokeWidth={1.5} color="#FF8A00" className="mt-0.5 shrink-0" />
              <div className="flex-1 text-[12px]" style={{ color: '#D5D6E0' }}>
                <span className="font-bold" style={{ color: '#FFFFFF' }}>
                  {underReview.length === 1
                    ? 'A payout of yours was returned by the bank'
                    : `${underReview.length} of your payouts were returned by the bank`}
                  .
                </span>{' '}
                The transfer was sent and then came back, so the money was never
                received. We have put your payouts on hold while someone checks it,
                and that amount is owed to you again. Your events, your tickets and
                your account are unaffected — you keep selling. Most returns are a
                mistyped account number, and adding a corrected bank account below
                usually resolves it.
              </div>
            </div>
            <div className="mt-3 space-y-1.5">
              {underReview.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-[10px] px-3 py-2 text-[11.5px]"
                  style={{ background: 'rgba(0,0,0,0.25)', color: '#A7A8B5' }}
                >
                  <span>{fmtDate(p.created_at)}</span>
                  <span className="font-semibold" style={{ color: '#FF8A00' }}>
                    {formatNaira(p.amount)} — with the bank for review
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {user.hostVerificationStatus !== 'verified' && (
          <div className="flex items-center gap-3 rounded-2xl p-4" style={{ background: 'rgba(255,138,0,0.06)', border: '1px solid rgba(255,138,0,0.25)' }}>
            <ShieldCheck size={18} strokeWidth={1.5} color="#FF8A00" />
            <div className="flex-1 text-[12px]" style={{ color: '#D5D6E0' }}>
              <span className="font-bold" style={{ color: '#FFFFFF' }}>
                {user.hostVerificationStatus === 'pending'
                  ? 'Your host verification is under review.'
                  : user.hostVerificationStatus === 'rejected'
                  ? 'Your host verification was rejected.'
                  : 'You must verify your host account to request payouts.'}
              </span>{' '}
              Payouts open up once our team confirms you.
            </div>
            <Link
              href="/host/verification"
              className="shrink-0 rounded-[10px] px-3.5 py-2 text-[11.5px] font-bold"
              style={{ background: 'rgba(255,138,0,0.14)', border: '1px solid rgba(255,138,0,0.4)', color: '#FF8A00' }}
            >
              {user.hostVerificationStatus === 'pending'
                ? 'View Verification Status'
                : user.hostVerificationStatus === 'rejected'
                ? 'View Reason & Resubmit'
                : 'Complete Verification'}
            </Link>
          </div>
        )}

        {/* Verified bank account */}
        <div className="rounded-2xl p-4" style={{ background: 'rgba(0,245,212,0.04)', border: '1px solid rgba(0,245,212,0.15)' }}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: '#FFFFFF' }}>
                <Landmark size={14} strokeWidth={2} color="#00F5D4" />
                Payout Account
              </div>
              <div className="text-[11px]" style={{ color: '#A7A8B5' }}>
                {activeAccount
                  ? `${activeAccount.bank_name} •••• ${activeAccount.account_number_last4} • ${activeAccount.account_name}`
                  : 'Add the account your payouts should be sent to. We verify it with the bank before saving.'}
              </div>
            </div>
            <button
              onClick={() => setShowBankForm(!showBankForm)}
              className="flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2.5 text-[12px] font-bold transition-all"
              style={{ background: 'rgba(0,245,212,0.12)', border: '1px solid rgba(0,245,212,0.3)', color: '#00F5D4' }}
            >
              {activeAccount ? 'Change' : 'Add'}
            </button>
          </div>

          {activeAccount && (
            <div className="mt-2 flex items-center gap-2 text-[11px]" style={{ color: '#A7A8B5' }}>
              <ShieldCheck size={12} strokeWidth={2} color="#00F5D4" />
              <span>Verified {fmtDate(activeAccount.verified_at)}</span>
              <button
                onClick={handleRemoveBankAccount}
                className="ml-auto underline underline-offset-2"
                style={{ color: '#FF8A00' }}
              >
                Remove
              </button>
            </div>
          )}

          {showBankForm && (
            <div className="mt-3 grid gap-2 border-t pt-3 sm:grid-cols-2" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              <label className="flex flex-col gap-1 text-[11px]" style={{ color: '#A7A8B5' }}>
                Bank
                <select
                  value={bankCode}
                  onChange={(e) => setBankCode(e.target.value)}
                  className="rounded-lg px-3 py-2 text-[12px]"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFFFFF' }}
                >
                  <option value="">Select your bank</option>
                  {banks.map((b) => (
                    <option key={b.code} value={b.code}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-[11px]" style={{ color: '#A7A8B5' }}>
                Account number
                <input
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  inputMode="numeric"
                  placeholder="10-digit number"
                  autoComplete="off"
                  className="rounded-lg px-3 py-2 text-[12px]"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFFFFF' }}
                />
              </label>

              <label className="flex flex-col gap-1 text-[11px] sm:col-span-2" style={{ color: '#A7A8B5' }}>
                Account name
                <input
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder="Exactly as it appears on the account"
                  className="rounded-lg px-3 py-2 text-[12px]"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFFFFF' }}
                />
              </label>

              <div className="text-[11px] sm:col-span-2" style={{ color: '#A7A8B5' }}>
                We check the name against the bank and keep only the last four digits — the account
                number is never stored.
              </div>

              <button
                onClick={handleSaveBankAccount}
                disabled={savingBank || !bankCode || accountNumber.length !== 10 || accountName.trim().length < 2}
                className="rounded-xl py-2.5 text-[12px] font-bold transition-all disabled:opacity-40 sm:col-span-2"
                style={{ background: 'linear-gradient(135deg, #00F5D4, #00B894)', color: '#04121A' }}
              >
                {savingBank ? 'Verifying with the bank...' : 'Verify and save'}
              </button>
            </div>
          )}

          {bankMsg && (
            <div
              className="mt-2 rounded-xl px-3 py-2 text-[11px]"
              style={{
                background: bankMsg.tone === 'ok' ? 'rgba(0,245,212,0.08)' : 'rgba(255,138,0,0.1)',
                color: bankMsg.tone === 'ok' ? '#00F5D4' : '#FF8A00',
              }}
            >
              {bankMsg.text}
            </div>
          )}
        </div>

        {/* Request payout */}
        <div className="rounded-2xl p-4" style={{ background: 'rgba(255,45,149,0.04)', border: '1px solid rgba(255,45,149,0.15)' }}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[13px] font-semibold" style={{ color: '#FFFFFF' }}>Request Payout</div>
              <div className="text-[11px]" style={{ color: '#A7A8B5' }}>
                {canRequest
                  ? `Available: ${formatNaira(available)} (min. ${formatNaira(MIN_PAYOUT)})`
                  : requestBlockedReason}
              </div>
            </div>
            <button
              onClick={() => setShowRequestForm(!showRequestForm)}
              disabled={!canRequest}
              className="flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2.5 text-[12px] font-bold transition-all disabled:opacity-40"
              style={{ background: canRequest ? 'linear-gradient(135deg, #FF9B3E, #FF6A00)' : 'rgba(255,255,255,0.06)', color: '#FFFFFF' }}
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
                {activeAccount && (
                  <div className="mt-2 flex justify-between border-t pt-2" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                    <span>To</span>
                    <span style={{ color: '#FFFFFF' }}>{activeAccount.bank_name} •••• {activeAccount.account_number_last4}</span>
                  </div>
                )}
                <div className="mt-2 text-[11px]">
                  These figures are calculated by the server from your paid orders. The amount sent is
                  whatever it confirms at the time you press the button.
                </div>
              </div>
              <button
                onClick={handleRequestPayout}
                disabled={requesting}
                className="mt-3 w-full rounded-xl py-2.5 text-[13px] font-bold transition-all disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #FF9B3E, #FF6A00)', color: '#FFFFFF' }}
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
