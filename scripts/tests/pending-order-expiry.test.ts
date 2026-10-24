import assert from 'node:assert/strict';
import test from 'node:test';
import { isPendingCheckoutExpired, PENDING_CHECKOUT_TTL_MS } from '../../lib/pending-order-expiry.ts';

const NOW = Date.parse('2026-10-24T12:00:00.000Z');

test('does not expire a pending checkout before 15 minutes', () => {
  const createdAt = new Date(NOW - PENDING_CHECKOUT_TTL_MS + 1).toISOString();
  assert.equal(isPendingCheckoutExpired(createdAt, NOW), false);
});

test('expires a pending checkout at exactly 15 minutes', () => {
  const createdAt = new Date(NOW - PENDING_CHECKOUT_TTL_MS).toISOString();
  assert.equal(isPendingCheckoutExpired(createdAt, NOW), true);
});

test('invalid timestamps are never treated as expired', () => {
  assert.equal(isPendingCheckoutExpired('not-a-date', NOW), false);
});
