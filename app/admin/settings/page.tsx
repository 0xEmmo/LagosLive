'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck, Mail, BadgeCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import AdminShell from '@/components/admin-shell';
import { PageHeader, LoadingBlock, ErrorBlock, TableShell, Cell, usePermissionGuard, Badge } from '@/components/ui/dashboard-ui';
import { fetchAllProfiles, updateProfileRole, updateProfileStatus, type HostProfile } from '@/lib/admin-queries';
import { ROLE_LABEL, ADMIN_ROLES, type Role } from '@/lib/authz';
import { useLagosLiveStore } from '@/lib/store';

const ACCOUNT_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  active: { label: 'Active', bg: 'rgba(0,245,212,0.08)', color: '#00F5D4' },
  suspended: { label: 'Suspended', bg: 'rgba(255,138,0,0.08)', color: '#FF8A00' },
  banned: { label: 'Banned', bg: 'rgba(255,45,149,0.1)', color: '#FF2D95' },
};

export default function AdminSettingsPage() {
  const { user, ready } = usePermissionGuard('settings.view');
  const router = useRouter();
  const showToast = useLagosLiveStore((s) => s.showToast);
  const [profiles, setProfiles] = useState<HostProfile[]>([]);
  const [status, setStatus] = useState<'loading' | 'error' | 'ok'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!ready) return;
    setStatus('loading');
    fetchAllProfiles()
      .then((p) => {
        setProfiles(p);
        setStatus('ok');
      })
      .catch(() => setStatus('error'));
  }, [ready, attempt]);

  const changeRole = async (p: HostProfile, role: string) => {
    if (p.id === user?.id && role !== p.role) {
      showToast("Can't change your own role", 'Ask another admin to change yours.');
      return;
    }
    const prev = profiles;
    setProfiles((ps) => ps.map((x) => (x.id === p.id ? { ...x, role } : x)));
    try {
      await updateProfileRole(p.id, role);
      showToast('Role updated', `${p.name} is now ${ROLE_LABEL[role as Role] ?? role}.`);
    } catch {
      setProfiles(prev);
      showToast('Something went wrong', "Couldn't update the role.");
    }
  };

  const toggleStatus = async (p: HostProfile) => {
    const next = p.account_status === 'suspended' ? 'active' : 'suspended';
    if (p.id === user?.id) {
      showToast("Can't suspend yourself", 'Have another admin do this.');
      return;
    }
    if (next === 'suspended' && !confirm(`Suspend ${p.name}?`)) return;
    const prev = profiles;
    setProfiles((ps) => ps.map((x) => (x.id === p.id ? { ...x, account_status: next } : x)));
    try {
      await updateProfileStatus(p.id, next);
      showToast(next === 'suspended' ? 'Account suspended' : 'Account reinstated', p.name);
    } catch {
      setProfiles(prev);
      showToast('Something went wrong', "Couldn't update the account.");
    }
  };

  if (!ready || !user) return null;

  const team = profiles.filter((p) => ADMIN_ROLES.includes(p.role as Role));

  return (
    <AdminShell>
      <div className="mx-auto max-w-[980px] p-5">
        <PageHeader title="Settings" subtitle="Team roles and account control" />

        {status === 'loading' ? (
          <LoadingBlock />
        ) : status === 'error' ? (
          <ErrorBlock message="Couldn't load settings." onRetry={() => setAttempt((a) => a + 1)} />
        ) : (
          <div className="flex flex-col gap-6">
            <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="mb-4 flex items-center gap-2">
                <ShieldCheck size={16} color="#FF2D95" />
                <div className="text-[13px] font-bold" style={{ color: '#FFFFFF' }}>Team Roles</div>
              </div>
              <p className="mb-4 text-[12.5px]" style={{ color: '#A7A8B5' }}>
                Assign roles to control what each person can see and do on the platform. Roles: Super Admin, Admin, Finance, Support, Organizer, Viewer.
              </p>

              <div className="overflow-hidden rounded-xl" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                      {['Name', 'Email', 'Role', 'Status', 'Actions'].map((h) => (
                        <th key={h} className="px-4 py-3 text-[10.5px] font-bold uppercase tracking-[1px]" style={{ color: '#6B6C80', whiteSpace: 'nowrap' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {team.map((p) => {
                      const ab = ACCOUNT_BADGE[p.account_status] ?? ACCOUNT_BADGE.active;
                      const self = p.id === user.id;
                      return (
                        <tr key={p.id} className="w-full">
                          <Cell>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold" style={{ color: '#FFFFFF' }}>{p.name}</span>
                              {self && <BadgeCheck size={14} color="#00F5D4" />}
                              {self && <span className="text-[10px] text-[#6B6C80]">(you)</span>}
                            </div>
                          </Cell>
                          <Cell>
                            <span className="flex items-center gap-1.5"><Mail size={12} color="#6B6C80" />{p.email}</span>
                          </Cell>
                          <Cell>
                            <select
                              value={p.role}
                              onChange={(e) => changeRole(p, e.target.value)}
                              className="rounded-lg px-2 py-1 text-[12px] font-semibold outline-none"
                              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#00F5D4' }}
                            >
                              {(['super_admin', 'admin', 'finance', 'support', 'organizer', 'viewer'] as Role[]).map((r) => (
                                <option key={r} value={r} style={{ background: '#14151A', color: '#D5D6E0' }}>
                                  {ROLE_LABEL[r]}
                                </option>
                              ))}
                            </select>
                          </Cell>
                          <Cell>
                            <Badge label={ab.label} bg={ab.bg} color={ab.color} />
                          </Cell>
                          <Cell>
                            <button
                              onClick={() => toggleStatus(p)}
                              disabled={self}
                              className="rounded-lg px-3 py-1.5 text-[11.5px] font-semibold disabled:opacity-40"
                              style={{ background: 'rgba(255,138,0,0.1)', border: '1px solid rgba(255,138,0,0.25)', color: '#FF8A00' }}
                            >
                              {p.account_status === 'suspended' ? 'Reinstate' : 'Suspend'}
                            </button>
                          </Cell>
                        </tr>
                      );
                    })}
                    {team.length === 0 && (
                      <tr>
                        <td colSpan={5} className="border-t px-4 py-4 text-[12.5px]" style={{ borderColor: 'rgba(255,255,255,0.05)', color: '#A7A8B5' }}>
                          No team members yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
