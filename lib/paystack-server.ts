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
