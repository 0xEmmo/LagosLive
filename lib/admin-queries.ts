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
