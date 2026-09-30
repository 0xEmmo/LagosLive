import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
export async function GET(request: Request) {
  try {
    const supabase = createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
    const partyId = Number(new URL(request.url).searchParams.get('partyId'));
    if (!Number.isInteger(partyId) || partyId < 1) return NextResponse.json({ error: 'Invalid event ID.' }, { status: 400 });
    const { data, error } = await supabase.rpc('event_profitability' as never, { p_party_id: partyId } as never);
    if (error || !data || (data as unknown[]).length === 0) return NextResponse.json({ error: error?.message ?? 'Event not found.' }, { status: 404 });
    return NextResponse.json({ profit: (data as unknown[])[0] });
  } catch { return NextResponse.json({ error: 'Could not calculate event gain.' }, { status: 500 }); }
}
