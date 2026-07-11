import { supabase } from './supabase/client';
import type { Database } from './supabase/database.types';
import type { Party, Vibe } from './types';

type PartyRow = Database['public']['Tables']['parties']['Row'];

// DB rows are snake_case; the rest of the app already speaks the camelCase
// Party shape from lib/types.ts, so this is the one place that translates.
function toParty(row: PartyRow): Party {
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    time: row.time,
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
    description: row.description,
    gradient: row.gradient,
    isWeekend: row.is_weekend,
    isThisWeek: row.is_this_week,
  };
}

export async function fetchParties(): Promise<Party[]> {
  const { data, error } = await supabase.from('parties').select('*').order('id');
  if (error) throw error;
  return data.map(toParty);
}

export async function fetchPartyById(id: number): Promise<Party | undefined> {
  const { data, error } = await supabase.from('parties').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? toParty(data) : undefined;
}
