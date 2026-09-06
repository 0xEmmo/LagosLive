'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Power, X } from 'lucide-react';
import AdminShell from '@/components/admin-shell';
import { PageHeader, LoadingBlock, ErrorBlock, EmptyBlock, TableShell, Cell, Badge, usePermissionGuard } from '@/components/ui/dashboard-ui';
import { fetchPromos, createPromo, updatePromo, deletePromo, type PromoRow } from '@/lib/admin-queries';
import { useLagosLiveStore } from '@/lib/store';

interface PromoForm {
  code: string;
  discountPercent: number;
  description: string;
  maxUses: string;
  startsAt: string;
  endsAt: string;
}

const EMPTY_FORM: PromoForm = { code: '', discountPercent: 10, description: '', maxUses: '', startsAt: '', endsAt: '' };

function promoState(p: PromoRow): { label: string; bg: string; color: string } {
  const now = Date.now();
  if (!p.active) return { label: 'Paused', bg: 'rgba(255,255,255,0.06)', color: '#A7A8B5' };
  if (p.ends_at && new Date(p.ends_at).getTime() < now) return { label: 'Expired', bg: 'rgba(255,90,46,0.08)', color: '#FF5A2E' };
  if (p.starts_at && new Date(p.starts_at).getTime() > now) return { label: 'Scheduled', bg: 'rgba(255,155,62,0.08)', color: '#FF9B3E' };
  return { label: 'Active', bg: 'rgba(62,207,142,0.08)', color: '#3ECF8E' };
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function AdminPromosPage() {
  const { ready } = usePermissionGuard('promos.view');
  const showToast = useLagosLiveStore((s) => s.showToast);
  const [promos, setPromos] = useState<PromoRow[]>([]);
  const [status, setStatus] = useState<'loading' | 'error' | 'ok'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [form, setForm] = useState<PromoForm | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setStatus('loading');
    try {
      setPromos(await fetchPromos());
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

  const usable = useMemo(() => promos.filter((p) => !p.ends_at || new Date(p.ends_at).getTime() >= Date.now()), [promos]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
  };

  const openEdit = (p: PromoRow) => {
    setEditingId(p.id);
    setForm({
      code: p.code,
      discountPercent: p.discount_percent,
      description: p.description ?? '',
      maxUses: p.max_uses !== null ? String(p.max_uses) : '',
      startsAt: p.starts_at ? new Date(p.starts_at).toISOString().slice(0, 16) : '',
      endsAt: p.ends_at ? new Date(p.ends_at).toISOString().slice(0, 16) : '',
    });
  };

  const toggleActive = async (p: PromoRow) => {
    try {
      await updatePromo(
        p.id,
        {
          code: p.code,
          discountPercent: p.discount_percent,
          description: p.description ?? '',
          maxUses: p.max_uses,
          startsAt: p.starts_at,
          endsAt: p.ends_at,
        },
        !p.active
      );
      await load();
      showToast(p.active ? 'Promo paused' : 'Promo activated', `${p.code} is now ${p.active ? 'paused' : 'live'}.`);
    } catch (e) {
      showToast('Error', e instanceof Error ? e.message : 'Could not update the promo.');
    }
  };

  const remove = async (p: PromoRow) => {
    if (!confirm(`Delete promo ${p.code}? This cannot be undone.`)) return;
    try {
      await deletePromo(p.id);
      await load();
      showToast('Promo deleted', `${p.code} removed.`);
    } catch (e) {
      showToast('Error', e instanceof Error ? e.message : 'Could not delete the promo.');
    }
  };

  const save = async () => {
    if (!form) return;
    const code = form.code.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_-]{2,23}$/.test(code)) {
      showToast('Invalid code', 'Use 3–24 letters, numbers, underscores or hyphens.');
      return;
    }
    if (form.discountPercent < 1 || form.discountPercent > 100) {
      showToast('Invalid discount', 'Discount must be between 1 and 100 percent.');
      return;
    }
    const maxUses = form.maxUses.trim() === '' ? null : Number(form.maxUses);
    if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1)) {
      showToast('Invalid limit', 'Maximum uses must be a whole number of at least 1.');
      return;
    }
    const startsAt = form.startsAt ? new Date(form.startsAt).toISOString() : null;
    const endsAt = form.endsAt ? new Date(form.endsAt).toISOString() : null;
    if (startsAt && endsAt && startsAt > endsAt) {
      showToast('Invalid window', 'Start must be before end.');
      return;
    }

    setSaving(true);
    try {
      const input = {
        code,
        discountPercent: form.discountPercent,
        description: form.description.trim(),
        maxUses,
        startsAt,
        endsAt,
      };
      if (editingId) {
        await updatePromo(editingId, input, promos.find((p) => p.id === editingId)?.active ?? true);
        showToast('Promo updated', `${code} saved.`);
      } else {
        await createPromo(input);
        showToast('Promo created', `${code} is now live.`);
      }
      setForm(null);
      setEditingId(null);
      await load();
    } catch (e) {
      showToast('Error', e instanceof Error ? e.message : 'Could not save the promo.');
    } finally {
      setSaving(false);
    }
  };

  if (!ready) return null;

  return (
    <AdminShell>
      <PageHeader
        title="Promo Codes"
        subtitle="Percent-off codes applied at checkout. Uses are counted once per confirmed order."
        right={
          <button
            onClick={form ? () => { setForm(null); setEditingId(null); } : openCreate}
            className="flex items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-[12.5px] font-bold"
            style={{ background: 'linear-gradient(135deg,#FF2D95,#8A2BE2)', color: '#FFFFFF' }}
          >
            {form ? <X size={14} strokeWidth={2.5} /> : <Plus size={14} strokeWidth={2.5} />}
            {form ? 'Cancel' : 'New Promo'}
          </button>
        }
      />

      {form && (
        <div className="mb-5 rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="mb-4 font-heading text-[13px] font-bold uppercase tracking-[1px]" style={{ color: '#FFFFFF' }}>
            {editingId ? 'Edit Promo' : 'New Promo'}
          </div>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            <label className="flex flex-col gap-1.5 text-[11px] font-semibold" style={{ color: '#A7A8B5' }}>
              Code
              <input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="SAVE10"
                className="rounded-[10px] px-3.5 py-2.5 text-[13px] uppercase outline-none"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFFFFF' }}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-[11px] font-semibold" style={{ color: '#A7A8B5' }}>
              Discount %
              <input
                type="number"
                min={1}
                max={100}
                value={form.discountPercent}
                onChange={(e) => setForm({ ...form, discountPercent: Number(e.target.value) })}
                className="rounded-[10px] px-3.5 py-2.5 text-[13px] outline-none"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFFFFF' }}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-[11px] font-semibold" style={{ color: '#A7A8B5' }}>
              Max uses (blank = unlimited)
              <input
                type="number"
                min={1}
                value={form.maxUses}
                onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
                placeholder="Unlimited"
                className="rounded-[10px] px-3.5 py-2.5 text-[13px] outline-none"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFFFFF' }}
              />
            </label>
            <label className="col-span-full flex flex-col gap-1.5 text-[11px] font-semibold sm:col-span-2" style={{ color: '#A7A8B5' }}>
              Description
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Internal note for staff"
                className="rounded-[10px] px-3.5 py-2.5 text-[13px] outline-none"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFFFFF' }}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-[11px] font-semibold" style={{ color: '#A7A8B5' }}>
              Starts at
              <input
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                className="rounded-[10px] px-3.5 py-2.5 text-[13px] outline-none"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFFFFF' }}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-[11px] font-semibold" style={{ color: '#A7A8B5' }}>
              Ends at
              <input
                type="datetime-local"
                value={form.endsAt}
                onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                className="rounded-[10px] px-3.5 py-2.5 text-[13px] outline-none"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFFFFF' }}
              />
            </label>
          </div>
          <div className="mt-4 flex justify-end gap-2.5">
            <button
              onClick={() => { setForm(null); setEditingId(null); }}
              className="rounded-[10px] px-4 py-2.5 text-[12.5px] font-semibold"
              style={{ background: 'rgba(255,255,255,0.05)', color: '#A7A8B5' }}
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="rounded-[10px] px-5 py-2.5 text-[12.5px] font-bold disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg,#FF2D95,#8A2BE2)', color: '#FFFFFF' }}
            >
              {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create Promo'}
            </button>
          </div>
        </div>
      )}

      {status === 'loading' && <LoadingBlock />}
      {status === 'error' && <ErrorBlock onRetry={() => setAttempt((a) => a + 1)} />}
      {status === 'ok' && promos.length === 0 && (
        <EmptyBlock title="No promo codes yet" subtitle="Create your first discount code to start driving bookings." />
      )}
      {status === 'ok' && promos.length > 0 && (
        <TableShell head={['Code', 'Discount', 'Uses', 'Window', 'Status', 'Actions']}>
          {promos.map((p) => {
            const s = promoState(p);
            return (
              <tr key={p.id}>
                <Cell>
                  <div className="font-heading text-[13px] font-bold uppercase tracking-[0.5px]" style={{ color: '#FFFFFF' }}>
                    {p.code}
                  </div>
                  {p.description && <div className="mt-0.5 text-[11px]" style={{ color: '#6B6C80' }}>{p.description}</div>}
                </Cell>
                <Cell>
                  <span className="font-semibold" style={{ color: '#5DE0B1' }}>{p.discount_percent}% off</span>
                </Cell>
                <Cell>
                  <span style={{ color: '#A7A8B5' }}>{p.uses}{p.max_uses !== null ? ` / ${p.max_uses}` : ''}</span>
                </Cell>
                <Cell>
                  <div className="text-[12.5px]" style={{ color: '#A7A8B5' }}>
                    {formatDate(p.starts_at)}
                    {p.ends_at ? ` → ${formatDate(p.ends_at)}` : ''}
                  </div>
                </Cell>
                <Cell>
                  <Badge label={s.label} bg={s.bg} color={s.color} />
                </Cell>
                <Cell>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => toggleActive(p)}
                      title={p.active ? 'Pause' : 'Activate'}
                      className="flex h-8 w-8 items-center justify-center rounded-[8px]"
                      style={{ background: 'rgba(255,255,255,0.05)', color: p.active ? '#3ECF8E' : '#A7A8B5' }}
                    >
                      <Power size={14} strokeWidth={2.2} />
                    </button>
                    <button
                      onClick={() => openEdit(p)}
                      title="Edit"
                      className="flex h-8 w-8 items-center justify-center rounded-[8px]"
                      style={{ background: 'rgba(255,255,255,0.05)', color: '#A7A8B5' }}
                    >
                      <Pencil size={14} strokeWidth={2.2} />
                    </button>
                    <button
                      onClick={() => remove(p)}
                      title="Delete"
                      className="flex h-8 w-8 items-center justify-center rounded-[8px]"
                      style={{ background: 'rgba(255,90,46,0.08)', color: '#FF5A2E' }}
                    >
                      <Trash2 size={14} strokeWidth={2.2} />
                    </button>
                  </div>
                </Cell>
              </tr>
            );
          })}
        </TableShell>
      )}

      <p className="mt-5 text-[12px]" style={{ color: '#6B6C80' }}>
        {usable.length} promo{usable.length === 1 ? '' : 's'} currently usable. Discounts apply to ticket prices only — service fees are never discounted.
      </p>
    </AdminShell>
  );
}