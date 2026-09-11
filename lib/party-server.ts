// Server-only reads for event detail pages (metadata, JSON-LD, initial state).
// Uses the cookie-scoped server client so RLS still decides visibility — an
// anonymous visitor only ever reaches approved, publicly visible events, exactly
// like the client-side fetch. This module must NEVER be imported from a client
// component.

import 'server-only';
import { createServerSupabase } from './supabase/server';
import type { Database } from './supabase/database.types';
import type { Party, PartyStatus, Vibe } from './types';

type PartyRow = Database['public']['Tables']['parties']['Row'];

// Mirrors toParty() in lib/queries.ts but without a userLocation override: the
// server can't know the visitor's position, so the seeded distance is the value
// the client immediately recomputes for the current viewer.
export function partyFromRow(row: PartyRow): Party {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug ?? null,
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
    distance: row.distance,
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
    isThisWeek: false,
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

export async function fetchPartyByIdForSeo(id: number): Promise<Party | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.from('parties').select('*').eq('id', id).maybeSingle();
  if (error || !data) return null;
  return partyFromRow(data);
}

export async function fetchPartyBySlugForSeo(slug: string): Promise<Party | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.from('parties').select('*').eq('slug', slug).maybeSingle();
  if (error || !data) return null;
  return partyFromRow(data);
}