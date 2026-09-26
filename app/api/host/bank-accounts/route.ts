import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NIGERIAN_BANK_CODES, paystackCreateTransferRecipient, paystackListBanks } from '@/lib/paystack-server';

export const runtime = 'nodejs';

// The host's verified payout destination.
//
// The account number arrives here, in the request, and goes no further: it is
// exchanged for a Paystack recipient_code in this handler and then discarded.
// Nothing downstream of this line ever sees it — not the database, not a
// response body, not a log. The host is told only the last four digits, which
// is enough for them to recognise the account and useless to anyone who reads
// the row.

/** GET — the host's own accounts, plus the bank list for the form. */
export async function GET() {
  try {
    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

    const { data: accounts, error } = await supabase.rpc('my_bank_accounts');
    if (error) {
      console.error('[bank-accounts] my_bank_accounts failed', error);
      return NextResponse.json({ error: 'Could not load bank accounts.' }, { status: 500 });
    }

    // The live list is preferred so a newly-launched bank can be paid without a
    // code change; the static map keeps the form usable if Paystack is
    // unreachable.
    let banks: { name: string; code: string }[];
    try {
      banks = await paystackListBanks();
    } catch {
      banks = Object.entries(NIGERIAN_BANK_CODES).map(([name, code]) => ({ name, code }));
    }

    return NextResponse.json({ accounts: accounts ?? [], banks });
  } catch (err) {
    console.error('[bank-accounts] GET failed', err);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}

interface RegisterBody {
  accountNumber?: unknown;
  bankCode?: unknown;
  accountName?: unknown;
}

/** POST — verify an account with Paystack and store the resulting token. */
export async function POST(request: Request) {
  try {
    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

    const body = (await request.json()) as RegisterBody;
    const accountNumber = typeof body.accountNumber === 'string' ? body.accountNumber.replace(/\D/g, '') : '';
    const bankCode = typeof body.bankCode === 'string' ? body.bankCode.trim() : '';
    const accountName = typeof body.accountName === 'string' ? body.accountName.trim() : '';

    // A NUBAN account number is exactly 10 digits. Checking it here means a typo
    // costs the host a form error rather than a failed provider call.
    if (!/^\d{10}$/.test(accountNumber)) {
      return NextResponse.json({ error: 'Enter a 10-digit account number.' }, { status: 400 });
    }
    if (!/^\d{3,6}$/.test(bankCode)) {
      return NextResponse.json({ error: 'Choose your bank.' }, { status: 400 });
    }
    if (accountName.length < 2 || accountName.length > 120) {
      return NextResponse.json({ error: 'Enter the account name as it appears on the account.' }, { status: 400 });
    }

    // Paystack validates the number against the bank and returns the account
    // name it holds. This is the verification step: an account that does not
    // exist, or belongs to someone else, fails here rather than becoming a
    // payout destination.
    let recipient: Awaited<ReturnType<typeof paystackCreateTransferRecipient>>;
    try {
      recipient = await paystackCreateTransferRecipient({
        name: accountName,
        accountNumber,
        bankCode,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Paystack could not verify this account.';
      // A rejected account number is a user-input problem, not an outage.
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const verifiedName = recipient.name || accountName;
    const last4 = accountNumber.slice(-4);

    // The service role is required because the host has no grant on this table
    // by design. Everything passed here comes from Paystack's response or from
    // digits already validated above — the recipient code in particular is
    // never taken from the request.
    const service = createServiceSupabase();
    const { data: id, error: insertError } = await service.rpc('register_bank_account', {
      p_user_id: user.id,
      p_bank_code: bankCode,
      p_bank_name: await resolveBankName(bankCode),
      p_account_name: verifiedName,
      p_account_number_last4: last4,
      p_recipient_code: recipient.recipientCode,
    });

    if (insertError || !id) {
      console.error('[bank-accounts] register_bank_account failed', insertError);
      return NextResponse.json({ error: 'Could not save this bank account.' }, { status: 500 });
    }

    // A mismatch is worth surfacing rather than silently accepting: the money
    // will be paid to the bank's account name, not the one that was typed.
    const mismatch =
      verifiedName.replace(/\s+/g, ' ').toUpperCase() !== accountName.replace(/\s+/g, ' ').toUpperCase();

    return NextResponse.json({
      ok: true,
      id,
      accountName: verifiedName,
      last4,
      nameMismatch: mismatch,
    });
  } catch (err) {
    console.error('[bank-accounts] POST failed', err);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}

/**
 * Resolves a bank code to its name for the stored record.
 *
 * The name is looked up rather than taken from the request, so the audit trail
 * cannot be told "058 is Kuda Bank" by a client.
 */
async function resolveBankName(code: string): Promise<string> {
  try {
    const banks = await paystackListBanks();
    const found = banks.find((b) => b.code === code);
    if (found) return found.name;
  } catch {
    // Fall through to the static map below.
  }
  const found = Object.entries(NIGERIAN_BANK_CODES).find(([, c]) => c === code);
  return found ? found[0] : code;
}
