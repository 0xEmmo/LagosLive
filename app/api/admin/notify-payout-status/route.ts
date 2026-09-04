import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { sendPayoutStatusEmail } from '@/lib/resend';

// Sends a payout status notification email to the host. Resolves the host's
// email/name from the payout record server-side (so the client never passes
// arbitrary addresses) and stays best-effort — a failed send must not fail a
// payout transition that already happened.
export async function POST(request: Request) {
  try {
    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    const role: string = profile?.role ?? 'viewer';
    const isStaff = ['support', 'finance', 'admin', 'super_admin'].includes(role);
    if (!isStaff) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });

    const { payoutId, status } = (await request.json()) as { payoutId: number; status: string };
    if (!['pending', 'processing', 'approved', 'paid', 'rejected'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });
    }

    const service = createServiceSupabase();
    const { data: payout, error } = await service
      .from('payouts')
      .select('id, organizer_id, amount, status, paid_at')
      .eq('id', payoutId)
      .maybeSingle();
    if (error || !payout) return NextResponse.json({ error: 'Payout not found.' }, { status: 404 });

    const { data: owner } = await service
      .from('profiles')
      .select('name, email')
      .eq('id', payout.organizer_id)
      .maybeSingle();
    if (!owner?.email) return NextResponse.json({ error: 'Host has no email.' }, { status: 400 });

    await sendPayoutStatusEmail({
      to: owner.email,
      hostName: owner.name ?? 'there',
      amount: payout.amount,
      status: status as 'pending' | 'processing' | 'approved' | 'paid' | 'rejected',
      payoutDate: payout.paid_at ? new Date(payout.paid_at).toLocaleDateString() : undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Payout notification error:', err);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
