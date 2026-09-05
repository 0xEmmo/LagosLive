// Admin & host dashboard data access. Uses the user-scoped client so every
// read/write is subject to RLS (roles decide what a caller can see or change).
// These are safe to call from client components. Nothing here trusts a client
// to move money — refund/status transitions that affect payment state stay
// service-role and are enforced by RS functions / API routes.

import { supabase } from './supabase/client';
import type { Database } from './supabase/database.types';

type OrderRow = Database['public']['Tables']['orders']['Row'];
type ProfileRow = Database['public']['Tables']['profiles']['Row'];
export type PayoutRow = Database['public']['Tables']['payouts']['Row'];
export type AuditRow = Database['public']['Tables']['audit_logs']['Row'];
export type TicketRow = Database['public']['Tables']['support_tickets']['Row'];
export type NoteRow = Database['public']['Tables']['admin_notes']['Row'];

// canned_responses + faqs are defined in migration 00014; explicit interfaces
// so we don't depend on regenerated DB types.
export interface CannedRow {
  id: number;
  label: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface FaqRow {
  id: number;
  question: string;
  answer: string;
  created_at: string;
  updated_at: string;
}

export interface AdminOrderJoined extends OrderRow {
  parties?: {
    id: number;
    title: string;
    date: string;
    time: string;
    created_by: string | null;
    status: string;
  } | null;
  ticket_types?: { name: string } | null;
}

export interface OverviewMetrics {
  totalEvents: number;
  pendingEvents: number;
  totalHosts: number;
  totalRevenue: number;
  totalTicketsSold: number;
  upcomingEvents: number;
  recentOrders: number;
}

export async function fetchOverviewMetrics(): Promise<OverviewMetrics> {
  const [parties, orders, hosts] = await Promise.all([
    supabase.from('parties').select('id, status, starts_at'),
    supabase.from('orders').select('party_id, quantity, total, payment_status'),
    supabase.from('profiles').select('id').in('role', ['organizer', 'admin', 'super_admin', 'finance', 'support']),
  ]);
  if (parties.error) throw parties.error;
  if (orders.error) throw orders.error;
  if (hosts.error) throw hosts.error;

  const now = Date.now();
  const partyRows = parties.data ?? [];
  const orderRows = orders.data ?? [];

  let totalRevenue = 0;
  let totalTicketsSold = 0;
  for (const o of orderRows) {
    if (o.payment_status === 'confirmed') {
      totalRevenue += o.total;
      totalTicketsSold += o.quantity;
    }
  }

  return {
    totalEvents: partyRows.filter((p) => p.status === 'approved').length,
    pendingEvents: partyRows.filter((p) => p.status === 'pending').length,
    totalHosts: hosts.data?.length ?? 0,
    totalRevenue,
    totalTicketsSold,
    upcomingEvents: partyRows.filter((p) => new Date(p.starts_at).getTime() > now).length,
    recentOrders: orderRows.length,
  };
}

export interface AdminEventJoined {
  id: number;
  title: string;
  date: string;
  time: string;
  status: string;
  flagged: boolean;
  organizer: string;
  created_by: string | null;
  capacity: number;
  spots_left: number;
  starts_at: string;
  description: string;
  location: string;
  vibe: string;
  fee_num: number;
}

const EVENT_SELECT =
  'id, title, date, time, status, flagged, organizer, created_by, capacity, spots_left, starts_at, description, location, vibe, fee_num';

export async function fetchAdminEvents(filters?: {
  status?: string;
}): Promise<AdminEventJoined[]> {
  let query = supabase.from('parties').select(EVENT_SELECT).order('starts_at', { ascending: false });
  if (filters?.status) query = query.eq('status', filters.status);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as AdminEventJoined[];
}

export async function fetchAdminEvent(id: number): Promise<AdminEventJoined | null> {
  const { data, error } = await supabase.from('parties').select(EVENT_SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as AdminEventJoined) ?? null;
}

export async function fetchEventOrders(partyId: number): Promise<AdminOrderJoined[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*, parties(id, title, date, time, created_by, status), ticket_types(name)')
    .eq('party_id', partyId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as AdminOrderJoined[];
}

export async function fetchAllOrders(filters?: {
  partyId?: number;
  paymentStatus?: string;
}): Promise<AdminOrderJoined[]> {
  let query = supabase
    .from('orders')
    .select('*, parties(id, title, date, time, created_by, status), ticket_types(name)')
    .order('created_at', { ascending: false });
  if (filters?.partyId) query = query.eq('party_id', filters.partyId);
  if (filters?.paymentStatus) query = query.eq('payment_status', filters.paymentStatus);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as AdminOrderJoined[];
}

export async function fetchOrderById(orderId: string): Promise<AdminOrderJoined | null> {
  const { data, error } = await supabase
    .from('orders')
    .select('*, parties(id, title, date, time, created_by, status), ticket_types(name)')
    .eq('id', orderId)
    .maybeSingle();
  if (error) throw error;
  return (data as AdminOrderJoined) ?? null;
}

// ---- Hosts / profiles ------------------------------------------------------

export interface HostProfile extends ProfileRow {
  parties_count?: number;
}

export async function fetchAllProfiles(): Promise<HostProfile[]> {
  const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as HostProfile[];
}

export async function updateProfileStatus(userId: string, accountStatus: string): Promise<void> {
  const { error } = await supabase.from('profiles').update({ account_status: accountStatus }).eq('id', userId);
  if (error) throw error;
}

export async function updateProfileRole(userId: string, role: string): Promise<void> {
  const { error } = await supabase.from('profiles').update({ role }).eq('id', userId);
  if (error) throw error;
}

/** Promote or demote a user's role through the staff-gated API (audit-logged). */
export async function setUserRole(targetUserId: string, role: string): Promise<void> {
  const res = await fetch('/api/admin/operations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'set_role', targetUserId, role }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
}

// ---- Check-in ---------------------------------------------------------------

export async function setOrderCheckIn(orderId: string, checkedIn: boolean): Promise<void> {
  const patch = checkedIn
    ? { check_in_status: 'checked_in', checked_in_at: new Date().toISOString() }
    : { check_in_status: 'unchecked', checked_in_at: null };
  const { error } = await supabase.from('orders').update(patch).eq('id', orderId);
  if (error) throw error;
}

// ---- Payouts ----------------------------------------------------------------

export async function fetchPayouts(filters?: { status?: string }): Promise<PayoutRow[]> {
  let query = supabase.from('payouts').select('*').order('created_at', { ascending: false });
  if (filters?.status) query = query.eq('status', filters.status);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as PayoutRow[];
}

export async function updatePayoutStatus(payoutId: number, status: string): Promise<void> {
  const patch: Database['public']['Tables']['payouts']['Update'] = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === 'paid') patch.paid_at = new Date().toISOString();
  const { error } = await supabase.from('payouts').update(patch).eq('id', payoutId);
  if (error) throw error;
}

// ---- Audit logs -------------------------------------------------------------

export async function fetchAuditLogs(): Promise<AuditRow[]> {
  const { data, error } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as AuditRow[];
}

// Best-effort audit trail. Routes through the staff-gated /api/admin/operations
// endpoint which records the action (with the acting user) via write_audit_log.
// Never throws — the underlying admin action must not fail if logging is down.
export async function logAudit(
  action: string,
  targetType: string,
  targetId: string | number | null,
  details?: Record<string, unknown>
): Promise<void> {
  try {
    await fetch('/api/admin/operations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'audit', logAction: action, targetType, targetId: String(targetId ?? ''), details }),
    });
  } catch (err) {
    console.error('[audit] failed to log', action, err);
  }
}

// ---- Support tickets --------------------------------------------------------

export async function fetchSupportTickets(): Promise<TicketRow[]> {
  const { data, error } = await supabase.from('support_tickets').select('*').order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as TicketRow[];
}

export async function updateSupportTicket(
  ticketId: number,
  patch: { status?: string; priority?: string; assignee_id?: string | null }
): Promise<void> {
  const { error } = await supabase
    .from('support_tickets')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', ticketId);
  if (error) throw error;
}

// ---- Admin notes ------------------------------------------------------------

export async function fetchAdminNotes(targetType: string, targetId: string): Promise<NoteRow[]> {
  const { data, error } = await supabase
    .from('admin_notes')
    .select('*')
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as NoteRow[];
}

export async function createAdminNote(targetType: string, targetId: string, body: string): Promise<void> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error('Not authenticated');
  const { error } = await supabase
    .from('admin_notes')
    .insert({ author_id: authData.user.id, target_type: targetType, target_id: targetId, body });
  if (error) throw error;
}

