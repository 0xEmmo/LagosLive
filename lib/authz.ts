// Client-safe role authorization helpers. Mirrors the server-side role model
// (profiles.role) so UI components can gate what they render without a server
// round-trip. These are NOT a security boundary by themselves — all privileged
// reads/writes are additionally enforced by Supabase RLS and the API routes
// that call the service client.

export type Role = 'viewer' | 'organizer' | 'support' | 'finance' | 'admin' | 'super_admin';
export type AccountStatus = 'active' | 'suspended' | 'flagged' | 'banned';

export const STAFF_ROLES: Role[] = ['support', 'finance', 'admin', 'super_admin'];
export const ADMIN_ROLES: Role[] = ['admin', 'super_admin'];

export function isStaff(role?: Role | null): boolean {
  return !!role && STAFF_ROLES.includes(role);
}

export function isAdmin(role?: Role | null): boolean {
  return !!role && ADMIN_ROLES.includes(role);
}

export function isFinance(role?: Role | null): boolean {
  return !!(role && (role === 'finance' || isAdmin(role)));
}

export function isOrganizer(role?: Role | null): boolean {
  return !!role && (role === 'organizer' || isStaff(role));
}

export const ROLE_LABEL: Record<Role, string> = {
  viewer: 'Viewer',
  organizer: 'Organizer',
  support: 'Support',
  finance: 'Finance',
  admin: 'Admin',
  super_admin: 'Super Admin',
};

export const ACCOUNT_STATUS_LABEL: Record<AccountStatus, string> = {
  active: 'Active',
  suspended: 'Suspended',
  flagged: 'Flagged',
  banned: 'Banned',
};

export const ACCOUNT_STATUS_COLOR: Record<AccountStatus, { bg: string; color: string }> = {
  active: { bg: 'rgba(0,245,212,0.08)', color: '#00F5D4' },
  suspended: { bg: 'rgba(255,138,0,0.08)', color: '#FF8A00' },
  flagged: { bg: 'rgba(255,214,0,0.1)', color: '#FFD600' },
  banned: { bg: 'rgba(255,45,149,0.12)', color: '#FF2D95' },
};
