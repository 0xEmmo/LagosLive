// Server-only guest-access helpers. Imported by API routes only — never from
// client components. The ticket-access token is the unguessable secret that
// lets a guest open their digital ticket without a Supabase session; it is
// generated here with node:crypto (256 bits) and never derived from the order
// id or payment reference.

import { randomBytes } from 'node:crypto';

export function generateTicketAccessToken(): string {
  return randomBytes(32).toString('hex');
}

// The link a customer opens to reach their digital ticket. Authenticated
// orders are reached via RLS on the signed-in session; guest orders need the
// unguessable token appended, otherwise the ticket page would have no way to
// prove who is asking.
export function buildTicketUrl(orderId: string, token?: string | null): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://lagos-live.vercel.app';
  return token ? `${base}/ticket/${orderId}?token=${token}` : `${base}/ticket/${orderId}`;
}

// Deliberately simple: checkout only needs a sane email to charge via Paystack
// and deliver the ticket. Full mailbox validation is Paystack's job.
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}
