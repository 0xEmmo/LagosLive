import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
export async function POST(request: Request) {
  try {
    const body = await request.json() as { userId?: string; amount?: number; kind?: string; note?: string; reference?: string };
    const supabase = createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
    const { data, error } = await supabase.rpc('adjust_wallet' as never, {
      p_user_id: body.userId, p_amount: Math.trunc(Number(body.amount)), p_kind: body.kind ?? 'admin_credit',
      p_note: body.note, p_reference: body.reference ?? null,
    } as never);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ wallet: data });
  } catch { return NextResponse.json({ error: 'Wallet adjustment failed.' }, { status: 500 }); }
}
