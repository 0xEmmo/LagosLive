import { supabase } from './supabase/client';
import type { Database } from './supabase/database.types';
import type { CustomerTicket, Party, PartyStatus, TicketType, Vibe } from './types';
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
  const { data, error } = await supabase.from('parties').insert(toRow(input, createdBy)).select().single();
  if (error) throw error;
  const party = toParty(data);
  await ensureGeneralTicketType(party.id, input.feeNum, input.capacity);
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
  await ensureGeneralTicketType(id, input.feeNum, input.capacity);
  if (input.coverImage) {
    const coverUrl = await uploadCoverImage(id, input.coverImage);
    if (coverUrl) {
      await supabase.from('parties').update({ cover_url: coverUrl }).eq('id', id);
    }
  }
  const updated = await fetchPartyById(id);
  return updated ?? toParty(data);
}

// Every organizer-created event gets one real purchasable ticket type
// ("General Entry") derived from its entry fee and capacity. Kept tiny on
// purpose: multi-tier ticket types are a later batch, and the checkout already
// supports any number of types when they exist. Events without a ticket type
// (the 22 seeded rows) fall back to fee-based checkout via party.fee_num.
async function ensureGeneralTicketType(partyId: number, feeNum: number, capacity: number) {
  const { data: existing } = await supabase.from('ticket_types').select('*').eq('party_id', partyId);
  if (existing && existing.length > 0) {
    const ticket = existing[0];
    const { error } = await supabase
      .from('ticket_types')
      .update({ name: 'General Entry', price: feeNum, quantity: capacity })
      .eq('id', ticket.id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from('ticket_types').insert({
    party_id: partyId,
    name: 'General Entry',
    price: feeNum,
    quantity: capacity,
  });
  if (error) throw error;
}

// Buyers fetch ticket types for the checkout; RLS only returns types for
// parties the viewer can actually see (approved / organizer / admin).
export async function fetchTicketTypes(partyId: number): Promise<TicketType[]> {
  const { data, error } = await supabase
    .from('ticket_types')
    .select('*')
    .eq('party_id', partyId)
    .order('id');
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    partyId: row.party_id,
    name: row.name,
    price: row.price,
    quantity: row.quantity,
    sold: row.sold,
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
