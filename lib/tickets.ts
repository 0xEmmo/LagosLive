// Client-safe ticket cart helpers shared by the public event page and the
// checkout page. All amounts are integer naira; Paystack charges kobo on top.

import type { TicketType } from './types';

export const MAX_QTY_PER_TYPE = 6;
export const SERVICE_FEE_PER_TICKET = 500;

// A cart maps ticket_type id -> quantity. id 0 is the synthesized "General
// Entry" fallback used for legacy events that predate real ticket_types rows.
export type TicketCart = Record<number, number>;

// A ticket type is purchasable when it is active and — if the host set a sales
// window — "now" falls inside it. Types outside their window behave like
// paused tiers: hidden from buyers, still managed by the host.
export function isTicketTypeSellable(t: TicketType, now = new Date()): boolean {
  if (t.active === false) return false;
  const at = now.getTime();
  if (t.salesStartAt && new Date(t.salesStartAt).getTime() > at) return false;
  if (t.salesEndAt && new Date(t.salesEndAt).getTime() < at) return false;
  return true;
}

export function remainingOf(t: TicketType): number {
  return Math.max(0, t.quantity - t.sold);
}

// Percent-off promo discount for a paid (price > 0) line, in naira. Integer
// math keeps amounts exact — a 10% cut of a ₦3,000 ticket is floor(300) = ₦300.
// Service fees are platform revenue and are never discounted.
export function lineDiscount(price: number, qty: number, discountPercent: number): number {
  if (price <= 0 || qty <= 0 || discountPercent <= 0) return 0;
  return Math.floor((price * qty * discountPercent) / 100);
}

// Total naira discount a promo would remove from a cart summary.
export function cartDiscount(summary: Pick<CartSummary, 'lines'>, discountPercent: number): number {
  return summary.lines.reduce((sum, line) => sum + lineDiscount(line.type.price, line.qty, discountPercent), 0);
}

export interface CartLine {
  type: TicketType;
  qty: number;
}

export interface CartSummary {
  lines: CartLine[];
  tickets: number; // total tickets across lines
  subtotal: number; // ticket price only
  serviceFee: number;
  total: number;
  free: boolean; // true when nothing in the cart costs anything
}

// Reduce a cart against the given ticket types. Unknown ids are ignored; line
// quantities are clamped to what is physically left so a stale cart can never
// ask for more tickets than exist.
export function computeCart(cart: TicketCart, types: TicketType[]): CartSummary {
  const lines: CartLine[] = [];
  let tickets = 0;
  let subtotal = 0;
  let serviceFee = 0;
  for (const type of types) {
    const qty = Math.min(Math.max(0, Math.trunc(cart[type.id] ?? 0)), remainingOf(type));
    if (qty === 0) continue;
    lines.push({ type, qty });
    tickets += qty;
    subtotal += type.price * qty;
    if (type.price > 0) serviceFee += SERVICE_FEE_PER_TICKET * qty;
  }
  return { lines, tickets, subtotal, serviceFee, total: subtotal + serviceFee, free: totalPriceIsFree(cart, types) };
}

// A cart is "free" when every selected line is a free ticket type. (A mixed
// free + paid cart still charges the paid lines and their service fees.)
function totalPriceIsFree(cart: TicketCart, types: TicketType[]): boolean {
  for (const type of types) {
    const qty = Math.min(Math.max(0, Math.trunc(cart[type.id] ?? 0)), remainingOf(type));
    if (qty > 0 && type.price > 0) return false;
  }
  return true;
}

// -- `items` query param: "<id>:<qty>,<id>:<qty>" ---------------------------
// The public event page encodes its cart so checkout can open pre-filled.

export function encodeCartItems(cart: TicketCart): string {
  const parts: string[] = [];
  for (const [id, qty] of Object.entries(cart)) {
    const n = Number(id);
    if (Number.isInteger(n) && n > 0 && qty > 0) parts.push(`${n}:${qty}`);
  }
  return parts.join(',');
}

export function parseItemsParam(raw: string | null): TicketCart | null {
  if (!raw) return null;
  const cart: TicketCart = {};
  for (const chunk of raw.split(',')) {
    const [idRaw, qtyRaw] = chunk.split(':');
    const id = Number(idRaw);
    const qty = Number(qtyRaw);
    if (Number.isInteger(id) && id > 0 && Number.isInteger(qty) && qty >= 1 && qty <= MAX_QTY_PER_TYPE) {
      cart[id] = Math.max(cart[id] ?? 0, qty);
    }
  }
  return Object.keys(cart).length > 0 ? cart : null;
}