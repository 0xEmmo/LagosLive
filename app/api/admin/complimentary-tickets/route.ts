import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { sendTicketConfirmation } from '@/lib/resend';
import { buildTicketUrl } from '@/lib/ticket-access';
export async function POST(request: Request) {
  try {
    const body = await request.json() as { partyId?: number; ticketTypeId?: number; quantity?: number; email?: string; guestName?: string; userId?: string | null };
    const auth = createServerSupabase();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
    const service = createServiceSupabase();
    const { data, error } = await auth.rpc('issue_complimentary_ticket' as never, {
      p_party_id: Number(body.partyId), p_ticket_type_id: Number(body.ticketTypeId), p_quantity: Math.trunc(Number(body.quantity)),
      p_email: body.email?.trim().toLowerCase(), p_guest_name: body.guestName?.trim() || null, p_user_id: body.userId || null,
    } as never);
    if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not issue ticket.' }, { status: 400 });
    const issued = data as { order_id: string; order_ref: string; ticket_access_token?: string | null; email: string };
    const { data: order } = await service.from('orders').select('*, parties(title,date,time,location), ticket_types(name)').eq('id', issued.order_id).single();
    let emailSent = false;
    if (order) {
      const party = Array.isArray(order.parties) ? order.parties[0] : order.parties;
      const type = Array.isArray(order.ticket_types) ? order.ticket_types[0] : order.ticket_types;
      emailSent = await sendTicketConfirmation({ to: issued.email, guestName: order.guest_name ?? undefined, partyTitle: party?.title ?? 'Lagos Live event', partyDate: party?.date ?? '', partyTime: party?.time ?? '', partyLocation: party?.location ?? '', ticketTypeName: type?.name ?? 'General Entry', quantity: order.quantity, total: 0, orderRef: order.order_ref, ticketUrl: buildTicketUrl(order.id, order.ticket_access_token), });
    }
    return NextResponse.json({ orderId: issued.order_id, orderRef: issued.order_ref, emailSent });
  } catch { return NextResponse.json({ error: 'Could not issue complimentary ticket.' }, { status: 500 }); }
}
