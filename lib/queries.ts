import { supabase } from './supabase/client';
import type { Database } from './supabase/database.types';
import type { CustomerTicket, Party, PartyStatus, Review, TicketType, Vibe } from './types';
import { formatNaira } from './filters';
import { haversineKm } from './geo';

type PartyRow = Database['public']['Tables']['parties']['Row'];
type PartyInsert = Database['public']['Tables']['parties']['Insert'];
type OrderRow = Database['public']['Tables']['orders']['Row'] & { parties?: PartyRow | null; ticket_types?: { name: string } | null };

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
// Central Lagos (Victoria Island) — used only as a one-time fallback distance
// for organizer-submitted parties when the viewer hasn't granted geolocation;
// once a real userLocation is available, toParty() always recomputes from it.
const LAGOS_CENTER = { lat: 6.4281, lng: 3.4219 };

// DB rows are snake_case; the rest of the app already speaks the camelCase
// Party shape from lib/types.ts, so this is the one place that translates.
// `userLocation`, when available, overrides the seeded `distance` column with
// a real haversine distance from the user's current position to the venue.
function toParty(row: PartyRow, userLocation?: { lat: number; lng: number } | null): Party {
  const startsAt = new Date(row.starts_at);
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    time: row.time,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    location: row.location,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    fee: row.fee,
    feeNum: row.fee_num,
    distance: userLocation ? haversineKm(userLocation.lat, userLocation.lng, row.lat, row.lng) : row.distance,
    vibe: row.vibe as Vibe,
    capacity: row.capacity,
    spotsLeft: row.spots_left,
    ageRestriction: row.age_restriction,
    dressCode: row.dress_code,
    organizer: row.organizer,
    instagram: row.instagram,
    whatsapp: row.whatsapp,
    organizerPhone: row.organizer_phone ?? null,
    organizerEmail: row.organizer_email ?? null,
    description: row.description,
    gradient: row.gradient,
    isWeekend: row.is_weekend ?? false,
    isThisWeek: startsAt.getTime() - Date.now() < ONE_WEEK_MS && startsAt.getTime() > Date.now() - 24 * 60 * 60 * 1000,
    createdBy: row.created_by,
    status: row.status as PartyStatus,
    coverUrl: row.cover_url ?? null,
    cancelledAt: row.cancelled_at ?? null,
    cancellationReason: row.cancellation_reason ?? null,
    reviewReason: row.review_reason ?? null,
    reviewCount: row.review_count ?? 0,
    avgRating: Number(row.avg_rating ?? 0),
  };
}

export async function fetchParties(userLocation?: { lat: number; lng: number } | null): Promise<Party[]> {
  const { data, error } = await supabase.from('parties').select('*').order('id');
  if (error) throw error;
  return data.map((row) => toParty(row, userLocation));
}

export async function fetchPartyById(
  id: number,
  userLocation?: { lat: number; lng: number } | null
): Promise<Party | undefined> {
  const { data, error } = await supabase.from('parties').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? toParty(data, userLocation) : undefined;
}

export async function fetchPartiesByOwner(userId: string): Promise<Party[]> {
  const { data, error } = await supabase
    .from('parties')
    .select('*')
    .eq('created_by', userId)
    .order('starts_at', { ascending: false });
  if (error) throw error;
  return data.map((row) => toParty(row));
}

// ---------------------------------------------------------------------------
// Batch 18 — search + reviews.
// ---------------------------------------------------------------------------

export type EventSearchSort = 'trending' | 'newest' | 'price' | 'rating';

export interface EventSearchInput {
  query?: string;
  sortBy?: EventSearchSort;
}

