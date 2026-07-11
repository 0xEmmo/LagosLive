export type Vibe = 'Club' | 'Rooftop' | 'Festival' | 'Concert' | 'House Party' | 'Lounge';
export type PartyStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export interface Party {
  id: number;
  title: string;
  date: string;
  time: string;
  startsAt: string;
  endsAt: string;
  location: string;
  address: string;
  lat: number;
  lng: number;
  fee: string;
  feeNum: number;
  distance: number;
  vibe: Vibe;
  capacity: number;
  spotsLeft: number;
  ageRestriction: string;
  dressCode: string;
  organizer: string;
  instagram: string;
  whatsapp: string;
  description: string;
  gradient: string;
  isWeekend: boolean;
  isThisWeek: boolean;
  createdBy: string | null;
  status: PartyStatus;
}

export type DateFilter = 'This Week' | 'This Weekend' | 'Next Week';
export type PriceFilter = 'Free' | '₦5k-10k' | '₦10k-20k' | '₦20k+';
export type DistanceFilter = '0-5km' | '5-10km' | '10km+';
export type SortBy = 'trending' | 'date' | 'price-asc' | 'distance';

export interface PartyFilters {
  date: DateFilter | null;
  price: PriceFilter | null;
  vibe: Vibe | null;
  distance: DistanceFilter | null;
}
