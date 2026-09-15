import type { Party } from '@/lib/types';

// Canonical customer-facing availability of an event. Order matters:
// a cancelled event always reads as CANCELLED, a closed event reads as CLOSED
// (even if it also sold out), otherwise a host-declared sold out (soldOutAt)
// or genuine exhaustion (spotsLeft <= 0) reads as SOLD_OUT; anything else is
// OPEN. Single source of truth for every UI surface (cards, detail, checkout,
// map popup, host dashboard).
export type EventAvailabilityState = 'CANCELLED' | 'CLOSED' | 'SOLD_OUT' | 'OPEN';

export function eventAvailability(
  party: Pick<Party, 'cancelledAt' | 'closedAt' | 'soldOutAt' | 'spotsLeft'>
): EventAvailabilityState {
  if (party.cancelledAt) return 'CANCELLED';
  if (party.closedAt) return 'CLOSED';
  if (party.soldOutAt != null || party.spotsLeft <= 0) return 'SOLD_OUT';
  return 'OPEN';
}