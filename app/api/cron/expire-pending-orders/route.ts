import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';
import { paystackVerifyTransaction } from '@/lib/paystack-server';
import { failPaymentGroup, reconcilePaidOrderGroup } from '@/lib/payment-reconciliation';
import { isPendingCheckoutExpired, PENDING_CHECKOUT_TTL_MS } from '@/lib/pending-order-expiry';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_GROUPS_PER_RUN = 200;

/**
 * Releases inventory reserved by abandoned Paystack checkouts.
 *
 * Safety rules:
 * - only pending groups older than 15 minutes are considered;
 * - Paystack is checked before any inventory release;
 * - success is reconciled through the normal amount-checking confirmation path;
 * - provider/network uncertainty leaves the order pending for a later run;
 * - settlement is group-wide and idempotent, including wallet reservations.
 */
export async function GET(request: Request) {
  const suppliedSecret = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!process.env.CRON_SECRET || suppliedSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = createServiceSupabase();
  const cutoff = new Date(Date.now() - PENDING_CHECKOUT_TTL_MS).toISOString();
  const { data: candidates, error: candidateError } = await service
    .from('orders')
    .select('payment_ref, created_at')
    .eq('payment_status', 'pending')
    .not('payment_ref', 'is', null)
    .lte('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(MAX_GROUPS_PER_RUN * 3);

  if (candidateError) {
    console.error('[cron:expire-pending-orders] candidate query failed', candidateError);
    return NextResponse.json({ error: 'Could not load pending checkouts.' }, { status: 500 });
  }

  const references = [...new Set(
    (candidates ?? [])
      .filter((row) => row.payment_ref && isPendingCheckoutExpired(row.created_at))
      .map((row) => row.payment_ref as string),
  )].slice(0, MAX_GROUPS_PER_RUN);

  let confirmed = 0;
  let released = 0;
  let stillPending = 0;
  let verificationErrors = 0;
  let unknownReferences = 0;

  for (const reference of references) {
    try {
      // Do not release based on age alone. A buyer may have paid while the
      // browser was offline and the webhook may still be delayed.
      const verified = await paystackVerifyTransaction(reference);

      if (verified.status === 'success') {
        const result = await reconcilePaidOrderGroup(service, reference);
        if (result.status === 'confirmed') confirmed += 1;
        else if (result.status === 'unknown_reference') unknownReferences += 1;
        else stillPending += 1;
        continue;
      }

      // Paystack's terminal non-success states mean no successful charge exists
      // for this reference. The group settlement RPC restores party spots and
      // releases any wallet hold exactly once.
      if (['failed', 'abandoned', 'reversed'].includes(verified.status)) {
        const group = await service
          .from('orders')
          .select('*')
          .eq('payment_ref', reference)
          .eq('payment_status', 'pending');
        if (group.error) throw group.error;
        if ((group.data ?? []).length > 0) {
          await failPaymentGroup(service, group.data, `Checkout expired without a successful payment (${verified.status}).`);
          released += 1;
        }
        continue;
      }

      // pending/ongoing/queued and any future non-terminal provider state are
      // intentionally retained. The next scheduled run will check again.
      stillPending += 1;
    } catch (error) {
      // A timeout, provider 5xx, or database error is not proof that the buyer
      // did not pay. Leave inventory reserved and retry on the next sweep.
      verificationErrors += 1;
      console.error('[cron:expire-pending-orders] reference left pending', {
        reference,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return NextResponse.json({
    okay: true,
    cutoff,
    considered: references.length,
    confirmed,
    released,
    stillPending,
    verificationErrors,
    unknownReferences,
  });
}
