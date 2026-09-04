'use client';

import { useEffect, useMemo, useState } from 'react';
import { Ban, RotateCcw, Search } from 'lucide-react';
import AdminShell from '@/components/admin-shell';
import { PageHeader, LoadingBlock, ErrorBlock, EmptyBlock, TableShell, Cell, Badge, useRoleGuard } from '@/components/ui/dashboard-ui';
import { fetchAllProfiles, updateProfileStatus, logAudit, type HostProfile } from '@/lib/admin-queries';
import { ACCOUNT_STATUS_LABEL, ACCOUNT_STATUS_COLOR, type AccountStatus } from '@/lib/authz';
import { useLagosLiveStore } from '@/lib/store';

export default function AdminUsersPage() {
  const { ready } = useRoleGuard('support');
  const showToast = useLagosLiveStore((s) => s.showToast);
  const [profiles, setProfiles] = useState<HostProfile[]>([]);
  const [status, setStatus] = useState<'loading' | 'error' | 'ok'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');

  const load = async () => {
    setStatus('loading');
    try {
      const data = await fetchAllProfiles();
      setProfiles(data);
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

  const users = useMemo(() => {
    const q = query.trim().toLowerCase();
    return profiles
      .filter((p) => p.role === 'viewer' || p.role === 'organizer')
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q));
  }, [profiles, query]);

  const toggle = async (p: HostProfile) => {
    const next: AccountStatus = p.account_status === 'active' ? 'suspended' : 'active';
    if (next === 'suspended' && !confirm(`Suspend ${p.name}? They will no longer be able to use the platform.`)) return;
    const prev = { ...p };
    setProfiles((ps) => ps.map((x) => (x.id === p.id ? { ...x, account_status: next } : x)));
    try {
      await updateProfileStatus(p.id, next);
      await logAudit(next === 'active' ? 'user_reinstate' : 'user_suspend', 'host', p.id, { name: p.name });
      showToast(next === 'active' ? 'User reinstated' : 'User suspended', `${p.name} updated.`);
    } catch {
      setProfiles((ps) => ps.map((x) => (x.id === p.id ? prev : x)));
      showToast('Something went wrong', "Couldn't update the account status.");
    }
  };

  if (!ready) return null;

  return (
    <AdminShell>
      <div className="mx-auto max-w-[980px] p-5">
        <PageHeader title="Users" subtitle="Guests and registered users" />

        <div className="mb-4 flex items-center gap-2 rounded-xl px-3.5 py-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <Search size={14} strokeWidth={2} color="#6B6C80" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full bg-transparent text-[13px] outline-none"
            style={{ color: '#FFFFFF' }}
          />
        </div>

        {status === 'loading' ? (
          <LoadingBlock />
        ) : status === 'error' ? (
          <ErrorBlock message="Couldn't load users." onRetry={() => setAttempt((a) => a + 1)} />
        ) : users.length === 0 ? (
          <EmptyBlock title="No users" subtitle="No users match your search." />
        ) : (
          <TableShell head={['Name', 'Email', 'Status', 'Joined', '']}>
            {users.map((p) => {
              const st = ACCOUNT_STATUS_COLOR[(p.account_status as AccountStatus) ?? 'active'] ?? ACCOUNT_STATUS_COLOR.active;
              return (
                <tr key={p.id} className="transition-colors hover:bg-white/[0.02]">
                  <Cell><span className="font-semibold" style={{ color: '#FFFFFF' }}>{p.name}</span></Cell>
                  <Cell>{p.email}</Cell>
                  <Cell>
                    <Badge
                      label={ACCOUNT_STATUS_LABEL[(p.account_status as AccountStatus) ?? 'active'] ?? 'Active'}
                      bg={st.bg}
                      color={st.color}
                    />
                  </Cell>
                  <Cell>{new Date(p.created_at).toLocaleDateString()}</Cell>
                  <Cell align="right">
                    {p.account_status === 'active' ? (
                      <button
                        onClick={() => toggle(p)}
                        className="inline-flex items-center gap-1.5 rounded-[9px] border px-2.5 py-1.5 text-[11.5px] font-semibold"
                        style={{ background: 'rgba(255,138,0,0.08)', borderColor: 'rgba(255,138,0,0.3)', color: '#FF8A00' }}
                      >
                        <Ban size={12} /> Suspend
                      </button>
                    ) : (
                      <button
                        onClick={() => toggle(p)}
                        className="inline-flex items-center gap-1.5 rounded-[9px] border px-2.5 py-1.5 text-[11.5px] font-semibold"
                        style={{ background: 'rgba(0,245,212,0.08)', borderColor: 'rgba(0,245,212,0.3)', color: '#00F5D4' }}
                      >
                        <RotateCcw size={12} /> Reinstate
                      </button>
                    )}
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
