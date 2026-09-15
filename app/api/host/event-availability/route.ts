import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

type AvailabilityAction = 'sold_out' | 'reopen' | 'close';

// Host-controlled availability on an approved event:
//   * sold_out — mark the event sold out even if inventory remains.
//   * reopen   — undo a host-declared sold out (only while tickets remain; a
//                genuinely exhausted event can't be reopened).
//   * close    — permanently close the event to new orders (existing orders and
//                tickets stay valid). Terminal, like a cancellation but softer.
//
// Authorization mirrors the parties RLS: the host themselves, or staff holding
// events.edit / events.approve. service_role performs the write so the trigger
// in migration 00028 (enforce_event_review_flow) lets it through, while the
// orders gate (enforce_order_availability) is what actually stops purchases.
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { event_id?: unknown; action?: unknown };
    const eventId = Number(body.event_id);
    const action = String(body.action ?? '') as AvailabilityAction;

    if (!Number.isFinite(eventId) || eventId <= 0) {
      return NextResponse.json({ error: 'Invalid event.' }, { status: 400 });
    }
    if (!['sold_out', 'reopen', 'close'].includes(action)) {
      return NextResponse.json({ error: 'Invalid availability action.' }, { status: 400 });
    }

    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

    const service = createServiceSupabase();

    const { data: party, error: partyError } = await service
      .from('parties')
      .select('*')
      .eq('id', eventId)
      .maybeSingle();
    if (partyError || !party) {
      return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
    }

    // Only the host or staff with event permissions may change availability.
    const { data: canEdit } = await service.rpc('user_has_permission', {
      p_user_id: user.id,
      p_permission_name: 'events.edit',
    });
    const { data: canApprove } = await service.rpc('user_has_permission', {
      p_user_id: user.id,
      p_permission_name: 'events.approve',
    });
    if (party.created_by !== user.id && !canEdit && !canApprove) {
      return NextResponse.json({ error: 'You can only manage your own events.' }, { status: 403 });
    }

    if (party.cancelled_at) {
      return NextResponse.json({ error: 'A cancelled event cannot change availability.' }, { status: 400 });
    }
    if (party.status !== 'approved') {
      return NextResponse.json({ error: 'Availability controls apply to live (approved) events.' }, { status: 400 });
    }

    const now = new Date().toISOString();
    let soldOutAt = party.sold_out_at;
    let closedAt = party.closed_at;

    if (action === 'sold_out') {
      if (soldOutAt) {
        return NextResponse.json({ error: 'This event is already marked as sold out.' }, { status: 400 });
      }
      soldOutAt = now;
    } else if (action === 'reopen') {
      if (!soldOutAt) {
        return NextResponse.json({ error: 'This event is not marked as sold out.' }, { status: 400 });
      }
      if (party.spots_left <= 0) {
        return NextResponse.json({ error: 'This event is genuinely sold out — no tickets remain to reopen.' }, { status: 400 });
      }
      soldOutAt = null;
    } else {
      if (closedAt) {
        return NextResponse.json({ error: 'This event is already closed.' }, { status: 400 });
      }
      closedAt = now;
    }

    const { error: updateError } = await service
      .from('parties')
      .update({ sold_out_at: soldOutAt, closed_at: closedAt })
      .eq('id', eventId);
    if (updateError) throw updateError;

    await service.rpc('write_audit_log', {
      p_action: action === 'sold_out' ? 'event_marked_sold_out' : action === 'reopen' ? 'event_reopened' : 'event_closed',
      p_target_type: 'event',
      p_target_id: String(eventId),
      p_details: { title: party.title },
    });

    return NextResponse.json({ success: true, sold_out_at: soldOutAt, closed_at: closedAt });
  } catch (err) {
    console.error('[event-availability] error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not update event availability.' },
      { status: 500 }
    );
  }
}