// Simplified search (Batch 18): free-text match on title / description /
// location / organizer, restricted to non-cancelled, approved, upcoming events
// and sorted server-side. Mirrors the "smart defaults" the /explore page relies
// on — the client never has to remember filters.
export async function searchUpcomingEvents(
  input: EventSearchInput,
  userLocation?: { lat: number; lng: number } | null
): Promise<Party[]> {
  const clean = (input.query ?? '').trim().replace(/,/g, ' ');
  let query = supabase
    .from('parties')
    .select('*')
    .eq('status', 'approved')
    .is('cancelled_at', null)
    .gte('starts_at', new Date().toISOString());

  if (clean) {
    const like = `%${clean}%`;
    query = query.or(`title.ilike.${like},description.ilike.${like},location.ilike.${like},organizer.ilike.${like}`);
  }

  if (input.sortBy === 'newest') query = query.order('created_at', { ascending: false });
  else if (input.sortBy === 'price') query = query.order('fee_num', { ascending: true });
  else if (input.sortBy === 'rating') query = query.order('avg_rating', { ascending: false });
  else query = query.order('page_views', { ascending: false });

  const { data, error } = await query.limit(50);
  if (error) throw error;
  return (data ?? []).map((row) => toParty(row, userLocation));
}

// Public reviews for an event, newest first. Reviews carry a denormalised
// guest_name so no join to the profile-restricted profiles table is needed.
export async function fetchEventReviews(partyId: number): Promise<Review[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('party_id', partyId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    partyId: row.party_id,
    guestId: row.guest_id,
    guestName: row.guest_name,
    rating: row.rating,
    reviewText: row.review_text,
    createdAt: row.created_at,
  }));
}

export interface TicketFormType {
  id?: number;
  name: string;
  price: number;
  quantity: number;
  description?: string | null;
  salesStartAt?: string | null;
  salesEndAt?: string | null;
  active: boolean;
  sortOrder: number;
  sold?: number;
}

export interface PartyFormInput {
  title: string;
  startsAt: string; // ISO string from a <input type="datetime-local">
  endsAt: string;
  location: string;
  address: string;
  lat: number;
  lng: number;
  fee: string;
  feeNum: number;
  vibe: Vibe;
  capacity: number;
  ticketTypes: TicketFormType[];
  ageRestriction: string;
  dressCode: string;
  organizer: string;
  instagram: string;
  whatsapp: string;
  organizerPhone: string;
  organizerEmail: string;
  description: string;
  gradient: string;
  coverImage?: File | null;
}

function formatClock(d: Date) {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: d.getMinutes() === 0 ? undefined : '2-digit' });
}

function toRow(input: PartyFormInput, createdBy: string): PartyInsert {
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  return {
    title: input.title,
    date: startsAt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
    time: `${formatClock(startsAt)} – ${formatClock(endsAt)}`,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    location: input.location,
    address: input.address,
    lat: input.lat,
    lng: input.lng,
    fee: input.fee,
    fee_num: input.feeNum,
    distance: haversineKm(LAGOS_CENTER.lat, LAGOS_CENTER.lng, input.lat, input.lng),
    vibe: input.vibe,
    capacity: input.capacity,
    spots_left: input.capacity,
    age_restriction: input.ageRestriction,
    dress_code: input.dressCode,
    organizer: input.organizer,
    instagram: input.instagram,
    whatsapp: input.whatsapp,
    organizer_phone: input.organizerPhone.trim() || null,
    organizer_email: input.organizerEmail.trim() || null,
    description: input.description,
    gradient: input.gradient,
    cover_url: null,
    created_by: createdBy,
  };
}

export async function createParty(input: PartyFormInput, createdBy: string): Promise<{ party: Party; promoted: boolean }> {
  const { data, error } = await supabase.from('parties').insert({ ...toRow(input, createdBy), status: 'draft' }).select().single();
  if (error) throw error;
  const party = toParty(data);
  await savePartyTicketTypes(party.id, input.ticketTypes ?? [], input.feeNum === 0);
  const { data: promotedResult } = await (supabase as any).rpc('auto_promote_creator_to_organizer', {
    p_party_id: party.id,
  });
  if (input.coverImage) {
    const coverUrl = await uploadCoverImage(party.id, input.coverImage);
    if (coverUrl) {
      await supabase.from('parties').update({ cover_url: coverUrl }).eq('id', party.id);
      party.coverUrl = coverUrl;
    }
  }
  return { party, promoted: !!promotedResult };
}

