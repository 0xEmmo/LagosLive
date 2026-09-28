import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isGuestTicketAccessValid } from '../../lib/ticket-access-policy.ts';
import { isAccountTicketOwner } from '../../lib/ticket-account-policy.ts';

const token = 'a'.repeat(64);
const now = Date.parse('2026-09-28T15:00:00.000Z');

function guestOrder(overrides: Partial<{
  id: string;
  user_id: string | null;
  ticket_access_token: string | null;
  ticket_access_expires_at: string | null;
  payment_status: string;
}> = {}) {
  return {
    id: 'order-1',
    user_id: null,
    ticket_access_token: token,
    ticket_access_expires_at: '2031-09-28T15:00:00.000Z',
    payment_status: 'confirmed',
    ...overrides,
  };
}

describe('guest ticket email access', () => {
  it('opens a confirmed order when its matching secure token is valid', () => {
    assert.equal(isGuestTicketAccessValid({
      requestedOrderId: 'order-1', token, order: guestOrder(), now,
    }), true);
  });

  it('rejects an invalid token without granting ticket access', () => {
    assert.equal(isGuestTicketAccessValid({
      requestedOrderId: 'order-1', token: 'b'.repeat(64), order: guestOrder(), now,
    }), false);
  });

  it('rejects expired guest access links', () => {
    assert.equal(isGuestTicketAccessValid({
      requestedOrderId: 'order-1', token,
      order: guestOrder({ ticket_access_expires_at: '2026-09-28T14:59:59.999Z' }), now,
    }), false);
  });

  it('does not let a valid token for one order open a different ticket', () => {
    assert.equal(isGuestTicketAccessValid({
      requestedOrderId: 'order-2', token, order: guestOrder(), now,
    }), false);
  });

  it('does not expose pending or account-linked orders through the guest path', () => {
    assert.equal(isGuestTicketAccessValid({
      requestedOrderId: 'order-1', token,
      order: guestOrder({ payment_status: 'pending' }), now,
    }), false);
    assert.equal(isGuestTicketAccessValid({
      requestedOrderId: 'order-1', token,
      order: guestOrder({ user_id: 'user-1' }), now,
    }), false);
  });
});

describe('signed-in ticket access', () => {
  it('continues to allow the account that owns the requested order', () => {
    assert.equal(isAccountTicketOwner({
      requestedOrderId: 'order-1', userId: 'user-1',
      order: { id: 'order-1', user_id: 'user-1' },
    }), true);
  });

  it('rejects another account and a mismatched order id', () => {
    assert.equal(isAccountTicketOwner({
      requestedOrderId: 'order-1', userId: 'user-2',
      order: { id: 'order-1', user_id: 'user-1' },
    }), false);
    assert.equal(isAccountTicketOwner({
      requestedOrderId: 'order-2', userId: 'user-1',
      order: { id: 'order-1', user_id: 'user-1' },
    }), false);
  });
});