export async function deleteAdminNote(noteId: number): Promise<void> {
  const { error } = await supabase.from('admin_notes').delete().eq('id', noteId);
  if (error) throw error;
}

// ---- Chart data helpers -----------------------------------------------------

function buildDailyRevenueSeries(days: number, orders: { created_at: string; total: number; payment_status: string }[]): { label: string; value: number }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets = new Map<string, { key: string; label: string; value: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000);
    buckets.set(d.toDateString(), {
      key: d.toDateString(),
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      value: 0,
    });
  }
  for (const row of orders) {
    if (row.payment_status !== 'confirmed') continue;
    const b = buckets.get(new Date(row.created_at).toDateString());
    if (b) b.value += row.total;
  }
  return [...buckets.values()];
}

export async function fetchRevenueTrend(): Promise<{ label: string; value: number }[]> {
  const { data, error } = await supabase.from('orders').select('created_at, total, payment_status');
  if (error) throw error;
  return buildDailyRevenueSeries(30, data ?? []);
}

export async function fetchEventsByCategory(): Promise<{ label: string; value: number }[]> {
  const { data, error } = await supabase.from('parties').select('vibe, status');
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const p of data ?? []) {
    if (p.status !== 'approved') continue;
    counts[p.vibe] = (counts[p.vibe] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

export async function fetchOrdersByStatus(): Promise<{ label: string; value: number }[]> {
  const { data, error } = await supabase.from('orders').select('payment_status');
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const o of data ?? []) {
    counts[o.payment_status] = (counts[o.payment_status] || 0) + 1;
  }
  return Object.entries(counts).map(([label, value]) => ({ label, value }));
}

export async function fetchRecentOrders(): Promise<AdminOrderJoined[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*, parties(id, title, date, time, created_by, status), ticket_types(name)')
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw error;
  return (data ?? []) as AdminOrderJoined[];
}

// ---- Host detail ------------------------------------------------------------

export interface HostDetail extends HostProfile {
  events?: { id: number; title: string; status: string; starts_at: string; capacity: number; spots_left: number }[];
  totalEventsCount: number;
  totalRevenue: number;
  totalPayouts: number;
}

export async function fetchHostDetail(userId: string): Promise<HostDetail | null> {
  const [profileRes, eventsRes, ordersRes, payoutsRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
    supabase.from('parties').select('id, title, status, starts_at, capacity, spots_left').eq('created_by', userId).order('starts_at', { ascending: false }),
    supabase.from('orders').select('party_id, total, payment_status').eq('party_id', 0).limit(0),
    supabase.from('payouts').select('*').eq('organizer_id', userId).order('created_at', { ascending: false }),
  ]);

  const events = (eventsRes.data ?? []) as HostDetail['events'];
  const eventIds = (events ?? []).map((e) => e.id);

  let ordersData: { party_id: number; total: number; payment_status: string }[] = [];
  if (eventIds.length > 0) {
    const { data } = await supabase.from('orders').select('party_id, total, payment_status').in('party_id', eventIds);
    ordersData = data ?? [];
  }
  void ordersRes;

  if (profileRes.error) throw profileRes.error;

  const profile = profileRes.data as HostProfile;
  const totalRevenue = ordersData.filter((o) => o.payment_status === 'confirmed').reduce((s, o) => s + o.total, 0);
  const payouts = (payoutsRes.data ?? []) as PayoutRow[];
  const totalPayouts = payouts.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0);

  return {
    ...profile,
    events,
    totalEventsCount: events?.length ?? 0,
    totalRevenue,
    totalPayouts,
  };
}

