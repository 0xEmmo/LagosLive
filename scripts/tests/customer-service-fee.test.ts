import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeCart, lineDiscount, SERVICE_FEE_PER_TICKET, ticketLineAmounts } from '../../lib/tickets.ts';
import type { TicketType } from '../../lib/types.ts';

const ticket = (id: number, price: number): TicketType => ({
  id,
  partyId: 42,
  name: price === 0 ? 'Free entry' : 'General admission',
  price,
  quantity: 20,
  sold: 0,
  description: null,
  salesStartAt: null,
  salesEndAt: null,
  active: true,
  sortOrder: id,
});

describe('customer checkout fees', () => {
  it('does not add a Lagos Live service fee to paid ticket totals', () => {
    assert.equal(SERVICE_FEE_PER_TICKET, 0);
    assert.deepEqual(ticketLineAmounts(5000, 2), { subtotal: 10000, serviceFee: 0, total: 10000 });
  });

  it('keeps cart totals equal to ticket prices for paid and mixed free carts', () => {
    const summary = computeCart({ 1: 2, 2: 1 }, [ticket(1, 5000), ticket(2, 0)]);
    assert.equal(summary.subtotal, 10000);
    assert.equal(summary.serviceFee, 0);
    assert.equal(summary.total, 10000);
    assert.equal(summary.free, false);
  });

  it('still applies promotional discounts to ticket prices without reintroducing fees', () => {
    const amounts = ticketLineAmounts(5000, 2);
    const discount = lineDiscount(5000, 2, 10);
    assert.equal(discount, 1000);
    assert.equal(amounts.total - discount, 9000);
  });
});
