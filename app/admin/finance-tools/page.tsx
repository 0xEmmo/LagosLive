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
  const [partyId, setPartyId] = useState('');
  const [typeId, setTypeId] = useState('');
  const [email, setEmail] = useState('');
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
      const r = await fetch('/api/admin/complimentary-tickets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ partyId: Number(partyId), ticketTypeId: Number(typeId), quantity: Number(qty), email, guestName: name }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast('Ticket issued', `${d.orderRef}${d.emailSent ? ' · email sent' : ' · email could not be sent'}`);
      setEmail('');
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
            <p className="mb-4 text-xs" style={{ color: '#A7A8B5' }}>Credit or debit a host/user for offline payments or a deal. Negative balances are blocked.</p>
            <div className="grid gap-3">
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1"><Field label="Host/user email" value={userEmail} onChange={(value) => { setUserEmail(value); setWalletUser(null); }} type="email" placeholder="host@example.com" /></div>
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
              <div className="grid grid-cols-2 gap-3"><Field label="Guest email" value={email} onChange={setEmail} type="email" /><Field label="Quantity" value={qty} onChange={setQty} type="number" /></div>
              <Field label="Guest name (optional)" value={name} onChange={setName} />
              <button disabled={busy || !partyId || !typeId || !email} onClick={gift} className="rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-50" style={{ background: '#00A98F', color: '#FFF' }}>Issue free ticket & email guest</button>
            </div>
          </section>
        </div>

        <section className="mt-5 rounded-2xl p-5" style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)' }}>
          <h2 className="mb-1 text-sm font-bold text-white">Event gain</h2>
          <p className="mb-4 text-xs" style={{ color: '#A7A8B5' }}>Select a listed event to calculate paid revenue, refunds, platform fee and host earnings. Complimentary orders are not included in revenue.</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end"><div className="min-w-0 flex-1"><SelectField label="Listed event" value={partyId} onChange={selectEvent} disabled={eventsLoading}><option value="">{eventsLoading ? 'Loading listed events…' : 'Select an event'}</option>{selectableEvents.map((event) => <option key={event.id} value={event.id}>{eventLabel(event)}</option>)}</SelectField></div><button disabled={busy || !partyId} onClick={loadProfit} className="rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-50" style={{ background: '#6E8DFF', color: '#FFF' }}>Calculate gain</button></div>
          {profit && <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">{[['Gross revenue', profit.gross_revenue], ['Discounts', profit.discounts], ['Refunds', profit.refunds], ['Platform gain', profit.net_platform_gain], ['Host earnings', profit.host_earnings]].map(([label, value]) => <div key={String(label)} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,.04)' }}><div className="text-[10px] uppercase" style={{ color: '#6B6C80' }}>{label}</div><div className="mt-1 text-sm font-bold text-white">{formatNaira(Number(value))}</div></div>)}</div>}
        </section>
      </div>
    </AdminShell>
  );
}