// ---- Host orders (for a specific organizer) ---------------------------------

export async function fetchHostOrders(userId: string): Promise<AdminOrderJoined[]> {
  const { data: events, error: eventsError } = await supabase.from('parties').select('id').eq('created_by', userId);
  if (eventsError) throw eventsError;
  const eventIds = (events ?? []).map((e) => e.id);
  if (eventIds.length === 0) return [];
  const { data, error } = await supabase
    .from('orders')
    .select('*, parties(id, title, date, time, created_by, status), ticket_types(name)')
    .in('party_id', eventIds)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as AdminOrderJoined[];
}

// ---- Host profile update (self-service) -------------------------------------

export async function updateHostProfile(userId: string, patch: {
  name?: string;
  phone?: string | null;
  bio?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('profiles').update(patch as Database['public']['Tables']['profiles']['Update']).eq('id', userId);
  if (error) throw error;
}

// ---- Flag event (admin) -----------------------------------------------------

export async function flagEvent(id: number, flagged: boolean): Promise<void> {
  const { error } = await supabase.from('parties').update({ flagged }).eq('id', id);
  if (error) throw error;
}

export async function updateEventNotes(id: number, adminNotes: string): Promise<void> {
  const { error } = await supabase.from('parties').update({ admin_notes: adminNotes }).eq('id', id);
  if (error) throw error;
}

// ---- Support messages --------------------------------------------------------

export type SupportMessageRow = Database['public']['Tables']['support_messages']['Row'];

export async function fetchSupportMessages(ticketId: number): Promise<SupportMessageRow[]> {
  const { data, error } = await supabase
    .from('support_messages')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as SupportMessageRow[];
}

export async function createSupportMessage(ticketId: number, body: string, isInternal = false): Promise<void> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error('Not authenticated');
  const { error } = await supabase
    .from('support_messages')
    .insert({ ticket_id: ticketId, author_id: authData.user.id, body, is_internal: isInternal });
  if (error) throw error;
  // Update ticket updated_at
  await supabase.from('support_tickets').update({ updated_at: new Date().toISOString() }).eq('id', ticketId);
}

