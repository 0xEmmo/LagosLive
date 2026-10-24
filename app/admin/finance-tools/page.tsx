'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import AdminShell from '@/components/admin-shell';
import { PageHeader, usePermissionGuard } from '@/components/ui/dashboard-ui';
import { useLagosLiveStore } from '@/lib/store';
import { formatNaira } from '@/lib/filters';
import { fetchAdminEvents, type AdminEventJoined } from '@/lib/admin-queries';
import { fetchTicketTypes } from '@/lib/queries';

type TicketOption = Awaited<ReturnType<typeof fetchTicketTypes>>[number];
type WalletUser = { id: string; email: string; name: string | null; role: string | null };

function Field({ label, value, onChange, type = 'text', placeholder = '' }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-xs" style={{ color: '#A7A8B5' }}>
      {label}
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="rounded-xl px-3 py-2.5 text-sm outline-none" style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)', color: '#FFF' }} />
    </label>
  );
}

function SelectField({ label, value, onChange, children, disabled = false }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode; disabled?: boolean }) {
  return (
    <label className="flex flex-col gap-1.5 text-xs" style={{ color: '#A7A8B5' }}>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="rounded-xl px-3 py-2.5 text-sm outline-none disabled:opacity-50" style={{ background: '#171923', border: '1px solid rgba(255,255,255,.1)', color: '#FFF' }}>
        {children}
      </select>
    </label>
  );
}

