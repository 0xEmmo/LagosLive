// Server-only guest-access helpers. Imported by API routes only — never from
// client components. The ticket-access token is the unguessable secret that
// lets a guest open their digital ticket without a Supabase session; it is
// generated here with node:crypto (256 bits) and never derived from the order
// id or payment reference.

import { randomBytes } from 'node:crypto';
import { appUrl } from './seo';

const GUEST_TICKET_ACCESS_LIFETIME_YEARS = 5;

export function generateTicketAccessToken(): string {
  return randomBytes(32).toString('hex');
}

export function ticketAccessExpiryDate(now = new Date()): string {
  const expiresAt = new Date(now);
  expiresAt.setUTCFullYear(expiresAt.getUTCFullYear() + GUEST_TICKET_ACCESS_LIFETIME_YEARS);
  return expiresAt.toISOString();
}

export function isTicketAccessExpired(expiresAt: string | null | undefined, now = Date.now()): boolean {
  const expiry = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  return !Number.isFinite(expiry) || expiry <= now;
}

// The link a customer opens to reach their digital ticket. Authenticated
// orders are reached via RLS on the signed-in session; guest orders need the
// unguessable token appended, otherwise the ticket page would have no way to
// prove who is asking.
export function buildTicketUrl(orderId: string, token?: string | null): string {
  const url = new URL(`${appUrl()}/ticket/${encodeURIComponent(orderId)}`);
  if (token) url.searchParams.set('token', token);
  return url.toString();
}

// Deliberately simple: checkout only needs a sane email to charge via Paystack
// and deliver the ticket. Full mailbox validation is Paystack's job.
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}
