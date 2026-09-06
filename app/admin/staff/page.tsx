'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, ShieldCheck, Trash2, X, Pencil, Save, Check } from 'lucide-react';
import AdminShell from '@/components/admin-shell';
import {
  PageHeader,
  LoadingBlock,
  ErrorBlock,
  TableShell,
  Cell,
  Badge,
  usePermissionGuard,
} from '@/components/ui/dashboard-ui';
import {
  fetchProfilesWithRoles,
  fetchAllRoles,
  fetchAllPermissions,
  setUserRoles,
  createCustomRole,
  setRolePermissions,
  type ProfileWithRoles,
  type RoleJoined,
  type PermissionRow,
} from '@/lib/admin-queries';
import {
  ROLE_COLOR,
  ROLE_DESCRIPTIONS,
  PERMISSION_GROUPS,
  PERMISSIONS,
  SENSITIVE_PERMISSIONS,
} from '@/lib/rbac';
import { useLagosLiveStore } from '@/lib/store';

type Tab = 'staff' | 'roles';

export default function AdminStaffPage() {
  const { ready } = usePermissionGuard('staff.view');
  const canManagePermissions = usePermissionGuard('staff.permissions').allowed;
  const showToast = useLagosLiveStore((s) => s.showToast);

  const [tab, setTab] = useState<Tab>('staff');
  const [profiles, setProfiles] = useState<ProfileWithRoles[]>([]);
  const [roles, setRoles] = useState<RoleJoined[]>([]);
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);
  const [status, setStatus] = useState<'loading' | 'error' | 'ok'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const [p, r, perms] = await Promise.all([fetchProfilesWithRoles(), fetchAllRoles(), fetchAllPermissions()]);
      setProfiles(p);
      setRoles(r);
      setPermissions(perms);
      setStatus('ok');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    load();
  }, [ready, attempt, load]);

  const allRoleIds = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of roles) m.set(r.name, r.id);
    return m;
  }, [roles]);

  const assignRoles = async (profileId: string, roleIds: string[]) => {
    setBusyId(profileId);
    try {
      await setUserRoles(profileId, roleIds);
      await load();
      showToast('Roles updated', 'Role assignment saved and audit-logged.');
    } catch (e) {
      showToast('Error', e instanceof Error ? e.message : 'Could not update roles.');
    } finally {
      setBusyId(null);
    }
  };

  const addRole = (profile: ProfileWithRoles, roleId: string) => {
    const current = profile.user_roles?.map((x) => x.role_id) ?? [];
    if (!current.includes(roleId)) assignRoles(profile.id, [...current, roleId]);
  };

  const removeRole = (profile: ProfileWithRoles, roleId: string, roleName: string) => {
    if (['super_admin', 'admin', 'finance', 'support', 'organizer', 'viewer'].includes(roleName)) {
      showToast('Protected', 'Built-in roles are managed on the Roles page.');
      return;
    }
    const current = profile.user_roles?.map((x) => x.role_id) ?? [];
    assignRoles(profile.id, current.filter((id) => id !== roleId));
  };

  const staff = useMemo(() => {
    const q = query.trim().toLowerCase();
    return profiles.filter(
      (p) => !q || p.name?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q)
    );
  }, [profiles, query]);

  if (!ready) return null;

  return (
    <AdminShell>
      <div className="mx-auto max-w-[1020px] p-5">
        <PageHeader title="Staff Management" subtitle="Assign roles composed from atomic permissions. Every change is audit-logged." />

        {/* Tabs */}
        <div className="mb-5 flex gap-1 rounded-xl p-1" style={{ background: 'rgba(255,255,255,0.04)' }}>
          {(['staff', 'roles'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 rounded-[10px] px-4 py-2 text-[12.5px] font-semibold capitalize transition-colors"
              style={
                tab === t
                  ? { background: 'rgba(255,45,149,0.14)', color: '#FF2D95' }
                  : { color: '#A7A8B5' }
              }
            >
              {t === 'staff' ? 'Staff' : 'Roles & Permissions'}
            </button>
          ))}
        </div>

        {tab === 'staff' ? (
          <StaffTab
            staff={staff}
            roles={roles}
            query={query}
            onQuery={setQuery}
            onAddRole={addRole}
            onRemoveRole={removeRole}
            busyId={busyId}
          />
        ) : (
          <RolesTab
            roles={roles}
            permissions={permissions}
            showToast={showToast}
            reload={load}
            canManage={canManagePermissions}
          />
        )}

        {status === 'error' && (
          <div className="mt-4">
            <ErrorBlock message="Couldn't load staff data." onRetry={() => setAttempt((a) => a + 1)} />
          </div>
        )}
      </div>
    </AdminShell>
  );
}

