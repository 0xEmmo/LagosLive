import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

// Payouts are only available to verified, active hosts. RLS already blocks the
// client from inserting a payout for anyone else — this route enforces the same
// (plus the minimum amount) so a payout can never be requested without a human
// admin having verified the operator first.
const MIN_PAYOUT = 500000; // ₦5,000

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      amount?: unknown;
      periodStart?: unknown;
      periodEnd?: unknown;
      revenue?: unknown;
      platformFee?: unknown;
      bankLast4?: unknown;
    };

    const amount = Number(body.amount);
    const periodStart = typeof body.periodStart === 'string' ? body.periodStart : '';
    const periodEnd = typeof body.periodEnd === 'string' ? body.periodEnd : '';
    const revenue = Number(body.revenue);
    const platformFee = Number(body.platformFee);
    const bankLast4 = typeof body.bankLast4 === 'string' ? body.bankLast4.slice(0, 4) : null;

    if (!Number.isFinite(amount) || amount < MIN_PAYOUT) {
      return NextResponse.json({ error: 'Payout amount is below the minimum.' }, { status: 400 });
    }
    if (!Number.isInteger(amount) || !Number.isInteger(revenue) || !Number.isInteger(platformFee)) {
      return NextResponse.json({ error: 'Invalid payout amount.' }, { status: 400 });
    }
    if (!periodStart || !periodEnd || periodEnd < periodStart) {
      return NextResponse.json({ error: 'Invalid payout period.' }, { status: 400 });
    }
    if (revenue <= 0 || platformFee < 0 || platformFee >= revenue) {
      return NextResponse.json({ error: 'Invalid payout figures.' }, { status: 400 });
    }

    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

    const service = createServiceSupabase();
    const { data: profile } = await service
      .from('profiles')
      .select('account_status, host_verification_status, role')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile) return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });

    const allowedRoles = ['organizer', 'finance', 'support', 'admin', 'super_admin'];
    if (!allowedRoles.includes(profile.role ?? '')) {
      return NextResponse.json({ error: 'Only event hosts can request payouts.' }, { status: 403 });
    }
    if ((profile.host_verification_status ?? 'unverified') !== 'verified') {
      return NextResponse.json({ error: 'Verify your host account before requesting payouts.' }, { status: 403 });
    }
    if (profile.account_status !== 'active') {
      return NextResponse.json({ error: 'Your account must be active to request payouts.' }, { status: 403 });
    }

    const { data: row, error } = await service
      .from('payouts')
      .insert({
        organizer_id: user.id,
        period_start: periodStart,
        period_end: periodEnd,
        revenue,
        platform_fee: platformFee,
        amount,
        bank_last4: bankLast4,
      })
      .select('id')
      .single();

    if (error || !row) {
      return NextResponse.json({ error: 'Could not create the payout request.' }, { status: 500 });
    }

    try {
      await service.rpc('write_audit_log', {
        p_action: 'payout_requested',
        p_target_type: 'payout',
        p_target_id: row.id,
        p_details: { amount, revenue, platform_fee: platformFee, period_start: periodStart, period_end: periodEnd },
      } as never);
    } catch {
      // Auditing is best-effort; the payout itself is already created.
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}