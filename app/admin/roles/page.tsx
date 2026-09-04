'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import AdminShell from '@/components/admin-shell';
import { PageHeader, LoadingBlock, ErrorBlock, EmptyBlock, TableShell, Cell, Badge, useRoleGuard } from '@/components/ui/dashboard-ui';
import { fetchAllProfiles, setUserRole, type HostProfile } from '@/lib/admin-queries';
import { ROLE_LABEL, type Role } from '@/lib/authz';
import { useLagosLiveStore } from '@/lib/store';

const ASSIGNABLE: Role[] = ['viewer', 'organizer', 'support', 'finance', 'admin'];

const ROLE_COLOR: Record<Role, { bg: string; color: string }> = {
  viewer: { bg: 'rgba(255,255,255,0.06)', color: '#A7A8B5' },
  organizer: { bg: 'rgba(0,245,212,0.08)', color: '#00F5D4' },
  support: { bg: 'rgba(255,138,0,0.08)', color: '#FF8A00' },
  finance: { bg: 'rgba(255,214,0,0.1)', color: '#FFD600' },
  admin: { bg: 'rgba(255,45,149,0.12)', color: '#FF2D95' },
  super_admin: { bg: 'rgba(138,43,226,0.14)', color: '#8A2BE2' },
};

export default function AdminRolesPage() {
  const { ready, user } = useRoleGuard('admin');
  const showToast = useLagosLiveStore((s) => s.showToast);
  const currentUserId = user?.id;
  const [profiles, setProfiles] = useState<HostProfile[]>([]);
  const [status, setStatus] = useState<'loading' | 'error' | 'ok'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

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

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (profiles ?? []).filter(
      (p) =>
        !q ||
        p.name?.toLowerCase().includes(q) ||
        p.email?.toLowerCase().includes(q) ||
        ROLE_LABEL[p.role as Role]?.toLowerCase().includes(q)
    );
  }, [profiles, query]);

  const changeRole = async (target: HostProfile, role: Role) => {
    if (role === target.role) return;
    if (target.role === 'super_admin') {
      showToast('Protected', 'The platform owner role cannot be changed.');
      return;
    }
    if (['admin', 'super_admin'].includes(role as Role) && target.id === currentUserId) {
      const ok = confirm(`Change your own role to ${ROLE_LABEL[role]}? You could lose admin access.`);
      if (!ok) return;
    }
    setBusyId(target.id);
    try {
      await setUserRole(target.id, role);
      await load();
      showToast('Role updated', `${target.name ?? 'User'} is now ${ROLE_LABEL[role]}.`);
    } catch (e) {
      showToast('Error', e instanceof Error ? e.message : 'Could not update role.');
    } finally {
      setBusyId(null);
    }
  };

  if (!ready) return null;

  return (
    <AdminShell>
      <PageHeader title="Role Management" subtitle="Promote users to admins or staff, and manage every profile's role. Changes are audit-logged." />

      <div className="mb-4 flex items-center gap-2 rounded-[12px] px-3.5 py-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <Search size={15} strokeWidth={2} style={{ color: '#6B6C80' }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, email, or role…"
          className="w-full bg-transparent text-[13px] outline-none"
          style={{ color: '#FFFFFF' }}
        />
      </div>

      {status === 'loading' && <LoadingBlock />}
      {status === 'error' && <ErrorBlock onRetry={() => setAttempt((a) => a + 1)} />}
      {status === 'ok' && rows.length === 0 && <EmptyBlock title="No profiles match" subtitle="Try adjusting your search." />}
      {status === 'ok' && rows.length > 0 && (
        <TableShell head={['User', 'Email', 'Current Role', 'New Role']}>
          {rows.map((p) => {
            const isSuper = p.role === 'super_admin';
            const color = ROLE_COLOR[p.role as Role] ?? ROLE_COLOR.viewer;
            return (
              <tr key={p.id}>
                <Cell>
                  <div className="flex flex-col">
                    <span className="font-semibold" style={{ color: '#FFFFFF' }}>
                      {p.name ?? '—'}
                      {p.id === currentUserId && (
                        <span className="ml-2 text-[10.5px] text-[#A7A8B5] italic">(you)</span>
                      )}
                    </span>
                  </div>
                </Cell>
                <Cell>{p.email ?? '—'}</Cell>
                <Cell>
                  <Badge label={ROLE_LABEL[p.role as Role] ?? p.role} bg={color.bg} color={color.color} />
                </Cell>
                <Cell>
                  {isSuper ? (
                    <span className="text-[12px]" style={{ color: '#6B6C80' }}>Owner — locked</span>
                  ) : (
                    <select
                      value={p.role}
                      disabled={busyId === p.id}
                      onChange={(e) => changeRole(p, e.target.value as Role)}
                      className="rounded-lg border px-2.5 py-1.5 text-[12.5px] font-semibold outline-none transition-colors disabled:opacity-50"
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        borderColor: 'rgba(255,255,255,0.12)',
                        color: '#D5D6E0',
                      }}
                    >
                      {ASSIGNABLE.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  )}
                </Cell>
              </tr>
            );
          })}
        </TableShell>
      )}
    </AdminShell>
  );
}