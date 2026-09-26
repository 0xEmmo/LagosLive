import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * Retires one of the caller's own bank accounts.
 *
 * `remove_bank_account` refuses while a live payout still points at the account,
 * so this can only ever succeed once nothing depends on it. There is no route
 * that edits an account in place: switching banks means registering a new one,
 * which is what keeps a payout's destination unchangeable after the fact.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

    const { id } = await params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json({ error: 'Invalid bank account id.' }, { status: 400 });
    }

    const { error } = await supabase.rpc('remove_bank_account', { p_bank_account_id: id });

    if (error) {
      if (error.message.includes('not being paid yet')) {
        return NextResponse.json(
          { error: 'This bank account is being used by a payout that has not been paid yet.' },
          { status: 409 },
        );
      }
      if (error.message.includes('not found')) {
        return NextResponse.json({ error: 'Bank account not found.' }, { status: 404 });
      }
      console.error('[bank-accounts] remove_bank_account failed', error);
      return NextResponse.json({ error: 'Could not remove this bank account.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[bank-accounts] DELETE failed', err);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