async function uploadCoverImage(partyId: number, file: File): Promise<string | null> {
  try {
    const resized = await resizeImage(file, 1200);
    const ext = file.type === 'image/png' ? 'png' : 'jpg';
    const path = `events/${partyId}/cover.${ext}`;
    const { error } = await supabase.storage.from('event-images').upload(path, resized, {
      upsert: true,
      contentType: file.type,
    });
    if (error) {
      console.error('Cover upload failed:', error.message);
      return null;
    }
    const { data } = supabase.storage.from('event-images').getPublicUrl(path);
    return data?.publicUrl ?? null;
  } catch (err) {
    console.error('Cover image processing failed:', err);
    return null;
  }
}

function resizeImage(file: File, maxPx: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxPx || height > maxPx) {
        if (width > height) {
          height = Math.round((height / width) * maxPx);
          width = maxPx;
        } else {
          width = Math.round((width / height) * maxPx);
          height = maxPx;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas not supported')); return; }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('toBlob failed')), file.type, 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
    img.src = url;
  });
}

export async function updateParty(id: number, input: PartyFormInput): Promise<Party> {
  const row = toRow(input, '');
  const { spots_left, created_by, cover_url, ...updateFields } = row;
  void spots_left;
  void created_by;
  void cover_url;
  const { data, error } = await supabase.from('parties').update(updateFields).eq('id', id).select().single();
  if (error) throw error;

  // Persist the ticket tiers (creates/updates/deletes ticket_types rows and
  // never lets inventory fall below what has already been sold).
  const { capacity, feeNum } = await savePartyTicketTypes(id, input.ticketTypes ?? [], input.feeNum === 0);

  // Reconcile the party's capacity / spots_left against live reservations so
  // an edit can never put the party in an impossible state. "Reserved" is the
  // sum of pending + confirmed tickets: pending holds spots until the payment
  // window closes, confirmed holds them for the event day.
  const reserved = await sumReservedTickets(id);
  if (capacity < reserved) {
    throw new Error(
      `Capacity can't be lower than ${reserved} ticket${reserved === 1 ? '' : 's'} already reserved. Refund or cancel orders first.`
    );
  }
  const reconcile = {
    capacity,
    fee: feeNum === 0 ? 'Free' : formatNaira(feeNum),
    fee_num: feeNum,
    spots_left: capacity - reserved,
  };
  const { error: reconcileError } = await supabase.from('parties').update(reconcile).eq('id', id);
  if (reconcileError) throw reconcileError;

  if (input.coverImage) {
    const coverUrl = await uploadCoverImage(id, input.coverImage);
    if (coverUrl) {
      await supabase.from('parties').update({ cover_url: coverUrl }).eq('id', id);
    }
  }
  const updated = await fetchPartyById(id);
  return updated ?? toParty(data);
}

type TicketTypeColumn = Database['public']['Tables']['ticket_types']['Insert'];

function toTicketTypeColumn(t: TicketFormType): Omit<TicketTypeColumn, 'party_id'> {
  return {
    name: t.name.trim(),
    price: t.price,
    quantity: t.quantity,
    description: t.description?.trim() || null,
    sales_start_at: t.salesStartAt ? new Date(t.salesStartAt).toISOString() : null,
    sales_end_at: t.salesEndAt ? new Date(t.salesEndAt).toISOString() : null,
    active: t.active,
    sort_order: t.sortOrder,
  };
}