function StaffTab({
  staff,
  roles,
  query,
  onQuery,
  onAddRole,
  onRemoveRole,
  busyId,
}: {
  staff: ProfileWithRoles[];
  roles: RoleJoined[];
  query: string;
  onQuery: (q: string) => void;
  onAddRole: (p: ProfileWithRoles, roleId: string) => void;
  onRemoveRole: (p: ProfileWithRoles, roleId: string, roleName: string) => void;
  busyId: string | null;
}) {
  return (
    <div>
      <div className="mb-4 flex items-center gap-2 rounded-[12px] px-3.5 py-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <Search size={15} strokeWidth={2} style={{ color: '#6B6C80' }} />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search staff by name or email…"
          className="w-full bg-transparent text-[13px] outline-none"
          style={{ color: '#FFFFFF' }}
        />
      </div>

      {staff.length === 0 ? (
        <div className="rounded-2xl px-6 py-14 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="font-display text-[20px]" style={{ color: '#FFFFFF' }}>No staff match</div>
        </div>
      ) : (
        <TableShell head={['Name', 'Email', 'Roles & Permissions', 'Add Role']}>
          {staff.map((p) => {
            const current = p.user_roles ?? [];
            const available = roles.filter(
              (r) => r.name !== 'super_admin' && !current.some((x) => x.role_id === r.id)
            );
            return (
              <tr key={p.id} className="transition-colors hover:bg-white/[0.02]">
                <Cell>
                  <span className="font-semibold" style={{ color: '#FFFFFF' }}>{p.name ?? '—'}</span>
                </Cell>
                <Cell>{p.email ?? '—'}</Cell>
                <Cell>
                  {current.length === 0 ? (
                    <span className="text-[12px]" style={{ color: '#6B6C80' }}>No roles</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {current.map((x) => {
                        const name = x.roles?.name ?? 'unknown';
                        const color = ROLE_COLOR[name] ?? ROLE_COLOR.viewer;
                        const builtin = ['super_admin', 'admin', 'finance', 'support', 'organizer', 'viewer'].includes(name);
                        return (
                          <span
                            key={x.role_id}
                            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-semibold"
                            style={{ background: color.bg, color: color.color }}
                          >
                            {name}
                            {!builtin && busyId !== p.id && (
                              <button
                                onClick={() => onRemoveRole(p, x.role_id, name)}
                                className="transition-opacity hover:opacity-70"
                                aria-label={`Remove ${name} role`}
                              >
                                <X size={11} strokeWidth={2.5} />
                              </button>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </Cell>
                <Cell>
                  <select
                    value=""
                    disabled={busyId === p.id || available.length === 0}
                    onChange={(e) => e.target.value && onAddRole(p, e.target.value)}
                    className="rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold outline-none transition-colors disabled:opacity-50"
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      borderColor: 'rgba(255,255,255,0.12)',
                      color: '#D5D6E0',
                    }}
                  >
                    <option value="">
                      {busyId === p.id ? 'Saving…' : available.length === 0 ? 'All roles assigned' : 'Add role…'}
                    </option>
                    {available.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                        {r.permission_names ? ` (${r.permission_names.length} perms)` : ''}
                      </option>
                    ))}
                  </select>
                </Cell>
              </tr>
            );
          })}
        </TableShell>
      )}
    </div>
  );
}

function RolesTab({
  roles,
  permissions,
  showToast,
  reload,
  canManage,
}: {
  roles: RoleJoined[];
  permissions: PermissionRow[];
  showToast: (title: string, subtitle: string) => void;
  reload: () => Promise<void>;
  canManage: boolean;
}) {
  const [newRole, setNewRole] = useState<{ name: string; description: string; perms: Set<string> }>({
    name: '',
    description: '',
    perms: new Set(),
  });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<{ role: RoleJoined; perms: Set<string> } | null>(null);
  const [saving, setSaving] = useState(false);

  const togglePerm = (set: Set<string>, perm: string) => {
    const next = new Set(set);
    if (next.has(perm)) next.delete(perm);
    else next.add(perm);
    return next;
  };

  const handleCreate = async () => {
    const name = newRole.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!name) {
      showToast('Name required', 'Give the role a name.');
      return;
    }
    setCreating(true);
    try {
      const id = await createCustomRole(name, newRole.description.trim());
      if (newRole.perms.size > 0) await setRolePermissions(id, [...newRole.perms]);
      await reload();
      setNewRole({ name: '', description: '', perms: new Set() });
      showToast('Role created', `"${name}" is ready to assign.`);
    } catch (e) {
      showToast('Error', e instanceof Error ? e.message : 'Could not create role.');
    } finally {
      setCreating(false);
    }
  };

  const handleSavePerms = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await setRolePermissions(editing.role.id, [...editing.perms]);
      await reload();
      setEditing(null);
      showToast('Permissions saved', `${editing.role.name} updated.`);
    } catch (e) {
      showToast('Error', e instanceof Error ? e.message : 'Could not update permissions.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {permissions.length > 0 && (
        <div className="text-[12px]" style={{ color: '#6B6C80' }}>
          {permissions.length} atomic permissions across {roles.length} roles.
        </div>
      )}

      {roles.map((role) => {
        const isSuper = role.name === 'super_admin';
        const isEditing = editing?.role.id === role.id;
        const perms = isEditing ? editing.perms : new Set(role.permission_names ?? []);
        const color = ROLE_COLOR[role.name] ?? ROLE_COLOR.viewer;
        return (
          <div key={role.id} className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <Badge label={role.name} bg={color.bg} color={color.color} />
                <span className="text-[12px]" style={{ color: '#6B6C80' }}>
                  {role.is_builtin
                    ? ROLE_DESCRIPTIONS[role.name] ?? 'Built-in role'
                    : role.description || 'Custom role'}
                  {typeof role.member_count === 'number' && role.member_count > 0 && ` · ${role.member_count} member${role.member_count === 1 ? '' : 's'}`}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {canManage && !isSuper && !role.is_builtin && (
                  <button
                    onClick={() =>
                      setEditing(isEditing ? null : { role, perms: new Set(role.permission_names ?? []) })
                    }
                    disabled={creating || saving}
                    className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors disabled:opacity-50"
                    style={{ borderColor: 'rgba(255,255,255,0.12)', color: role.is_builtin ? '#6B6C80' : '#A7A8B5' }}
                  >
                    {isEditing ? <X size={12} /> : <Pencil size={12} />}
                    {isEditing ? 'Cancel' : 'Edit permissions'}
                  </button>
                )}
                {isEditing && canManage && (
                  <button
                    onClick={handleSavePerms}
                    disabled={saving}
                    className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors disabled:opacity-50"
                    style={{ background: 'rgba(0,245,212,0.1)', borderColor: 'rgba(0,245,212,0.3)', color: '#00F5D4' }}
                  >
                    <Save size={12} /> {saving ? 'Saving…' : 'Save'}
                  </button>
                )}
              </div>
            </div>

            {isEditing ? (
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {PERMISSION_GROUPS.map((group) => (
                  <div key={group.label} className="rounded-xl p-3" style={{ background: 'rgba(0,0,0,0.18)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.8px]" style={{ color: '#6B6C80' }}>{group.label}</div>
                    <div className="flex flex-col gap-1">
                      {group.permissions.map((p) => (
                        <label key={p} className="flex cursor-pointer items-center gap-2 text-[11.5px]" style={{ color: '#C9CAD7' }}>
                          <input
                            type="checkbox"
                            checked={perms.has(p)}
                            onChange={() => setEditing((e) => (e ? { ...e, perms: togglePerm(e.perms, p) } : e))}
                            className="h-3.5 w-3.5 accent-[#FF2D95]"
                          />
                          <span className="font-mono text-[10.5px]">{p}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : perms.size > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {[...perms].sort().map((p) => (
                  <span
                    key={p}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[10.5px]"
                    style={{
                      background: SENSITIVE_PERMISSIONS.has(p as never) ? 'rgba(255,138,0,0.1)' : 'rgba(255,255,255,0.05)',
                      color: SENSITIVE_PERMISSIONS.has(p as never) ? '#FF8A00' : '#A7A8B5',
                    }}
                  >
                    {SENSITIVE_PERMISSIONS.has(p as never) && <ShieldCheck size={10} strokeWidth={2.5} />}
                    {p}
                  </span>
                ))}
              </div>
            ) : (
              <div className="text-[12px]" style={{ color: '#6B6C80' }}>No permissions assigned.</div>
            )}
          </div>
        );
      })}

      {/* Create custom role */}
      {canManage && (
        <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,45,149,0.2)' }}>
          <div className="mb-3 flex items-center gap-2">
            <Plus size={14} color="#FF2D95" />
            <span className="text-[13px] font-bold" style={{ color: '#FFFFFF' }}>Create Custom Role</span>
          </div>
          <div className="mb-3 grid gap-2 sm:grid-cols-2">
            <input
              value={newRole.name}
              onChange={(e) => setNewRole((s) => ({ ...s, name: e.target.value }))}
              placeholder="Role name (e.g. venue_ops)"
              className="rounded-lg border px-3 py-2 text-[12.5px] outline-none"
              style={{ background: 'rgba(0,0,0,0.2)', borderColor: 'rgba(255,255,255,0.1)', color: '#FFFFFF' }}
            />
            <input
              value={newRole.description}
              onChange={(e) => setNewRole((s) => ({ ...s, description: e.target.value }))}
              placeholder="Short description"
              className="rounded-lg border px-3 py-2 text-[12.5px] outline-none"
              style={{ background: 'rgba(0,0,0,0.2)', borderColor: 'rgba(255,255,255,0.1)', color: '#FFFFFF' }}
            />
          </div>
          <div className="mb-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {PERMISSION_GROUPS.map((group) => (
              <fieldset key={group.label} className="rounded-xl p-3" style={{ background: 'rgba(0,0,0,0.18)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <legend className="px-1 text-[10.5px] font-bold uppercase tracking-[0.8px]" style={{ color: '#6B6C80' }}>{group.label}</legend>
                <div className="flex flex-col gap-1">
                  {group.permissions.map((p) => (
                    <label key={p} className="flex cursor-pointer items-center gap-2 text-[11.5px]" style={{ color: '#C9CAD7' }}>
                      <input
                        type="checkbox"
                        checked={newRole.perms.has(p)}
                        onChange={() => setNewRole((s) => ({ ...s, perms: togglePerm(s.perms, p) }))}
                        className="h-3.5 w-3.5 accent-[#FF2D95]"
                      />
                      <span className="flex items-center gap-1.5 font-mono text-[10.5px]">
                        {SENSITIVE_PERMISSIONS.has(p as never) && <ShieldCheck size={10} strokeWidth={2.5} color="#FF8A00" />}
                        {p}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCreate}
              disabled={creating}
              className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12.5px] font-semibold disabled:opacity-50"
              style={{ background: 'rgba(255,45,149,0.14)', border: '1px solid rgba(255,45,149,0.35)', color: '#FF2D95' }}
            >
              <Check size={13} strokeWidth={2.5} />
              {creating ? 'Creating…' : `Create role (${newRole.perms.size} permissions)`}
            </button>
            <span className="text-[11px]" style={{ color: '#6B6C80' }}>
              Sensitive permissions are highlighted in orange.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}