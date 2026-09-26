import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { paystackGetTransfer, paystackInitiateTransfer } from '@/lib/paystack-server';
import { classifyTransferStatus } from '@/lib/payout-transfer-matching';
import type { Json } from '@/lib/supabase/database.types';

export const runtime = 'nodejs';

// Sends an approved payout to the host's verified bank account.
//
// This is the only code in the application that moves money out to a host, and
// the order of operations is the whole point:
//
//   1. require payouts.approve, so an ordinary user cannot reach it;
//   2. load the payout with the service role and require status = 'approved';
//   3. take the recipient_code from the payout's verified bank account — never
//      from the request, so a caller cannot redirect a payout to an account
//      they control;
//   4. CLAIM the transfer in the database, which sets the payout to
//      'transfer_pending' and serialises concurrent requests, and which returns
//      the reference to send;
//   5. initiate the transfer for the payout's own server-computed amount;
//   6. stamp the provider's code against the claim;
//   7. re-read the transfer from Paystack, because "accepted" is not "sent";
//   8. only if Paystack reports the money actually moved, call
//      mark_payout_paid with the transfer code.
//
// If the transfer is merely queued, the payout stays 'transfer_pending' and the
// transfer.sent webhook finishes the job. A payout is never marked paid on the
// strength of this handler's own optimism.
//
// Step 4 exists because steps 1-3 and step 5 are not one transaction, so two
// finance users clicking "Send transfer" a second apart would both see an
// approved payout and Paystack would accept two transfers for it. The claim is
// committed before Paystack is called, so the second request finds it and never
// gets that far. See claim_payout_transfer in 00040.

/** Paystack's own status values that mean the money left the balance. */
const SENT_STATUSES = new Set(['success', 'sent', 'successful', 'processed']);

interface PayoutForTransfer {
  id: number;
  status: string;
  amount: number;
  transfer_code: string | null;
  transfer_attempted_at: string | null;
  transfer_reference: string | null;
  bank_account_id: string | null;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

    const { data: canApprove } = await supabase.rpc('user_has_permission', {
      p_user_id: user.id,
      p_permission_name: 'payouts.approve',
    });
    if (canApprove !== true) {
      return NextResponse.json({ error: 'You are not allowed to send payouts.' }, { status: 403 });
    }

    const { id } = await params;
    const payoutId = Number(id);
    if (!Number.isInteger(payoutId) || payoutId <= 0) {
      return NextResponse.json({ error: 'Invalid payout id.' }, { status: 400 });
    }

    const service = createServiceSupabase();

    const { data: payout, error: payoutError } = await service
      .from('payouts')
      .select('id, status, amount, transfer_code, transfer_attempted_at, transfer_reference, bank_account_id')
      .eq('id', payoutId)
      .maybeSingle();
    if (payoutError || !payout) {
      return NextResponse.json({ error: 'Payout not found.' }, { status: 404 });
    }
    const row = payout as PayoutForTransfer;

    if (row.status === 'paid') {
      return NextResponse.json({ ok: true, alreadyPaid: true });
    }
    if (row.status === 'reconciliation_required') {
      return NextResponse.json(
        { error: 'This payout was reversed and is awaiting review. Resolve the reconciliation before sending it again.' },
        { status: 409 },
      );
    }
    if (row.status === 'transfer_pending') {
      // A claim exists, so a transfer may or may not be at the bank. Sending a
      // second one is the one outcome that cannot be undone, so the route
      // refuses and tells finance what to look up.
      return NextResponse.json(
        {
          error:
            'A transfer for this payout is already in progress. Check Paystack for this reference before doing anything else.',
          transferReference: row.transfer_reference,
        },
        { status: 409 },
      );
    }
    if (row.status !== 'approved') {
      return NextResponse.json(
        { error: `A payout must be approved before it can be sent (currently ${row.status}).` },
        { status: 409 },
      );
    }
    if (!row.bank_account_id) {
      return NextResponse.json(
        { error: 'This payout has no verified bank account.' },
        { status: 409 },
      );
    }

    // An existing transfer code means a transfer already exists in the world.
    // The only correct next step is to ask Paystack what became of it. Starting a
    // second transfer here is how a host gets paid twice for one payout.
    if (row.transfer_code) {
      return reconcileExistingTransfer(service, payoutId, row.transfer_code);
    }

    // A previous attempt claimed the payout and never reported a code. Whether
    // Paystack accepted that transfer is unknowable from here, so the payout is
    // parked for a human rather than risking a duplicate send.
    if (row.transfer_attempted_at) {
      return NextResponse.json(
        {
          error:
            'A previous transfer attempt for this payout never reported a provider code, so it cannot be retried automatically. Check Paystack for this reference and resolve the payout by hand.',
          transferReference: row.transfer_reference,
        },
        { status: 409 },
      );
    }

