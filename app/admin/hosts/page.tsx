'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Ban, RotateCcw, Search, Eye } from 'lucide-react';
import AdminShell from '@/components/admin-shell';
import { PageHeader, LoadingBlock, ErrorBlock, EmptyBlock, TableShell, Cell, Badge, useRoleGuard } from '@/components/ui/dashboard-ui';
import { fetchAllProfiles, fetchPayouts, updateProfileStatus, type HostProfile, type PayoutRow } from '@/lib/admin-queries';
import { ROLE_LABEL, ACCOUNT_STATUS_LABEL, ACCOUNT_STATUS_COLOR, HOST_VERIFICATION_LABEL, HOST_VERIFICATION_COLOR, type Role, type AccountStatus, type HostVerification } from '@/lib/authz';
import { useLagosLiveStore } from '@/lib/store';
import { toCsv, downloadCsv } from '@/lib/admin-queries';

const HOST_ROLES: Role[] = ['organizer', 'admin', 'super_admin', 'finance', 'support'];

type StatusFilter = 'all' | 'active' | 'suspended' | 'flagged' | 'banned';

export default function AdminHostsPage() {
  const { ready } = useRoleGuard('admin');
  const showToast = useLagosLiveStore((s) => s.showToast);
  const [profiles, setProfiles] = useState<HostProfile[]>([]);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [status, setStatus] = useState<'loading' | 'error' | 'ok'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const load = async () => {
    setStatus('loading');
    try {
      const [p, payoutData] = await Promise.all([fetchAllProfiles(), fetchPayouts()]);
      setProfiles(p);
      setPayouts(payoutData);
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

  const hostPayoutMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of payouts) {
      if (p.status === 'paid') {
        map[p.organizer_id] = (map[p.organizer_id] ?? 0) + p.amount;
      }
    }
    return map;
  }, [payouts]);

  const hosts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return profiles
      .filter((p) => HOST_ROLES.includes(p.role as Role))
      .filter((p) => statusFilter === 'all' || p.account_status === statusFilter)
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q));
  }, [profiles, query, statusFilter]);

  const toggle = async (p: HostProfile) => {
    const next: AccountStatus = p.account_status === 'active' ? 'suspended' : 'active';
    if (next === 'suspended' && !confirm(`Suspend ${p.name}? They won't be able to manage events.`)) return;
    const prev = { ...p };
    setProfiles((ps) => ps.map((x) => (x.id === p.id ? { ...x, account_status: next } : x)));
    try {
      await updateProfileStatus(p.id, next);
      showToast(next === 'active' ? 'Host reinstated' : 'Host suspended', `${p.name} updated.`);
    } catch {
      setProfiles((ps) => ps.map((x) => (x.id === p.id ? prev : x)));
      showToast('Something went wrong', "Couldn't update the account status.");
    }
  };

  const exportCsv = () => {
    const csv = toCsv(
      hosts.map((h) => ({
        Name: h.name,
        Email: h.email,
        Role: ROLE_LABEL[h.role as Role] ?? h.role,
        Status: h.account_status,
        Joined: new Date(h.created_at).toLocaleDateString(),
        'Paid Out': (hostPayoutMap[h.id] ?? 0) / 100,
      })),
      ['Name', 'Email', 'Role', 'Status', 'Joined', 'Paid Out']
    );
    downloadCsv(`hosts-export-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    showToast('Export complete', `${hosts.length} hosts exported.`);
  };

  if (!ready) return null;

  return (
    <AdminShell>
      <div className="mx-auto max-w-[980px] p-5">
        <PageHeader
          title="Hosts"
          subtitle="Organizers and staff accounts"
          right={
            <button
              onClick={exportCsv}
              className="flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-[12.5px] font-semibold"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#A7A8B5' }}
            >
              Export CSV
            </button>
          }
        />

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-xl px-3.5 py-2.5 min-w-[200px]" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <Search size={14} strokeWidth={2} color="#6B6C80" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or email..."
              className="w-full bg-transparent text-[13px] outline-none"
              style={{ color: '#FFFFFF' }}
            />
          </div>
          <div className="flex gap-1.5">
            {(['all', 'active', 'suspended'] as StatusFilter[]).map((f) => {
              const active = statusFilter === f;
              return (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className="rounded-full px-3 py-1.5 text-[11px] font-semibold capitalize transition-colors"
                  style={
                    active
                      ? { background: 'rgba(255,45,149,0.16)', border: '1px solid rgba(255,45,149,0.4)', color: '#FF2D95' }
                      : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#A7A8B5' }
                  }
                >
                  {f}
                </button>
              );
            })}
          </div>
        </div>

        {status === 'loading' ? (
          <LoadingBlock />
        ) : status === 'error' ? (
          <ErrorBlock message="Couldn't load hosts." onRetry={() => setAttempt((a) => a + 1)} />
        ) : hosts.length === 0 ? (
          <EmptyBlock title="No hosts" subtitle="No hosts match your search." />
        ) : (
          <TableShell head={['Name', 'Email', 'Role', 'Status', 'Verification', 'Joined', 'Paid Out', '']}>
            {hosts.map((p) => {
              const st = ACCOUNT_STATUS_COLOR[(p.account_status as AccountStatus) ?? 'active'] ?? ACCOUNT_STATUS_COLOR.active;
              const v = p.host_verification_status as HostVerification ?? 'unverified';
              const vs = HOST_VERIFICATION_COLOR[v];
              const paid = hostPayoutMap[p.id] ?? 0;
              return (
                <tr key={p.id} className="transition-colors hover:bg-white/[0.02]">
                  <Cell><span className="font-semibold" style={{ color: '#FFFFFF' }}>{p.name}</span></Cell>
                  <Cell>{p.email}</Cell>
                  <Cell>{ROLE_LABEL[p.role as Role] ?? p.role}</Cell>
                  <Cell>
                    <Badge
                      label={ACCOUNT_STATUS_LABEL[(p.account_status as AccountStatus) ?? 'active'] ?? 'Active'}
                      bg={st.bg}
                      color={st.color}
                    />
                  </Cell>
                  <Cell>
                    <Badge label={HOST_VERIFICATION_LABEL[v]} bg={vs.bg} color={vs.color} />
                  </Cell>
                  <Cell>{new Date(p.created_at).toLocaleDateString()}</Cell>
                  <Cell>{paid > 0 ? `₦${(paid / 100).toLocaleString()}` : '—'}</Cell>
                  <Cell align="right">
                    <div className="flex items-center gap-1.5 justify-end">
                      <Link
                        href={`/admin/hosts/${p.id}`}
                        className="inline-flex items-center gap-1 rounded-[9px] border px-2 py-1.5 text-[11px] font-semibold"
                        style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.1)', color: '#A7A8B5' }}
                      >
                        <Eye size={11} /> View
                      </Link>
                      {p.account_status === 'active' ? (
                        <button
                          onClick={() => toggle(p)}
                          className="inline-flex items-center gap-1 rounded-[9px] border px-2 py-1.5 text-[11px] font-semibold"
                          style={{ background: 'rgba(255,138,0,0.08)', borderColor: 'rgba(255,138,0,0.3)', color: '#FF8A00' }}
                        >
                          <Ban size={11} /> Suspend
                        </button>
                      ) : (
                        <button
                          onClick={() => toggle(p)}
                          className="inline-flex items-center gap-1 rounded-[9px] border px-2 py-1.5 text-[11px] font-semibold"
                          style={{ background: 'rgba(0,245,212,0.08)', borderColor: 'rgba(0,245,212,0.3)', color: '#00F5D4' }}
                        >
                          <RotateCcw size={11} /> Reinstate
                        </button>
                      )}
                    </div>
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