// Creates/updates/deletes the ticket tiers for an event. Free events always
// resolve to exactly one "General Entry" tier priced at 0 with the requested
// capacity; paid events persist the host's full list as-is. Rows with sold
// tickets can never be deleted or shrunk below their sold count — existing QR
// codes (orders) must keep resolving to a real, valid tier.
async function savePartyTicketTypes(partyId: number, tickets: TicketFormType[], isFree: boolean): Promise<{ capacity: number; feeNum: number }> {
  const desired: (Omit<TicketTypeColumn, 'party_id'> & { id?: number })[] = isFree
    ? [
        {
          ...toTicketTypeColumn({
            name: 'General Entry',
            price: 0,
            quantity: tickets[0]?.quantity ?? 0,
            active: true,
            sortOrder: 0,
          }),
        },
      ]
    : tickets.map((t) => ({ id: t.id, ...toTicketTypeColumn(t) }));

  const { data: existing, error: existingError } = await supabase.from('ticket_types').select('id, name, sold').eq('party_id', partyId);
  if (existingError) throw existingError;
  const existingRows = existing ?? [];
  const keptIds = new Set(desired.map((d) => d.id).filter((id): id is number => Number.isInteger(id)));

  for (const row of desired) {
    if (Number.isInteger(row.id) && existingRows.some((e) => e.id === row.id)) {
      const current = existingRows.find((e) => e.id === row.id);
      const quantity = Math.trunc(row.quantity ?? 0);
      if ((current?.sold ?? 0) > quantity) {
        throw new Error(
          `Can't lower “${row.name}” to ${quantity} — ${current?.sold} ticket${current?.sold === 1 ? '' : 's'} are already sold on this tier.`
        );
      }
      const { id, ...fields } = row;
      const { error } = await supabase.from('ticket_types').update(fields).eq('id', id as number);
      if (error) throw error;
    } else {
      const { id, ...fields } = row;
      const { error } = await supabase.from('ticket_types').insert({ ...fields, party_id: partyId });
      if (error) throw error;
    }
  }

  for (const existingRow of existingRows) {
    if (keptIds.has(existingRow.id)) continue;
    if (existingRow.sold > 0) {
      throw new Error(
        `Can't remove “${existingRow.name}” — it already has ${existingRow.sold} ticket${existingRow.sold === 1 ? '' : 's'} sold. Set it inactive instead.`
      );
    }
    const { error } = await supabase.from('ticket_types').delete().eq('id', existingRow.id);
    if (error) throw error;
  }

  const activePrices = desired.filter((d) => d.active !== false).map((d) => d.price);
  const feeNum = isFree ? 0 : activePrices.length > 0 ? Math.min(...activePrices) : Math.min(...desired.map((d) => d.price));
  const capacity = desired.reduce((sum, d) => sum + Math.trunc(d.quantity ?? 0), 0);
  return { capacity, feeNum };
}

// Live reservations for an event: pending orders hold spots until the payment
// window closes, confirmed orders hold them until the event. Matches what the
// insert/settle triggers track in parties.spots_left.
async function sumReservedTickets(partyId: number): Promise<number> {
  const { data, error } = await supabase.from('orders').select('quantity, payment_status').eq('party_id', partyId);
  if (error) throw error;
  return (data ?? []).reduce(
    (sum, o) => (o.payment_status === 'pending' || o.payment_status === 'confirmed' ? sum + o.quantity : sum),
    0
  );
}

// Buyers fetch ticket types for the checkout; RLS only returns types for
// parties the viewer can actually see (approved / organizer / admin). The list
// is ordered by the host's sort order (then id as a stable tiebreaker).
// Buyers filter down to active / on-sale tiers themselves (isTicketTypeSellable
// in lib/tickets.ts); hosts editing their event see every tier, including
// paused ones.
export async function fetchTicketTypes(partyId: number): Promise<TicketType[]> {
  const { data, error } = await supabase
    .from('ticket_types')
    .select('*')
    .eq('party_id', partyId)
    .order('sort_order')
    .order('id');
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    partyId: row.party_id,
    name: row.name,
    price: row.price,
    quantity: row.quantity,
    sold: row.sold,
    description: row.description,
    salesStartAt: row.sales_start_at,
    salesEndAt: row.sales_end_at,
    active: row.active,
    sortOrder: row.sort_order,
  }));
}

// Orders without a visible party (e.g. an event suspended after purchase) are
// deliberately dropped here — a ticket for an event the buyer can no longer
// see must not surface as a valid ticket. RLS already restricted the rows to
// ones this user can read ("users and organizers read relevant orders").
function toCustomerTicket(row: OrderRow): CustomerTicket | null {
  if (!row.parties) return null;
  return {
    id: row.id,
    partyId: row.party_id,
    party: toParty(row.parties),
    ticketTypeName: row.ticket_types?.name ?? 'General Entry',
    quantity: row.quantity,
    unitPrice: row.unit_price,
    serviceFee: row.service_fee,
    total: row.total,
    orderRef: row.order_ref,
    paymentStatus: row.payment_status as CustomerTicket['paymentStatus'],
    refundStatus: row.refund_status ?? null,
    refundAmount: row.refund_amount ?? 0,
    checkInStatus: row.check_in_status ?? null,
    checkedInAt: row.checked_in_at ?? null,
    refundedAt: row.refunded_at ?? null,
    createdAt: row.created_at,
  };
}