    // The recipient comes from the verified record, and it is only ever read
    // with the service role. No client can supply or influence it.
    const { data: bankAccount, error: bankError } = await service
      .from('host_bank_accounts')
      .select('id, recipient_code, account_name, account_number_last4, removed_at')
      .eq('id', row.bank_account_id)
      .maybeSingle();

    if (bankError || !bankAccount) {
      console.error('[payout transfer] could not load the verified bank account', bankError);
      return NextResponse.json({ error: 'The verified bank account for this payout is missing.' }, { status: 409 });
    }
    if (bankAccount.removed_at) {
      // remove_bank_account blocks this while a live payout points at the
      // account, so reaching here means the account was retired out of band.
      return NextResponse.json(
        { error: 'The verified bank account for this payout has been retired.' },
        { status: 409 },
      );
    }

    // Paystack works in kobo and refuses amounts below ₦100. The amount is the
    // payout's own figure, computed in request_payout() from confirmed orders.
    const amountKobo = Math.round(Number(row.amount) * 100);

    // The claim is taken before Paystack is called, and it hands back the
    // reference to use. Doing it in this order is the point: a concurrent
    // request blocks inside claim_payout_transfer and never reaches Paystack.
    const { data: reference, error: claimError } = await service.rpc('claim_payout_transfer', {
      p_payout_id: payoutId,
    });
    if (claimError || !reference) {
      return NextResponse.json(
        { error: claimError?.message ?? 'This payout could not be claimed for transfer.' },
        { status: 409 },
      );
    }

    let initiated: Awaited<ReturnType<typeof paystackInitiateTransfer>>;
    try {
      initiated = await paystackInitiateTransfer({
        recipientCode: bankAccount.recipient_code as string,
        amountKobo,
        reference,
        reason: 'LagosLive host payout',
      });
    } catch (err) {
      // Paystack refused, so no transfer exists. The claim goes back so finance
      // can retry immediately instead of waiting out the stale-claim window.
      const { error: releaseError } = await service.rpc('release_payout_transfer_claim', {
        p_payout_id: payoutId,
      });
      if (releaseError) {
        console.error('[payout transfer] could not release the claim', payoutId, releaseError.message);
      }
      console.error('[payout transfer] Paystack rejected the transfer', payoutId, err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Paystack could not start the transfer.' },
        { status: 502 },
      );
    }

    // Record the code against the claim, before knowing whether the transfer
    // completed. A queued transfer is confirmed by webhook later, and that
    // webhook matches on this code first and this reference second.
    const { error: stampError } = await service.rpc('stamp_payout_transfer', {
      p_payout_id: payoutId,
      p_transfer_code: initiated.transferCode,
      p_transfer_reference: reference,
    });
    if (stampError) {
      // The transfer exists at Paystack but this database does not know its code.
      // Not releasing the claim is deliberate: releasing it would invite a
      // second transfer for a payout that may already have money on its way.
      console.error('[payout transfer] transfer started but the code could not be stamped', payoutId, stampError);
      return NextResponse.json(
        {
          error:
            'The transfer was started but its provider code could not be recorded. Do not resend this payout — finance must reconcile it with Paystack.',
          transferReference: reference,
        },
        { status: 500 },
      );
    }

    await writeAudit(service, 'payout_transfer_initiated', payoutId, {
      transfer_code: initiated.transferCode,
      transfer_reference: reference,
      transfer_status: initiated.status,
      amount_kobo: amountKobo,
    });

    // Read the transfer back rather than trusting the create response. This is
    // what turns "we asked" into "Paystack says".
    let status = initiated.status;
    let reason: string | null = null;
    try {
      const confirmed = await paystackGetTransfer(initiated.transferCode);
      status = confirmed.status;
      reason = confirmed.reason;
    } catch (err) {
      console.warn('[payout transfer] could not read the transfer back', initiated.transferCode, err);
    }

    if (!SENT_STATUSES.has(status.toLowerCase())) {
      // Queued, pending, reversed or failed. The payout stays 'transfer_pending'
      // — the claim is still held, so nobody can send a second transfer — and the
      // webhook either completes it or gives the claim back.
      return NextResponse.json(
        {
          ok: true,
          sent: false,
          transferStatus: status,
          reason,
          message: `Transfer ${status}. The payout will be marked paid once Paystack confirms it.`,
        },
        { status: 202 },
      );
    }

