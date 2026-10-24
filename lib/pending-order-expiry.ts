export const PENDING_CHECKOUT_TTL_MS = 15 * 60 * 1000;

/**
 * A pending checkout is eligible for reconciliation only after the full
 * reservation window has elapsed. The sweep still asks Paystack about the
 * transaction before releasing inventory.
 */
export function isPendingCheckoutExpired(
  createdAt: string,
  now = Date.now(),
): boolean {
  const created = Date.parse(createdAt);
  return Number.isFinite(created) && created <= now - PENDING_CHECKOUT_TTL_MS;
}
