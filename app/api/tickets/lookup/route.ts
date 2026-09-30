import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/database.types';
import { isGuestTicketAccessValid } from '@/lib/ticket-access-policy';

// Token-gated ticket lookup for guests. A guest has no Supabase session, so
// they cannot read their order through RLS; instead they open a link containing
// the unguessable ticket-access token and prove ownership with it here. The
// row is read with the service client so the lookup key is the token alone —
// a bare order id (a guessable UUID) is never enough.

type OrderRow = Database['public']['Tables']['orders']['Row'] & {
  parties?: Database['public']['Tables']['parties']['Row'] | Database['public']['Tables']['parties']['Row'][] | null;
  ticket_types?: { name: string } | { name: string }[] | null;
};

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function toParty(row: Database['public']['Tables']['parties']['Row']) {
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
    distance: row.distance,
    vibe: row.vibe,
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
    status: row.status,
    cancelledAt: row.cancelled_at,
    cancellationReason: row.cancellation_reason,
    coverUrl: row.cover_url ?? null,
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { orderId?: unknown; token?: unknown };
    const orderId = typeof body.orderId === 'string' ? body.orderId : '';
    const token = typeof body.token === 'string' ? body.token : '';
    if (!orderId || !token) {
      return NextResponse.json({ error: 'Ticket not found.' }, { status: 404 });
    }

    const service = createServiceSupabase();
    const { data: row, error } = await service
      .from('orders')
      .select('*, parties!orders_party_id_fkey(*), ticket_types!orders_ticket_type_id_fkey(name)')
      .eq('id', orderId)
      .eq('ticket_access_token', token)
      .maybeSingle();

    // One error for "not found" and "bad token" — we never confirm which.
    if (error || !row || !row.parties || !isGuestTicketAccessValid({
      requestedOrderId: orderId,
      token,
      order: row,
    })) {
      return NextResponse.json({ error: 'Ticket not found.' }, { status: 404 });
    }

    const order = row as OrderRow;
    const party = Array.isArray(row.parties) ? row.parties[0] : row.parties;
    const ticketType = Array.isArray(row.ticket_types) ? row.ticket_types[0] : row.ticket_types;
    if (!party) return NextResponse.json({ error: 'Ticket not found.' }, { status: 404 });
    return NextResponse.json({
      ticket: {
        id: order.id,
        partyId: order.party_id,
        party: toParty(party),
        ticketTypeName: ticketType?.name ?? 'General Entry',
        quantity: order.quantity,
        unitPrice: order.unit_price,
        serviceFee: order.service_fee,
        total: order.total,
        orderRef: order.order_ref,
        paymentStatus: order.payment_status,
        refundStatus: order.refund_status,
        refundAmount: order.refund_amount,
        checkInStatus: order.check_in_status ?? null,
        checkedInAt: order.checked_in_at ?? null,
        refundedAt: order.refunded_at ?? null,
        createdAt: order.created_at,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Ticket not found.' }, { status: 404 });
  }
}
