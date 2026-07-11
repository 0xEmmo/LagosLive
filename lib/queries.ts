import { supabase } from './supabase/client';
import type { Database } from './supabase/database.types';
import type { Party, Vibe } from './types';
import { haversineKm } from './geo';

type PartyRow = Database['public']['Tables']['parties']['Row'];
type PartyInsert = Database['public']['Tables']['parties']['Insert'];

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
    description: row.description,
    gradient: row.gradient,
    isWeekend: row.is_weekend ?? false,
    isThisWeek: startsAt.getTime() - Date.now() < ONE_WEEK_MS && startsAt.getTime() > Date.now() - 24 * 60 * 60 * 1000,
    createdBy: row.created_by,
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
  description: string;
  gradient: string;
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
    description: input.description,
    gradient: input.gradient,
    created_by: createdBy,
  };
}

export async function createParty(input: PartyFormInput, createdBy: string): Promise<Party> {
  const { data, error } = await supabase.from('parties').insert(toRow(input, createdBy)).select().single();
  if (error) throw error;
  return toParty(data);
}

export async function updateParty(id: number, input: PartyFormInput, createdBy: string): Promise<Party> {
  const row = toRow(input, createdBy);
  // spots_left is managed by the order-decrement trigger from here on — don't
  // reset it back to full capacity every time the organizer edits other fields.
  const { spots_left, ...updateFields } = row;
  void spots_left;
  const { data, error } = await supabase.from('parties').update(updateFields).eq('id', id).select().single();
  if (error) throw error;
  return toParty(data);
}
