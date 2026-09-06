// Permission-based role model. Mirrors the server-side RBAC migration
// (00024_rbac_permission_layer.sql): roles are COMPOSED from atomic
// permissions, and `user_has_permission()` is the single source of truth.
//
// These constants are used for:
//   * gating frontend navigation / buttons (client UX only)
//   * building the staff-management UI (role composition catalogue)
//   * keeping the TypeScript model in sync with the SQL catalogue
//
// They are NOT a security boundary — every privileged read/write is also
// enforced by Supabase RLS via user_has_permission() / check_permission().

export const RESOURCES = [
  'events',
  'tickets',
  'attendees',
  'orders',
  'hosts',
  'revenue',
  'payouts',
  'transactions',
  'finance',
  'analytics',
  'staff',
  'settings',
  'audit',
  'support',
  'promos',
  'newsletter',
  'reviews',
] as const;
export type Resource = (typeof RESOURCES)[number];

// ---- Permission catalogue ---------------------------------------------------

export const PERMISSIONS = {
  // EVENTS
  'events.view': 'View event listings',
  'events.create': 'Create new events',
  'events.edit': 'Edit any event',
  'events.delete': 'Delete events',
  'events.approve': 'Approve submitted events',
  'events.reject': 'Reject events',
  'events.cancel': 'Cancel live events and refund guests',
  // TICKETS
  'tickets.view': 'See ticket data',
  'tickets.create': 'Create ticket types',
  'tickets.edit': 'Modify ticket types',
  'tickets.manage_inventory': 'Adjust ticket inventory',
  // ATTENDEES
  'attendees.view': 'See guest lists',
  'attendees.checkin': 'Scan QR codes (check in)',
  'attendees.export': 'Download attendee data',
  'attendees.contact': 'Email guests',
  // ORDERS
  'orders.view': 'See order listings',
  'orders.refund': 'Issue refunds',
  'orders.cancel': 'Cancel orders',
  'orders.resend_ticket': 'Resend ticket email',
  // HOSTS
  'hosts.view': 'See host profiles',
  'hosts.verify': 'Approve or reject host verification',
  'hosts.suspend': 'Suspend or ban hosts',
  'hosts.edit': 'Modify host information',
  // REVENUE & FINANCE
  'revenue.view': 'See revenue dashboards',
  'payouts.view': 'See payout data',
  'payouts.approve': 'Approve payout requests',
  'payouts.process': 'Mark payouts as paid',
  'transactions.view': 'See payment records',
  'transactions.refund': 'Issue refunds via Paystack',
  'finance.export': 'Export financial reports',
  // ANALYTICS
  'analytics.view': 'See platform analytics',
  'analytics.events': 'See event performance data',
  'analytics.revenue': 'See revenue analytics',
  'analytics.export': 'Export analytics reports',
  // STAFF MANAGEMENT
  'staff.view': 'See staff list',
  'staff.create': 'Invite staff',
  'staff.edit': 'Modify staff',
  'staff.permissions': 'Assign permissions to staff',
  'staff.suspend': 'Remove staff access',
  // PLATFORM
  'settings.view': 'See platform settings',
  'settings.edit': 'Modify settings',
  'audit.view': 'See audit logs',
  'support.view': 'See support area',
  'support.reply': 'Reply to support tickets',
  // PROMO / MARKETING
  'promos.view': 'See discount codes',
  'promos.create': 'Create promo codes',
  'promos.edit': 'Modify promos',
  'promos.delete': 'Remove promos',
  // NEWSLETTER
  'newsletter.view': 'See newsletter subscriber lists',
  'newsletter.manage': 'Create and send email campaigns',
  // REVIEWS
  'reviews.view': 'See all event reviews',
  'reviews.moderate': 'Hide or remove reviews',
} as const;

export type Permission = keyof typeof PERMISSIONS;
export type PermissionName = string;

// Permissions that touch money, personal data, or platform integrity. Anyone
// exercising them must be captured in the audit trail.
export const SENSITIVE_PERMISSIONS: ReadonlySet<Permission> = new Set([
  'events.cancel',
  'attendees.export',
  'orders.refund',
  'hosts.suspend',
  'revenue.view',
  'payouts.view',
  'payouts.approve',
  'payouts.process',
  'transactions.view',
  'transactions.refund',
  'finance.export',
  'analytics.revenue',
  'staff.permissions',
  'staff.suspend',
  'settings.edit',
  'audit.view',
  'newsletter.manage',
  'reviews.view',
  'reviews.moderate',
]);

// ---- Roles composed from permissions ----------------------------------------

export const ROLE_COLOR: Record<string, { bg: string; color: string }> = {
  super_admin: { bg: 'rgba(138,43,226,0.14)', color: '#8A2BE2' },
  admin: { bg: 'rgba(255,45,149,0.12)', color: '#FF2D95' },
  finance: { bg: 'rgba(255,214,0,0.1)', color: '#FFD600' },
  support: { bg: 'rgba(255,138,0,0.08)', color: '#FF8A00' },
  organizer: { bg: 'rgba(0,245,212,0.08)', color: '#00F5D4' },
  viewer: { bg: 'rgba(255,255,255,0.06)', color: '#A7A8B5' },
  event_manager: { bg: 'rgba(0,191,255,0.1)', color: '#00BFFF' },
  scanner: { bg: 'rgba(176,106,255,0.1)', color: '#B06AFF' },
  content: { bg: 'rgba(255,214,0,0.08)', color: '#FFD600' },
  marketing: { bg: 'rgba(0,245,212,0.1)', color: '#00F5D4' },
  analyst: { bg: 'rgba(255,255,255,0.07)', color: '#D5D6E0' },
};

