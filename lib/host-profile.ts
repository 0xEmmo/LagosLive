import type { Party } from './types';
import { supabase } from './supabase/client';

export interface PublicHostProfile {
  id: string;
  name: string;
  bio: string | null;
  avatarUrl: string | null;
  instagramUrl: string | null;
  tiktokUrl: string | null;
  xUrl: string | null;
  websiteUrl: string | null;
  isVerified: boolean;
}

function mapProfile(row: any): PublicHostProfile | null {
  if (!row?.id || !row?.name) return null;
  return {
    id: String(row.id),
    name: String(row.name),
    bio: typeof row.bio === 'string' ? row.bio : null,
    avatarUrl: typeof row.avatar_url === 'string' ? row.avatar_url : null,
    instagramUrl: typeof row.instagram_url === 'string' ? row.instagram_url : null,
    tiktokUrl: typeof row.tiktok_url === 'string' ? row.tiktok_url : null,
    xUrl: typeof row.x_url === 'string' ? row.x_url : null,
    websiteUrl: typeof row.website_url === 'string' ? row.website_url : null,
    isVerified: row.is_verified === true,
  };
}

export async function fetchPublicHostProfile(hostId: string): Promise<PublicHostProfile | null> {
  const { data, error } = await (supabase as any).rpc('get_public_host_profile', { p_host_id: hostId });
  if (error) throw error;
  return mapProfile(data);
}

export async function fetchPublicHostEvents(hostId: string): Promise<Party[]> {
  const { data, error } = await supabase
    .from('parties')
    .select('*')
    .eq('created_by', hostId)
    .eq('status', 'approved')
    .is('cancelled_at', null)
    .order('starts_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id, title: row.title, slug: row.slug ?? null, date: row.date, time: row.time,
    startsAt: row.starts_at, endsAt: row.ends_at, location: row.location, address: row.address,
    lat: row.lat, lng: row.lng, fee: row.fee, feeNum: row.fee_num, distance: row.distance,
    vibe: row.vibe, capacity: row.capacity, spotsLeft: row.spots_left, ageRestriction: row.age_restriction,
    dressCode: row.dress_code, organizer: row.organizer, instagram: row.instagram, whatsapp: row.whatsapp,
    organizerPhone: row.organizer_phone ?? null, organizerEmail: row.organizer_email ?? null,
    description: row.description, gradient: row.gradient, isWeekend: row.is_weekend ?? false,
    isThisWeek: false, createdBy: row.created_by, status: row.status, coverUrl: row.cover_url ?? null,
    cancelledAt: row.cancelled_at ?? null, cancellationReason: row.cancellation_reason ?? null,
    soldOutAt: row.sold_out_at ?? null, closedAt: row.closed_at ?? null, reviewReason: row.review_reason ?? null,
    reviewCount: row.review_count ?? 0, avgRating: Number(row.avg_rating ?? 0),
  })) as Party[];
}

export function hostProfilePath(hostId: string): string {
  return `/host/profile/${encodeURIComponent(hostId)}`;
}

export function hostInitials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || '?';
}