// ---- Support settings (canned responses + FAQs) ----------------------------

export async function fetchCannedResponses(): Promise<CannedRow[]> {
  const { data, error } = await supabase.from('canned_responses').select('*').order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CannedRow[];
}

export async function fetchFaqs(): Promise<FaqRow[]> {
  const { data, error } = await supabase.from('faqs').select('*').order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as FaqRow[];
}

export async function upsertCannedResponses(items: { id?: number; label: string; body: string }[]): Promise<void> {
  const rows = items
    .filter((c) => c.label.trim() && c.body.trim())
    .map((c) => ({
      ...(c.id ? { id: c.id } : {}),
      label: c.label.trim(),
      body: c.body.trim(),
      updated_at: new Date().toISOString(),
    }));
  if (rows.length === 0) return;
  const { error } = await supabase.from('canned_responses').upsert(rows);
  if (error) throw error;
}

export async function upsertFaqs(items: { id?: number; question: string; answer: string }[]): Promise<void> {
  const rows = items
    .filter((f) => f.question.trim() && f.answer.trim())
    .map((f) => ({
      ...(f.id ? { id: f.id } : {}),
      question: f.question.trim(),
      answer: f.answer.trim(),
      updated_at: new Date().toISOString(),
    }));
  if (rows.length === 0) return;
  const { error } = await supabase.from('faqs').upsert(rows);
  if (error) throw error;
}

// ---- Host analytics ---------------------------------------------------------

export interface HostAnalyticsSummary {
  totalRevenue: number;
  totalTicketsSold: number;
  totalOrders: number;
  avgOrderValue: number;
  eventsCount: number;
  pendingOrders: number;
  failedOrders: number;
}