export const ROLE_DESCRIPTIONS: Record<string, string> = {
  super_admin: 'Full platform access',
  admin: 'Operations and moderation (no revenue or finance)',
  finance: 'Revenue, payouts and financial reporting only',
  support: 'Customer support and ticket lookup',
  organizer: 'Host and manage their own events',
  viewer: 'Browse events and buy tickets',
  event_manager: 'Operate their own events (check-in, inventory)',
  scanner: 'QR check-in only',
  content: 'Event listing content and drafts',
  marketing: 'Promos and event analytics',
  analyst: 'Read-only analytics and audit',
};

export const SENSITIVE_ROLES: ReadonlySet<string> = new Set([
  'super_admin',
  'admin',
  'finance',
]);

// Built-in role -> permission set. Must match the SQL seeds in migration 00024.
export const ROLE_PERMISSIONS: Record<string, readonly Permission[]> = {
  super_admin: [...Object.keys(PERMISSIONS)] as Permission[],

  admin: [
    'events.view', 'events.create', 'events.edit', 'events.delete', 'events.approve', 'events.reject', 'events.cancel',
    'tickets.view',
    'attendees.view', 'attendees.contact',
    'orders.view', 'orders.cancel',
    'hosts.view', 'hosts.verify', 'hosts.suspend',
    'staff.view', 'staff.create', 'staff.edit', 'staff.permissions', 'staff.suspend',
    'audit.view',
    'support.view', 'support.reply',
    'settings.view',
    'newsletter.view',
    'reviews.view', 'reviews.moderate',
  ],

  finance: [
    'orders.view',
    'payouts.view', 'payouts.approve', 'payouts.process',
    'transactions.view', 'transactions.refund',
    'revenue.view',
    'analytics.revenue',
    'finance.export',
  ],

  support: [
    'orders.view', 'orders.resend_ticket',
    'attendees.view', 'attendees.contact',
    'hosts.view',
    'support.view', 'support.reply',
    'newsletter.view',
    'reviews.view', 'reviews.moderate',
  ],

  event_manager: [
    'events.view',
    'tickets.view', 'tickets.manage_inventory',
    'attendees.checkin', 'attendees.export',
    'analytics.events',
  ],

  scanner: ['events.view', 'attendees.checkin'],

  content: ['events.view', 'events.create'],

  marketing: [
    'events.view',
    'promos.view', 'promos.create', 'promos.edit', 'promos.delete',
    'analytics.view', 'analytics.events',
    'newsletter.view', 'newsletter.manage',
    'reviews.view',
  ],

  analyst: [
    'events.view',
    'tickets.view',
    'attendees.view',
    'orders.view',
    'analytics.view', 'analytics.events', 'analytics.revenue',
    'audit.view',
  ],

  organizer: [
    'events.view', 'events.create',
    'tickets.view', 'tickets.create', 'tickets.edit', 'tickets.manage_inventory',
    'attendees.checkin', 'attendees.export',
    'analytics.events',
  ],

  viewer: ['events.view', 'tickets.view'],
};

export function roleHasPermission(role: string | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  if (role === 'super_admin') return true;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function rolePermissions(role: string | null | undefined): Permission[] {
  if (!role) return [];
  if (role === 'super_admin') return [...Object.keys(PERMISSIONS)] as Permission[];
  return [...(ROLE_PERMISSIONS[role] ?? [])];
}

/** Human grouping of the permission catalogue for the staff UI. */
export const PERMISSION_GROUPS: { label: string; permissions: Permission[] }[] = [
  { label: 'Events', permissions: ['events.view', 'events.create', 'events.edit', 'events.delete', 'events.approve', 'events.reject', 'events.cancel'] },
  { label: 'Tickets', permissions: ['tickets.view', 'tickets.create', 'tickets.edit', 'tickets.manage_inventory'] },
  { label: 'Attendees', permissions: ['attendees.view', 'attendees.checkin', 'attendees.export', 'attendees.contact'] },
  { label: 'Orders', permissions: ['orders.view', 'orders.refund', 'orders.cancel', 'orders.resend_ticket'] },
  { label: 'Hosts', permissions: ['hosts.view', 'hosts.verify', 'hosts.suspend', 'hosts.edit'] },
  { label: 'Revenue & Finance', permissions: ['revenue.view', 'payouts.view', 'payouts.approve', 'payouts.process', 'transactions.view', 'transactions.refund', 'finance.export'] },
  { label: 'Analytics', permissions: ['analytics.view', 'analytics.events', 'analytics.revenue', 'analytics.export'] },
  { label: 'Staff Management', permissions: ['staff.view', 'staff.create', 'staff.edit', 'staff.permissions', 'staff.suspend'] },
  { label: 'Platform', permissions: ['settings.view', 'settings.edit', 'audit.view', 'support.view', 'support.reply'] },
  { label: 'Promo / Marketing', permissions: ['promos.view', 'promos.create', 'promos.edit', 'promos.delete'] },
  { label: 'Newsletter', permissions: ['newsletter.view', 'newsletter.manage'] },
  { label: 'Reviews', permissions: ['reviews.view', 'reviews.moderate'] },
];