    const { error: markError } = await service.rpc('mark_payout_paid', {
      p_payout_id: payoutId,
      p_transfer_code: initiated.transferCode,
      // Our own reference, echoed back so the payout can be matched to the
      // transfer in Paystack's dashboard without a second lookup.
      p_transfer_reference: reference,
    });
    if (markError) {
      console.error('[payout transfer] transfer sent but mark_payout_paid failed', payoutId, markError);
      return NextResponse.json(
        { error: 'The transfer was sent but the payout could not be recorded. It will be reconciled by the provider webhook.' },
        { status: 500 },
      );
    }

    await writeAudit(service, 'payout_transfer_sent', payoutId, {
      transfer_code: initiated.transferCode,
      transfer_status: status,
      amount_kobo: amountKobo,
      bank_last4: bankAccount.account_number_last4,
      account_name: bankAccount.account_name,
    });

    return NextResponse.json({ ok: true, sent: true, transferStatus: status });
  } catch (err) {
    console.error('[payout transfer] failed', err);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}

/**
 * What to do about a payout that already has a transfer code.
 *
 * This is the path a second click on the same payout takes, and it is the reason
 * a double send is not possible: the transfer is queried, never re-created. It
 * also repairs the case where the money left but the database never found out —
 * marking the payout paid from the provider's own record is strictly better
 * than leaving an approved payout with the money already gone.
 */
async function reconcileExistingTransfer(
  service: ReturnType<typeof createServiceSupabase>,
  payoutId: number,
  transferCode: string,
) {
  let existing: Awaited<ReturnType<typeof paystackGetTransfer>>;
  try {
    existing = await paystackGetTransfer(transferCode);
  } catch (err) {
    console.error('[payout transfer] could not read the existing transfer', transferCode, err);
    return NextResponse.json(
      { error: 'Paystack could not be reached to check the existing transfer. Nothing was sent.' },
      { status: 502 },
    );
  }

  const lifecycle = classifyTransferStatus(existing.status);
  const reason = existing.reason;

  if (lifecycle === 'sent') {
    // The money is gone but our records do not say so, which is exactly the
    // situation that leaves a real payment looking like an unpaid payout.
    const { error } = await service.rpc('mark_payout_paid', {
      p_payout_id: payoutId,
      p_transfer_code: transferCode,
      p_transfer_reference: existing.reference,
    });
    if (error) {
      console.error('[payout transfer] existing transfer is sent but marking failed', payoutId, error.message);
      return NextResponse.json(
        { error: 'The transfer was sent but the payout could not be recorded. It will be reconciled by the provider webhook.' },
        { status: 500 },
      );
    }
    await writeAudit(service, 'payout_transfer_reconciled', payoutId, {
      transfer_code: transferCode,
      transfer_status: existing.status,
      reason: 'Existing transfer found to be sent while the payout was still approved',
    });
    return NextResponse.json({ ok: true, sent: true, transferStatus: existing.status, reconciled: true });
  }

  if (lifecycle === 'in_flight') {
    // Someone else has this. Saying so plainly is the point; starting another
    // transfer is the failure this whole path exists to prevent.
    return NextResponse.json(
      {
        ok: true,
        sent: false,
        transferStatus: existing.status,
        message: `A transfer is already in progress (${existing.status}). Nothing was sent again.`,
      },
      { status: 202 },
    );
  }

  if (lifecycle === 'dead') {
    // The old transfer is finished and will never move money. A fresh attempt
    // is legitimate, but it needs a human to clear the dead code first — that
    // transition_payout's reconciliation path is for, and doing it silently here
    // would quietly discard a record finance may need.
    return NextResponse.json(
      {
        error: `The existing transfer ${status}, so this payout must be reviewed before it can be sent again.${reason ? ` Reason: ${reason}` : ''}`,
        transferStatus: existing.status,
        transferCode,
      },
      { status: 409 },
    );
  }

  return NextResponse.json(
    {
      error: `Paystack reports the existing transfer as "${existing.status}", which is not a state this platform can act on automatically.`,
      transferStatus: existing.status,
      transferCode,
    },
    { status: 409 },
  );
}

/**
 * Writes an audit entry. Best-effort: a payout that has already moved must not
 * fail because the audit table was briefly unavailable.
 */
async function writeAudit(
  service: ReturnType<typeof createServiceSupabase>,
  action: string,
  payoutId: number,
  details: Record<string, unknown>,
) {
  const { error } = await service.rpc('write_audit_log', {
    p_action: action,
    p_target_type: 'payout',
    p_target_id: String(payoutId),
    p_details: details as Json,
  });
  if (error) console.warn('[payout transfer] could not write audit log', payoutId, error.message);
}
