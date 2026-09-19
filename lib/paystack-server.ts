// Server-only Paystack helpers. This module reads PAYSTACK_SECRET_KEY and must
// NEVER be imported from a client component — it is only ever imported by API
// routes. The secret key is never part of a function's return value.

const PAYSTACK_API = 'https://api.paystack.co';

function paystackHeaders() {
  if (!process.env.PAYSTACK_SECRET_KEY) {
    throw new Error('PAYSTACK_SECRET_KEY is not configured');
  }
  return {
    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
    'Content-Type': 'application/json',
  };
}

export function generatePaymentRef(): string {
  const rand = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `LL-${Date.now()}-${rand}`;
}

export interface PaystackInitParams {
  email: string;
  amountKobo: number;
  reference: string;
  metadata?: Record<string, unknown>;
}

export interface PaystackInitResult {
  authorizationUrl: string;
  accessCode: string;
}

// Server-side transaction initialization: the amount here (kobo) is the one
// Paystack charges, computed from DB prices — never from the browser.
export async function paystackInitialize({
  email,
  amountKobo,
  reference,
  metadata,
}: PaystackInitParams): Promise<PaystackInitResult> {
  const res = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
    method: 'POST',
    headers: paystackHeaders(),
    body: JSON.stringify({
      email,
      amount: amountKobo,
      currency: 'NGN',
      reference,
      metadata,
    }),
  });

  const json = (await res.json()) as { status?: boolean; message?: string; data?: { authorization_url: string; access_code: string } };

  if (!res.ok || !json.status || !json.data) {
    throw new Error(json.message ?? 'Paystack could not initialize payment');
  }

  return {
    authorizationUrl: json.data.authorization_url,
    accessCode: json.data.access_code,
  };
}

export interface PaystackVerifiedTransaction {
  status: string;
  reference: string;
  amountKobo: number;
  currency: string;
  paidAt: string | null;
}

// Server-side verification: only a transaction Paystack reports as 'success'
// can ever confirm an order, and the charged amount is cross-checked against
// the order's server-computed total before anything is marked paid.
export async function paystackVerifyTransaction(reference: string): Promise<PaystackVerifiedTransaction> {
  const res = await fetch(`${PAYSTACK_API}/transaction/verify/${encodeURIComponent(reference)}`, {
    method: 'GET',
    headers: paystackHeaders(),
  });

  const json = (await res.json()) as {
    status?: boolean;
    message?: string;
    data?: { status?: string; reference?: string; amount?: number; currency?: string; paid_at?: string | null };
  };

  if (!res.ok || !json.status || !json.data) {
    throw new Error(json.message ?? 'Paystack verification failed');
  }

  const d = json.data;
  return {
    status: d.status ?? '',
    reference: d.reference ?? '',
    amountKobo: d.amount ?? 0,
    currency: d.currency ?? '',
    paidAt: d.paid_at ?? null,
  };
}

// ---- Transfers (host withdrawals) -------------------------------------------
//
// With Paystack in Manual settlement mode, ticket money stays in the platform's
// Paystack balance. A host withdrawal is executed in EXACTLY TWO server steps:
//
//   1. createPaystackTransferRecipient() — register the host's bank once and
//      keep the returned recipient_code. Safe to call again: passing the same
//      metadata.key makes Paystack idempotent, so a retry never duplicates the
//      recipient.
//   2. paystackInitiateTransfer() — move kobo out of the balance (source:
//      'balance') to that recipient_code within minutes.
//
// Both are server-only and never expose PAYSTACK_SECRET_KEY. They are callable
// from an admin approval flow but that wiring lives outside this module.

