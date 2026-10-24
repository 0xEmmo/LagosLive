import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });

    const { data, error } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: 'Could not load wallet balance.' }, { status: 500 });
    return NextResponse.json({ balance: data?.balance ?? 0 });
  } catch {
    return NextResponse.json({ error: 'Could not load wallet balance.' }, { status: 500 });
  }
}
