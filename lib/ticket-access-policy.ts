import { timingSafeEqual } from 'node:crypto';

export interface GuestTicketAccessRow {
  id: string;
  user_id: string | null;
  ticket_access_token: string | null;
  ticket_access_expires_at: string | null;
  payment_status: string;
}

export function isGuestTicketAccessValid({
  requestedOrderId,
  token,
  order,
  now = Date.now(),
}: {
  requestedOrderId: string;
  token: string;
  order: GuestTicketAccessRow;
  now?: number;
}): boolean {
  if (!requestedOrderId || !token || order.id !== requestedOrderId) return false;
  if (order.user_id !== null || order.payment_status !== 'confirmed') return false;
  if (!order.ticket_access_token || !order.ticket_access_expires_at) return false;
  if (!/^[a-f0-9]{64}$/i.test(token) || !/^[a-f0-9]{64}$/i.test(order.ticket_access_token)) return false;

  const expiresAt = Date.parse(order.ticket_access_expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return false;

  const supplied = Buffer.from(token, 'hex');
  const expected = Buffer.from(order.ticket_access_token, 'hex');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
