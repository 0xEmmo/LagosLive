import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { partyId?: number; code?: string; discountPercent?: number; description?: string; maxUses?: number | null; startsAt?: string | null; endsAt?: string | null };
    const supabase = createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
    const { data, error } = await supabase.rpc('create_host_promo' as never, {
      p_party_id: Number(body.partyId), p_code: body.code?.trim().toUpperCase(),
      p_discount_percent: Number(body.discountPercent), p_description: body.description ?? null,
      p_max_uses: body.maxUses ?? null, p_starts_at: body.startsAt ?? null, p_ends_at: body.endsAt ?? null,
    } as never);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ id: data });
  } catch { return NextResponse.json({ error: 'Could not create coupon.' }, { status: 500 }); }
}
