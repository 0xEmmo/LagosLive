export type Vibe = 'Club' | 'Rooftop' | 'Festival' | 'Concert' | 'House Party' | 'Lounge';
export type PartyStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type OrderPaymentStatus = 'pending' | 'confirmed' | 'failed' | 'cancelled';

export interface TicketType {
  id: number;
  partyId: number;
  name: string;
  price: number;
  quantity: number;
  sold: number;
}

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
  organizerPhone: string | null;
  organizerEmail: string | null;
  description: string;
  gradient: string;
  isWeekend: boolean;
  isThisWeek: boolean;
  createdBy: string | null;
  status: PartyStatus;
}

export type DateFilter = 'Tonight' | 'This Week' | 'This Weekend' | 'Next Week';
export type PriceFilter = 'Free' | 'Under ₦5K' | '₦5K - ₦20K' | 'Over ₦20K';
export type DistanceFilter = '0-5km' | '5-10km' | '10km+';
export type SortBy = 'trending' | 'date' | 'price-asc' | 'distance';

export interface PartyFilters {
  date: DateFilter | null;
  price: PriceFilter | null;
  vibe: Vibe | null;
  distance: DistanceFilter | null;
  location: string | null;
}

// A confirmed order joined with its event — what a customer's digital ticket
// is made of. `orderRef` doubles as the ticket code encoded in the QR (Batch 5
// already generated it; there is deliberately no second code system).
export interface CustomerTicket {
  id: string;
  partyId: number;
  party: Party;
  ticketTypeName: string;
  quantity: number;
  unitPrice: number;
  serviceFee: number;
  total: number;
  orderRef: string;
  paymentStatus: OrderPaymentStatus;
  createdAt: string;
}