// The customer's tickets. Batch 6 shows confirmed tickets on /profile, so this
// only returns confirmed (paid) orders — pending/failed/cancelled orders are
// not valid tickets.
export async function fetchMyTickets(userId: string): Promise<CustomerTicket[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*, parties(*), ticket_types(name)')
    .eq('user_id', userId)
    .eq('payment_status', 'confirmed')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? [])
    .map((row) => toCustomerTicket(row as OrderRow))
    .filter((t): t is CustomerTicket => t !== null);
}

// Single ticket for /ticket/[id]. Ownership is enforced twice: the RLS policy
// only returns orders this user can read, and we additionally pin the row to
// the signed-in user's id — a caller-supplied order id alone is never trusted.
export async function fetchTicketById(orderId: string, userId: string): Promise<CustomerTicket | null> {
  const { data, error } = await supabase
    .from('orders')
    .select('*, parties(*), ticket_types(name)')
    .eq('id', orderId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ? toCustomerTicket(data as OrderRow) : null;
}

export async function deleteParty(id: number): Promise<void> {
  const { error } = await supabase.from('parties').delete().eq('id', id);
  if (error) throw error;
}

// Admin-only in practice: the "admins manage any party" RLS policy is the
// only update policy that lets a non-owner change status.
export async function updatePartyStatus(id: number, status: PartyStatus): Promise<void> {
  const { error } = await supabase.from('parties').update({ status }).eq('id', id);
  if (error) throw error;
}

// The one audited path for event status changes (Phase 3 trust). Authorized
// server-side in set_event_review_status(): hosts may submit their own
// draft/rejected event or withdraw their own pending one; admins may
// approve/reject/suspend (reject/suspend take a reason the host can see).
export async function setEventReviewStatus(id: number, status: PartyStatus, reason?: string): Promise<void> {
  const { error } = await (supabase.rpc as any)('set_event_review_status', {
    p_party_id: id,
    p_status: status,
    ...(reason ? { p_reason: reason } : {}),
  });
  if (error) throw error;
}

export function submitEventForReview(id: number): Promise<void> {
  return setEventReviewStatus(id, 'pending');
}

export function withdrawEvent(id: number): Promise<void> {
  return setEventReviewStatus(id, 'draft');
}

// Public "Verified Host" signal (Phase 3). Server side, reveals a boolean only.
export async function fetchPartyHostVerified(id: number): Promise<boolean> {
  const { data, error } = await supabase.rpc('party_host_verified', { p_party_id: id });
  if (error) throw error;
  return !!data;
}

export interface OrganizerReputation {
  completedEvents: number;
  ticketsSold: number;
  avgRating: number;
  reviewCount: number;
}

// Public organizer reputation (Phase 5): aggregate over the organizer's
// completed (ended), approved, un-cancelled events. The RPC only ever returns
// aggregate counts/ratings, never per-order or per-guest data.
export async function fetchOrganizerReputation(organizerId: string): Promise<OrganizerReputation | null> {
  const { data, error } = await supabase.rpc('organizer_reputation', { p_organizer_id: organizerId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    completedEvents: Number(row.completed_events ?? 0),
    ticketsSold: Number(row.tickets_sold ?? 0),
    avgRating: Number(row.avg_rating ?? 0),
    reviewCount: Number(row.review_count ?? 0),
  };
}

export interface OrganizerPartyStats {
  ordersCount: number; // confirmed orders
  ticketsSold: number; // tickets in confirmed orders
  revenue: number; // total of confirmed orders (includes service fee)
  pendingOrders: number;
  cancelledOrders: number;
  failedOrders: number;
}

// Relies on the "users and organizers read relevant orders" RLS policy — only
// returns orders for parties the caller owns (or their own purchases), so an
// organizer can never see another organizer's revenue. Only confirmed (paid)
// orders count toward sales and revenue; pending/failed/cancelled are counted
// separately so the dashboard can surface them without inflating revenue.
export async function fetchOrganizerOrderStats(partyIds: number[]): Promise<Record<number, OrganizerPartyStats>> {
  if (partyIds.length === 0) return {};
  const { data, error } = await supabase
    .from('orders')
    .select('party_id, quantity, total, payment_status')
    .in('party_id', partyIds);
  if (error) throw error;
  const stats: Record<number, OrganizerPartyStats> = {};
  for (const row of data) {
    const entry =
      stats[row.party_id] ??
      ({ ordersCount: 0, ticketsSold: 0, revenue: 0, pendingOrders: 0, cancelledOrders: 0, failedOrders: 0 } as OrganizerPartyStats);
    if (row.payment_status === 'confirmed') {
      entry.ordersCount += 1;
      entry.ticketsSold += row.quantity;
      entry.revenue += row.total;
    } else if (row.payment_status === 'pending') {
      entry.pendingOrders += 1;
    } else if (row.payment_status === 'cancelled') {
      entry.cancelledOrders += 1;
    } else if (row.payment_status === 'failed') {
      entry.failedOrders += 1;
    }
    stats[row.party_id] = entry;
  }
  return stats;
}

// ---------------------------------------------------------------------------
// Batch 7 — event analytics. Everything is computed server-side from DB rows
// the RLS policies already restrict to the organizer's own events; the client
// never supplies revenue or ticket numbers.
// ---------------------------------------------------------------------------

export interface TicketTypeInventory {
  id: number;
  name: string;
  price: number;
  total: number; // inventory for this type
  sold: number;
  remaining: number;
  active: boolean;
  salesStartAt: string | null;
  salesEndAt: string | null;
}

export interface SalesPoint {
  label: string; // e.g. "Aug 5"
  tickets: number;
}

export interface OrganizerEventAnalytics {
  ticketTypes: TicketTypeInventory[];
  confirmedOrders: number;
  pendingOrders: number;
  cancelledOrders: number;
  failedOrders: number;
  ticketsSold: number;
  revenue: number; // confirmed orders only
  series: SalesPoint[]; // tickets sold per day, last 14 days
}

function buildDailySeries(days: number, orders: { created_at: string; quantity: number; payment_status: string }[]): SalesPoint[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets = new Map<string, { key: string; label: string; tickets: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000);
    buckets.set(d.toDateString(), {
      key: d.toDateString(),
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      tickets: 0,
    });
  }
  for (const row of orders) {
    if (row.payment_status !== 'confirmed') continue;
    const b = buckets.get(new Date(row.created_at).toDateString());
    if (b) b.tickets += row.quantity;
  }
  return [...buckets.values()].map((b) => ({ label: b.label, tickets: b.tickets }));
}

// Per-event performance for the analytics page. RLS keeps this scoped to the
// caller's own events: a non-owner gets empty orders/ticket_types regardless
// of the party id supplied, so a guessed id can never leak another organizer's
// data. ticket_types.sold is only ever incremented by confirm_order_payment,
// so it is a confirmed-only inventory number.
export async function fetchOrganizerEventAnalytics(partyId: number): Promise<OrganizerEventAnalytics> {
  const [typesRes, ordersRes] = await Promise.all([
    supabase.from('ticket_types').select('*').eq('party_id', partyId).order('id'),
    supabase.from('orders').select('created_at, quantity, total, payment_status').eq('party_id', partyId),
  ]);
  if (typesRes.error) throw typesRes.error;
  if (ordersRes.error) throw ordersRes.error;

  const ticketTypes: TicketTypeInventory[] = (typesRes.data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    price: t.price,
    total: t.quantity,
    sold: t.sold,
    remaining: Math.max(0, t.quantity - t.sold),
    active: t.active,
    salesStartAt: t.sales_start_at,
    salesEndAt: t.sales_end_at,
  }));

  let confirmedOrders = 0;
  let pendingOrders = 0;
  let cancelledOrders = 0;
  let failedOrders = 0;
  let ticketsSold = 0;
  let revenue = 0;
  for (const row of ordersRes.data ?? []) {
    if (row.payment_status === 'confirmed') {
      confirmedOrders += 1;
      ticketsSold += row.quantity;
      revenue += row.total;
    } else if (row.payment_status === 'pending') {
      pendingOrders += 1;
    } else if (row.payment_status === 'cancelled') {
      cancelledOrders += 1;
    } else if (row.payment_status === 'failed') {
      failedOrders += 1;
    }
  }

  return {
    ticketTypes,
    confirmedOrders,
    pendingOrders,
    cancelledOrders,
    failedOrders,
    ticketsSold,
    revenue,
    series: buildDailySeries(14, ordersRes.data ?? []),
  };
}

