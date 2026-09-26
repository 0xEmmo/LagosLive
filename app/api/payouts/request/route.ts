import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * Request a payout.
 *
 * The body is ignored on purpose. This endpoint used to accept `revenue`,
 * `platformFee`, `amount`, `periodStart` and `periodEnd` from the browser and
 * insert them with the service client, which meant the host chose how much
 * money to withdraw — the checks here only ever compared the numbers to each
 * other, and the host controlled all of them.
 *
 * The figures are now derived inside the database by `request_payout()` from
 * confirmed, non-refunded orders that the caller hosts and that no live payout
 * already covers. The caller's only input is their identity.
 *
 * The destination is derived too. `request_payout()` reads the host's verified
 * bank account, stamps `bank_account_id` and the last four digits onto the
 * payout, and refuses the request outright if there is none. The full account
 * number is never stored here or anywhere else — only Paystack's recipient code
 * for the verified account lives in `host_bank_accounts`, and finance sends the
 * transfer against that.
 */
export async function POST() {
  try {
    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

    // Called as the user, not the service client: the function is SECURITY
    // DEFINER, but auth.uid() has to be the caller's for the ownership check
    // inside it to mean anything.
    const { data: payoutId, error } = await supabase.rpc('request_payout');

    if (error) {
      // The function raises with a message meant for the host (unverified
      // account, no bank account, below minimum, revenue already claimed, or a
      // freeze after a reversed transfer). Relay it; anything unrecognised
      // becomes a generic failure so internals are not echoed.
      const known = [
        'Verify your host account',
        'Only event hosts can request payouts',
        'Your account must be active',
        'Payout amount is below the minimum',
        'already being processed',
        'Add a verified bank account',
        'payouts are on hold',
      ];
      const message = known.find((k) => error.message.includes(k));
      const status = message ? 400 : 500;
      return NextResponse.json(
        { error: message ?? 'Could not create the payout request.' },
        { status },
      );
    }

    return NextResponse.json({ ok: true, payoutId });
  } catch {
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