function eventLabel(event: AdminEventJoined) {
  const date = event.starts_at ? new Date(event.starts_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : event.date;
  return `${event.title} · ${date}`;
}

export default function FinanceToolsPage() {
  const { ready } = usePermissionGuard('wallets.adjust');
  const toast = useLagosLiveStore((s) => s.showToast);
  const [userEmail, setUserEmail] = useState('');
  const [walletUser, setWalletUser] = useState<WalletUser | null>(null);
  const [userSearchBusy, setUserSearchBusy] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [kind, setKind] = useState('admin_credit');
  const [payoutHostEmail, setPayoutHostEmail] = useState('');
  const [payoutHost, setPayoutHost] = useState<WalletUser | null>(null);
  const [payoutHostBusy, setPayoutHostBusy] = useState(false);
  const [payoutHostLedger, setPayoutHostLedger] = useState<HostPayoutLedger | null>(null);
  const [payoutAdjustmentAmount, setPayoutAdjustmentAmount] = useState('');
  const [payoutAdjustmentNote, setPayoutAdjustmentNote] = useState('');
  const [payoutAdjustmentReference, setPayoutAdjustmentReference] = useState('');
  const [partyId, setPartyId] = useState('');
  const [typeId, setTypeId] = useState('');
  const [email, setEmail] = useState('');
  const [compAccount, setCompAccount] = useState<WalletUser | null>(null);
  const [compLookupBusy, setCompLookupBusy] = useState(false);
  const [name, setName] = useState('');
  const [qty, setQty] = useState('1');
  const [events, setEvents] = useState<AdminEventJoined[]>([]);
  const [ticketTypes, setTicketTypes] = useState<TicketOption[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [tiersLoading, setTiersLoading] = useState(false);
  const [profit, setProfit] = useState<Record<string, number> | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setEventsLoading(true);
    fetchAdminEvents({ status: 'approved' })
      .then((rows) => {
        if (!cancelled) setEvents(rows);
      })
      .catch((error) => {
        if (!cancelled) toast('Could not load events', error instanceof Error ? error.message : 'Try again.');
      })
      .finally(() => {
        if (!cancelled) setEventsLoading(false);
      });
    return () => { cancelled = true; };
  }, [ready, toast]);

  useEffect(() => {
    if (!partyId) {
      setTicketTypes([]);
      setTypeId('');
      return;
    }
    let cancelled = false;
    setTiersLoading(true);
    fetchTicketTypes(Number(partyId))
      .then((rows) => {
        if (!cancelled) {
          setTicketTypes(rows);
          setTypeId('');
        }
      })
      .catch((error) => {
        if (!cancelled) toast('Could not load ticket tiers', error instanceof Error ? error.message : 'Try again.');
      })
      .finally(() => {
        if (!cancelled) setTiersLoading(false);
      });
    return () => { cancelled = true; };
  }, [partyId, toast]);

  if (!ready) return null;

  const selectedEvent = events.find((event) => String(event.id) === partyId);
  const selectedTier = ticketTypes.find((tier) => String(tier.id) === typeId);
  const selectableEvents = events.filter((event) => event.status === 'approved');

  const selectEvent = (value: string) => {
    setPartyId(value);
    setProfit(null);
  };

  const findWalletUser = async () => {
    const email = userEmail.trim().toLowerCase();
    if (!email) return;
    setUserSearchBusy(true);
    setWalletUser(null);
    try {
      const response = await fetch(`/api/admin/users/search?email=${encodeURIComponent(email)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setWalletUser(data.user);
      toast('Account found', `${data.user.name || data.user.email} is ready for adjustment.`);
    } catch (error) {
      toast('Account not found', error instanceof Error ? error.message : 'Could not find that email.');
    } finally {
      setUserSearchBusy(false);
    }
  };

  const findPayoutHost = async () => {
    const target = payoutHostEmail.trim().toLowerCase();
    if (!target) return;
    setPayoutHostBusy(true);
    setPayoutHost(null);
    setPayoutHostLedger(null);
    try {
      const response = await fetch(`/api/admin/users/search?email=${encodeURIComponent(target)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const account = data.user as WalletUser;
      if (!['organizer', 'finance', 'support', 'admin', 'super_admin'].includes(account.role ?? '')) {
        throw new Error('That account is not a host account.');
      }
      const ledgerResponse = await fetch(`/api/admin/host-payout-adjustments?hostUserId=${encodeURIComponent(account.id)}`);
      const ledgerData = await ledgerResponse.json();
      if (!ledgerResponse.ok) throw new Error(ledgerData.error);
      setPayoutHost(account);
      setPayoutHostLedger(ledgerData.ledger as HostPayoutLedger);
    } catch (error) {
      toast('Host account not found', error instanceof Error ? error.message : 'Could not load that host.');
    } finally {
      setPayoutHostBusy(false);
    }
  };

  const applyHostPayoutAdjustment = async () => {
    if (!payoutHost) return;
    setPayoutHostBusy(true);
    try {
      const response = await fetch('/api/admin/host-payout-adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostUserId: payoutHost.id,
          amount: Number(payoutAdjustmentAmount),
          note: payoutAdjustmentNote,
          reference: payoutAdjustmentReference,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const ledger = data.ledger as HostPayoutLedger;
      setPayoutHostLedger(ledger);
      setPayoutAdjustmentAmount('');
      setPayoutAdjustmentNote('');
      setPayoutAdjustmentReference('');
      toast('Host payout ledger updated', `New available balance: ${formatNaira(Number(ledger.available))}`);
    } catch (error) {
      toast('Could not adjust payout balance', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setPayoutHostBusy(false);
    }
  };

  const findCompAccount = async () => {
    const target = email.trim().toLowerCase();
    if (!target) return;
    setCompLookupBusy(true);
    setCompAccount(null);
    try {
      const response = await fetch(`/api/admin/users/search?email=${encodeURIComponent(target)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const account = data.user as WalletUser;
      if (account.email.trim().toLowerCase() !== target) throw new Error('Use the exact email address on the Lagos Live account.');
      setCompAccount(account);
      toast('Account linked', `The free ticket will be attached to ${account.email}.`);
    } catch (error) {
      toast('No matching account', error instanceof Error ? error.message : 'The ticket can still be sent as a guest email.');
    } finally {
      setCompLookupBusy(false);
    }
  };

  const adjust = async () => {
    setBusy(true);
    try {
      const r = await fetch('/api/admin/wallets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: walletUser?.id, amount: Number(amount), kind, note }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast('Wallet updated', `New balance: ${formatNaira(d.wallet.balance)}`);
      setAmount('');
    } catch (e) {
      toast('Wallet error', e instanceof Error ? e.message : 'Could not update wallet.');
    } finally {
      setBusy(false);
    }
  };

  const loadProfit = async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/event-profitability?partyId=${encodeURIComponent(partyId)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setProfit(d.profit);
    } catch (e) {
      toast('Could not load gain', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const gift = async () => {
    setBusy(true);
    try {
      const r = await fetch('/api/admin/complimentary-tickets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ partyId: Number(partyId), ticketTypeId: Number(typeId), quantity: Number(qty), email, guestName: name, userId: compAccount?.id ?? null }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast('Ticket issued', `${d.orderRef}${d.emailSent ? ' · email sent' : ' · email could not be sent'}`);
      setEmail('');
      setCompAccount(null);
      setName('');
    } catch (e) {
      toast('Could not issue ticket', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminShell>
      <div className="mx-auto max-w-[980px] p-5">
        <PageHeader title="Finance & Complimentary Access" subtitle="Super-admin controls are audited and do not alter paid sales." />
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)' }}>
            <h2 className="mb-1 text-sm font-bold text-white">Wallet adjustment</h2>
            <p className="mb-4 text-xs" style={{ color: '#A7A8B5' }}>Credit or debit a customer&apos;s spendable ticket wallet for a top-up, offline payment, or deal. This does not change host payout balances.</p>
            <div className="grid gap-3">
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1"><Field label="Customer account email" value={userEmail} onChange={(value) => { setUserEmail(value); setWalletUser(null); }} type="email" placeholder="customer@example.com" /></div>
                <button type="button" disabled={userSearchBusy || !userEmail.trim()} onClick={findWalletUser} className="rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-50" style={{ background: '#6E8DFF', color: '#FFF' }}>{userSearchBusy ? 'Finding…' : 'Find account'}</button>
              </div>
              {walletUser && <div className="rounded-lg px-3 py-2 text-[11px]" style={{ background: 'rgba(0,169,143,.1)', color: '#8DE8D6' }}>Selected account: <strong>{walletUser.name || walletUser.email}</strong> · {walletUser.email} · {walletUser.role || 'user'}</div>}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Amount (₦; negative = debit)" value={amount} onChange={setAmount} type="number" />
                <SelectField label="Reason" value={kind} onChange={setKind}><option value="admin_credit">Admin credit</option><option value="admin_debit">Admin debit</option><option value="offline_credit">Offline credit</option><option value="deal_adjustment">Deal adjustment</option></SelectField>
              </div>
              <Field label="Audit note" value={note} onChange={setNote} placeholder="Why was this adjustment made?" />
              <button disabled={busy || !walletUser || !amount || !note} onClick={adjust} className="mt-1 rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-50" style={{ background: '#2B68FF', color: '#FFF' }}>Apply wallet change</button>
            </div>
          </section>

          <section className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)' }}>
            <h2 className="mb-1 text-sm font-bold text-white">Complimentary ticket</h2>
            <p className="mb-4 text-xs" style={{ color: '#A7A8B5' }}>Select a listed event and ticket tier. LagosLive fills the IDs automatically and creates a confirmed ₦0 order excluded from paid revenue.</p>
            <div className="grid gap-3">
              <SelectField label="Listed event" value={partyId} onChange={selectEvent} disabled={eventsLoading}>
                <option value="">{eventsLoading ? 'Loading listed events…' : selectableEvents.length ? 'Select an event' : 'No approved events found'}</option>
                {selectableEvents.map((event) => <option key={event.id} value={event.id}>{eventLabel(event)}{event.spots_left === 0 ? ' · sold out' : ''}</option>)}
              </SelectField>
              {selectedEvent && <div className="rounded-lg px-3 py-2 text-[11px]" style={{ background: 'rgba(43,104,255,.1)', color: '#A7C2FF' }}>Event ID automatically selected: <strong>{selectedEvent.id}</strong> · {selectedEvent.location}</div>}
              <SelectField label="Ticket tier" value={typeId} onChange={setTypeId} disabled={!partyId || tiersLoading}>
                <option value="">{tiersLoading ? 'Loading ticket tiers…' : partyId ? 'Select a ticket tier' : 'Select an event first'}</option>
                {ticketTypes.map((tier) => { const remaining = Math.max(0, tier.quantity - tier.sold); return <option key={tier.id} value={tier.id} disabled={remaining < 1 || tier.active === false}>{tier.name} · {formatNaira(tier.price)} · {remaining} left</option>; })}
              </SelectField>
              {selectedTier && <div className="rounded-lg px-3 py-2 text-[11px]" style={{ background: 'rgba(0,169,143,.1)', color: '#8DE8D6' }}>Ticket tier ID automatically selected: <strong>{selectedTier.id}</strong> · {Math.max(0, selectedTier.quantity - selectedTier.sold)} remaining</div>}
              <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                <Field label="Guest email" value={email} onChange={(value) => { setEmail(value); setCompAccount(null); }} type="email" />
                <button type="button" disabled={compLookupBusy || !email.trim()} onClick={findCompAccount} className="min-h-10 rounded-xl px-3 py-2.5 text-xs font-bold disabled:opacity-50" style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', color: '#FFF' }}>{compLookupBusy ? 'Finding…' : 'Link account'}</button>
                <Field label="Quantity" value={qty} onChange={setQty} type="number" />
              </div>
              {compAccount && <div className="rounded-lg px-3 py-2 text-[11px]" style={{ background: 'rgba(0,169,143,.1)', color: '#8DE8D6' }}>Linked Lagos Live account: <strong>{compAccount.name || compAccount.email}</strong> · {compAccount.email}</div>}
              <Field label="Guest name (optional)" value={name} onChange={setName} />
              <button disabled={busy || !partyId || !typeId || !email} onClick={gift} className="rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-50" style={{ background: '#00A98F', color: '#FFF' }}>Issue free ticket & email guest</button>
            </div>
          </section>
        </div>

        <section className="mt-5 rounded-2xl p-5" style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)' }}>
          <h2 className="mb-1 text-sm font-bold text-white">Host payout ledger adjustment</h2>
          <p className="mb-4 text-xs" style={{ color: '#A7A8B5' }}>Separate from customer wallets and event sales. A positive amount tops up withdrawable host payout balance; a negative amount deducts it. Every change requires an audit note.</p>
          <div className="grid gap-3">
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1"><Field label="Host account email" value={payoutHostEmail} onChange={(value) => { setPayoutHostEmail(value); setPayoutHost(null); setPayoutHostLedger(null); }} type="email" placeholder="host@example.com" /></div>
              <button type="button" disabled={payoutHostBusy || !payoutHostEmail.trim()} onClick={findPayoutHost} className="rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-50" style={{ background: '#6E8DFF', color: '#FFF' }}>{payoutHostBusy ? 'Loading…' : 'Find host'}</button>
            </div>
            {payoutHost && <div className="rounded-lg px-3 py-2 text-[11px]" style={{ background: 'rgba(0,169,143,.1)', color: '#8DE8D6' }}>Selected host: <strong>{payoutHost.name || payoutHost.email}</strong> · {payoutHost.email} · {payoutHost.role}</div>}
            {payoutHostLedger && (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {[
                    ['Eligible sales', formatNaira(payoutHostLedger.sales_revenue)],
                    ['Platform fee', formatNaira(payoutHostLedger.platform_fee)],
                    ['Sales earnings', formatNaira(payoutHostLedger.sales_earnings)],
                    ['Unclaimed adjustments', formatNaira(payoutHostLedger.ledger_adjustments)],
                    ['Available', formatNaira(payoutHostLedger.available)],
                  ].map(([label, value]) => <div key={label} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,.04)' }}><div className="text-[10px] uppercase" style={{ color: '#6B6C80' }}>{label}</div><div className="mt-1 text-sm font-bold text-white">{value}</div></div>)}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Signed amount (₦; negative deducts)" value={payoutAdjustmentAmount} onChange={setPayoutAdjustmentAmount} type="number" placeholder="e.g. -5000 or 5000" />
                  <Field label="Reference (optional)" value={payoutAdjustmentReference} onChange={setPayoutAdjustmentReference} placeholder="Offline transfer / deal reference" />
                </div>
                <Field label="Audit note" value={payoutAdjustmentNote} onChange={setPayoutAdjustmentNote} placeholder="Why this host payout balance is changing" />
                <button type="button" disabled={payoutHostBusy || !payoutHost || !payoutAdjustmentAmount || !payoutAdjustmentNote.trim()} onClick={applyHostPayoutAdjustment} className="rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-50" style={{ background: '#2B68FF', color: '#FFF' }}>{payoutHostBusy ? 'Saving…' : 'Record host payout adjustment'}</button>
                {payoutHostLedger.ledger.length > 0 && (
                  <div className="space-y-2 border-t pt-3" style={{ borderColor: 'rgba(255,255,255,.08)' }}>
                    <div className="text-xs font-bold text-white">Adjustment history</div>
                    {payoutHostLedger.ledger.slice(0, 8).map((entry) => <div key={entry.id} className="flex items-start justify-between gap-3 rounded-xl px-3 py-2" style={{ background: 'rgba(255,255,255,.04)' }}><div className="min-w-0"><div className="text-[11px] text-white">{entry.note}</div><div className="text-[10px]" style={{ color: '#6B6C80' }}>{new Date(entry.created_at).toLocaleString('en-NG')}{entry.reference ? ` · ${entry.reference}` : ''}</div></div><div className="shrink-0 text-xs font-bold" style={{ color: entry.amount < 0 ? '#FF8A00' : '#00A98F' }}>{entry.amount > 0 ? '+' : ''}{formatNaira(entry.amount)}</div></div>)}
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        <section className="mt-5 rounded-2xl p-5" style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)' }}>
          <h2 className="mb-1 text-sm font-bold text-white">Event gain</h2>
          <p className="mb-4 text-xs" style={{ color: '#A7A8B5' }}>Paid sales, completed refunds, platform gain and host earnings are reported separately. Complimentary tickets have their own count and are excluded from sales and payout.</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end"><div className="min-w-0 flex-1"><SelectField label="Listed event" value={partyId} onChange={selectEvent} disabled={eventsLoading}><option value="">{eventsLoading ? 'Loading listed events…' : 'Select an event'}</option>{selectableEvents.map((event) => <option key={event.id} value={event.id}>{eventLabel(event)}</option>)}</SelectField></div><button disabled={busy || !partyId} onClick={loadProfit} className="rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-50" style={{ background: '#6E8DFF', color: '#FFF' }}>Calculate gain</button></div>
          {profit && <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">{[
            ['Gross revenue', formatNaira(Number(profit.gross_revenue ?? 0))],
            ['Discounts', formatNaira(Number(profit.discounts ?? 0))],
            ['Refunds', formatNaira(Number(profit.refunds ?? 0))],
            ['Platform gain', formatNaira(Number(profit.net_platform_gain ?? 0))],
            ['Host earnings', formatNaira(Number(profit.host_earnings ?? 0))],
            ['Paid tickets', String(Number(profit.paid_tickets ?? 0))],
            ['Complimentary', String(Number(profit.complimentary_tickets ?? 0))],
            ['Wallet used', formatNaira(Number(profit.wallet_used ?? 0))],
            ['Paystack collected', formatNaira(Number(profit.paystack_collected ?? 0))],
          ].map(([label, value]) => <div key={label} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,.04)' }}><div className="text-[10px] uppercase" style={{ color: '#6B6C80' }}>{label}</div><div className="mt-1 text-sm font-bold text-white">{value}</div></div>)}</div>}
        </section>
      </div>
    </AdminShell>
  );
}
type HostPayoutLedger = {
  host_user_id: string;
  sales_revenue: number;
  platform_fee: number;
  sales_earnings: number;
  ledger_adjustments: number;
  available: number;
  ledger: { id: number; amount: number; note: string; reference: string | null; created_at: string }[];
};