// Public URL for an event's guest-facing page. Centralised so the host share
// QR code, the copyable link and any social share all point at the same place.
export function partyShareUrl(partyId: number): string {
  return `https://lagoslive.ng/party/${partyId}`;
}

// ---------------------------------------------------------------------------
// Phase 2 — check-in (scanner + door operations).
// ---------------------------------------------------------------------------

// Events available for the door: approved + not cancelled, from ~12h before the
// event (a Friday-night event that started an hour ago must still be found) to
// whenever it ends. Staff (finance/admin/super_admin) see all approved events,
// organisers only their own — matching the RLS that lets them run the gate.
const CHECK_IN_EVENT_WINDOW_MS = 12 * 60 * 60 * 1000;

export async function fetchCheckInEvents(userId: string, role: string): Promise<Party[]> {
  const staff = role === 'finance' || role === 'admin' || role === 'super_admin';
  let query = supabase
    .from('parties')
    .select('*')
    .eq('status', 'approved')
    .is('cancelled_at', null)
    .gte('starts_at', new Date(Date.now() - CHECK_IN_EVENT_WINDOW_MS).toISOString())
    .order('starts_at', { ascending: true });
  if (!staff) query = query.eq('created_by', userId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => toParty(row));
}

export interface CheckInStats {
  sold: number; // tickets admitted-to-miss = sum of quantities on confirmed orders
  checkedIn: number; // candidates checked in (quantity of orders marked checked_in)
  confirmedOrders: number;
}