// Nigerian bank → Paystack bank_code. Paystack validates the bank_code when a
// recipient is created, so an out-of-date or wrong code fails fast here with a
// clear Paystack error instead of silently sending money to the wrong place.
export const NIGERIAN_BANK_CODES: Record<string, string> = {
  ABB: '023',
  'Access Bank': '044',
  'Citibank Nigeria': '023',
  'Ecobank Nigeria': '050',
  'Fidelity Bank': '070',
  'First Bank of Nigeria': '011',
  'FCMB': '214',
  'Globus Bank': '00103',
  'Guaranty Trust Bank': '058',
  'Heritage Bank': '030',
  'Jaiz Bank': '301',
  'Keystone Bank': '082',
  'Kuda Microfinance Bank': '090267',
  'OPay': '100052',
  'Polaris Bank': '076',
  'Providus Bank': '101',
  'Stanbic IBTC Bank': '221',
  'Standard Chartered Bank': '068',
  'Sterling Bank': '232',
  'SunTrust Bank Nigeria': '100',
  'Union Bank of Nigeria': '032',
  'United Bank for Africa': '033',
  'Unity Bank': '215',
  'Wema Bank': '035',
  'Zenith Bank': '057',
  'Moniepoint MFB': '50515',
  'Palmpay': '100033',
};

export interface PaystackRecipientParams {
  name: string; // account name exactly as it appears on the bank account
  accountNumber: string; // 10-digit NUBAN
  bankCode: string; // e.g. '058' for GTBank (see NIGERIAN_BANK_CODES)
  currency?: 'NGN';
}

export interface PaystackTransferRecipient {
  recipientCode: string;
  active: boolean;
  type: string;
  name: string;
  currency: string;
}

export async function paystackCreateTransferRecipient(params: PaystackRecipientParams): Promise<PaystackTransferRecipient> {
  const res = await fetch(`${PAYSTACK_API}/transferrecipient`, {
    method: 'POST',
    headers: paystackHeaders(),
    body: JSON.stringify({
      type: 'nuban',
      name: params.name,
      account_number: params.accountNumber,
      bank_code: params.bankCode,
      currency: params.currency ?? 'NGN',
      // Idempotency key: the same bank → same recipient, so re-running a
      // withdrawal approval can never create a duplicate recipient.
      metadata: { key: `ll:${params.bankCode}:${params.accountNumber}` },
    }),
  });

  const json = (await res.json()) as {
    status?: boolean;
    message?: string;
    data?: { recipient_code?: string; active?: boolean; type?: string; name?: string; currency?: string };
  };

  if (!res.ok || !json.status || !json.data || !json.data.recipient_code) {
    throw new Error(json.message ?? 'Paystack could not create the transfer recipient');
  }

  const d = json.data;
  return {
    recipientCode: d.recipient_code!,
    active: d.active ?? false,
    type: d.type ?? 'nuban',
    name: d.name ?? '',
    currency: d.currency ?? 'NGN',
  };
}

export interface PaystackTransferParams {
  recipientCode: string;
  amountKobo: number; // positive integer — Paystack floor is NGN 100 minimum
  reason?: string;
  currency?: 'NGN';
  reference?: string; // optional client reference (Paystack generates one if omitted)
}

export interface PaystackTransferResult {
  transferCode: string;
  status: string;
  amountKobo: number;
  currency: string;
}

export async function paystackInitiateTransfer(params: PaystackTransferParams): Promise<PaystackTransferResult> {
  const res = await fetch(`${PAYSTACK_API}/transfer`, {
    method: 'POST',
    headers: paystackHeaders(),
    body: JSON.stringify({
      source: 'balance', // take from the platform's Paystack balance, never the bank
      amount: params.amountKobo,
      recipient: params.recipientCode,
      currency: params.currency ?? 'NGN',
      reason: params.reason,
      reference: params.reference,
    }),
  });

  const json = (await res.json()) as {
    status?: boolean;
    message?: string;
    data?: { transfer_code?: string; status?: string; amount?: number; currency?: string };
  };

  if (!res.ok || !json.status || !json.data || !json.data.transfer_code) {
    throw new Error(json.message ?? 'Paystack could not initiate the transfer');
  }

  const d = json.data;
  return {
    transferCode: d.transfer_code!,
    status: d.status ?? '',
    amountKobo: d.amount ?? 0,
    currency: d.currency ?? 'NGN',
  };
}