export async function fetchHostAnalytics(userId: string): Promise<HostAnalyticsSummary> {
  const { data: events, error: eventsError } = await supabase
    .from('parties')
    .select('id')
    .eq('created_by', userId);
  if (eventsError) throw eventsError;
  const eventIds = (events ?? []).map((e) => e.id);
  if (eventIds.length === 0) {
    return { totalRevenue: 0, totalTicketsSold: 0, totalOrders: 0, avgOrderValue: 0, eventsCount: 0, pendingOrders: 0, failedOrders: 0 };
  }
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('quantity, total, payment_status')
    .in('party_id', eventIds);
  if (ordersError) throw ordersError;

  let totalRevenue = 0;
  let totalTicketsSold = 0;
  let totalConfirmed = 0;
  let pendingOrders = 0;
  let failedOrders = 0;
  for (const o of orders ?? []) {
    if (o.payment_status === 'confirmed') {
      totalRevenue += o.total;
      totalTicketsSold += o.quantity;
      totalConfirmed += 1;
    } else if (o.payment_status === 'pending') {
      pendingOrders += 1;
    } else if (o.payment_status === 'failed') {
      failedOrders += 1;
    }
  }
  return {
    totalRevenue,
    totalTicketsSold,
    totalOrders: (orders ?? []).length,
    avgOrderValue: totalConfirmed > 0 ? totalRevenue / totalConfirmed : 0,
    eventsCount: eventIds.length,
    pendingOrders,
    failedOrders,
  };
}

export async function fetchHostRevenueTrend(userId: string, days: number): Promise<{ label: string; value: number }[]> {
  const { data: events } = await supabase.from('parties').select('id').eq('created_by', userId);
  const eventIds = (events ?? []).map((e) => e.id);
  if (eventIds.length === 0) return buildDailyRevenueSeries(days, []);
  const { data } = await supabase
    .from('orders')
    .select('created_at, total, payment_status')
    .in('party_id', eventIds);
  return buildDailyRevenueSeries(days, data ?? []);
}

export async function fetchHostEventsByCategory(userId: string): Promise<{ label: string; value: number }[]> {
  const { data } = await supabase.from('parties').select('vibe, status').eq('created_by', userId);
  const counts: Record<string, number> = {};
  for (const p of data ?? []) {
    if (p.status !== 'approved') continue;
    counts[p.vibe] = (counts[p.vibe] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

// ---- Payout request (host self-service) ------------------------------------

export async function requestPayout(
  organizerId: string,
  amount: number,
  periodStart: string,
  periodEnd: string,
  revenue: number,
  platformFee: number,
  bankLast4: string | null
): Promise<void> {
  // Routed through the server endpoint so verification/role/amount are
  // enforced outside of RLS and the request is audit-logged.
  const res = await fetch('/api/payouts/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, periodStart, periodEnd, revenue, platformFee, bankLast4 }),
  });
  const body = await res.json().catch(() => ({ error: 'Something went wrong. Please try again.' }));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
}

// ---- Analytics time range ---------------------------------------------------

export function filterOrdersByDays(orders: AdminOrderJoined[], days: number): AdminOrderJoined[] {
  if (days <= 0) return orders;
  const cutoff = Date.now() - days * 86400000;
  return orders.filter((o) => new Date(o.created_at).getTime() >= cutoff);
}

// ---- Export helpers ----------------------------------------------------------

export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const header = columns.join(',');
  const lines = rows.map((row) =>
    columns.map((col) => {
      const val = row[col];
      const str = val === null || val === undefined ? '' : String(val);
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    }).join(',')
  );
  return [header, ...lines].join('\n');
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---- Reviews moderation (Phase 5) ---------------------------------------------

export type ReviewRow = Database['public']['Tables']['reviews']['Row'] & {
  parties?: { id: number; title: string } | null;
};

export type ReviewModStatus = 'visible' | 'hidden' | 'removed';

export async function fetchAllReviews(): Promise<ReviewRow[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select('*, parties(id, title)')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as ReviewRow[];
}

export async function moderateReview(reviewId: string, status: ReviewModStatus, reason: string): Promise<void> {
  const { error } = await supabase.rpc('moderate_review', {
    p_review_id: reviewId,
    p_status: status,
    p_reason: reason || null,
  });
  if (error) {
    const message = error.message || 'moderation failed';
    // Surface the human-readable RPC rejection for reasons that can be fixed.
    throw new Error(message.includes('Reason') ? message : `Couldn't ${status} this review.`);
  }
}