// Live door numbers for the scanner. RLS scopes this to the caller's own event
// (organiser) or all orders (finance/admin/super_admin) — the same guarantee the
// check-in RPC enforces atomically per scan.
export async function fetchCheckInStats(partyId: number): Promise<CheckInStats> {
  const { data, error } = await supabase
    .from('orders')
    .select('quantity, check_in_status')
    .eq('party_id', partyId)
    .eq('payment_status', 'confirmed');
  if (error) throw error;
  let sold = 0;
  let checkedIn = 0;
  for (const row of data ?? []) {
    sold += row.quantity;
    if (row.check_in_status === 'checked_in') checkedIn += row.quantity;
  }
  return { sold, checkedIn, confirmedOrders: (data ?? []).length };
}

// Most recent check-ins for the host's "CHECK-IN ACTIVITY" strip. Order-level,
// so a scan that checked in N tickets appears once with its quantity.
export async function fetchCheckInActivity(partyId: number, limit = 25): Promise<CheckInActivityItem[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('id, order_ref, quantity, customer_email, checked_in_at, checked_in_gate, ticket_types(name)')
    .eq('party_id', partyId)
    .eq('payment_status', 'confirmed')
    .eq('check_in_status', 'checked_in')
    .order('checked_in_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    orderRef: row.order_ref,
    quantity: row.quantity,
    guestEmail: row.customer_email,
    checkedInAt: row.checked_in_at,
    gate: row.checked_in_gate,
    ticketType: Array.isArray(row.ticket_types) ? row.ticket_types[0]?.name ?? null : row.ticket_types?.name ?? null,
  }));
}

export interface CheckInActivityItem {
  id: string;
  orderRef: string;
  quantity: number;
  guestEmail: string | null;
  checkedInAt: string | null;
  gate: string | null;
  ticketType: string | null;
}
