import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function statusFor(message: string) {
  if (/forbidden|permission/i.test(message)) return 403;
  if (/not found/i.test(message)) return 404;
  if (/below zero|available|payout/i.test(message)) return 409;
  return 400;
}

export async function GET(request: Request) {
  try {
    const supabase = createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
    const hostUserId = new URL(request.url).searchParams.get('hostUserId') ?? '';
    if (!UUID_RE.test(hostUserId)) return NextResponse.json({ error: 'Select a valid host account.' }, { status: 400 });

    const { data, error } = await supabase.rpc('admin_host_payout_ledger' as never, { p_host_user_id: hostUserId } as never);
    if (error) return NextResponse.json({ error: error.message }, { status: statusFor(error.message) });
    return NextResponse.json({ ledger: data });
  } catch {
    return NextResponse.json({ error: 'Could not load the host payout ledger.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });

    const body = await request.json() as { hostUserId?: unknown; amount?: unknown; note?: unknown; reference?: unknown };
    const hostUserId = typeof body.hostUserId === 'string' ? body.hostUserId : '';
    const amount = Number(body.amount);
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    const reference = typeof body.reference === 'string' ? body.reference.trim() : '';
    if (!UUID_RE.test(hostUserId) || !Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > 2_147_483_647 || note.length < 3 || note.length > 500 || reference.length > 120) {
      return NextResponse.json({ error: 'Provide a host account, a non-zero whole-naira amount, an audit note, and an optional reference.' }, { status: 400 });
    }

    const { data: result, error } = await supabase.rpc('admin_adjust_host_payout' as never, {
      p_host_user_id: hostUserId,
      p_amount: amount,
      p_note: note,
      p_reference: reference || null,
    } as never);
    if (error) return NextResponse.json({ error: error.message }, { status: statusFor(error.message) });

    const { data: ledger, error: ledgerError } = await supabase.rpc('admin_host_payout_ledger' as never, { p_host_user_id: hostUserId } as never);
    if (ledgerError) return NextResponse.json({ error: ledgerError.message }, { status: statusFor(ledgerError.message) });
    return NextResponse.json({ result, ledger });
  } catch {
    return NextResponse.json({ error: 'Could not apply the host payout adjustment.' }, { status: 500 });
  }
}
