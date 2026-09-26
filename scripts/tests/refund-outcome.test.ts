import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { paystackRefundTransaction } from '../../lib/paystack-server.ts';

/**
 * Refund outcome classification.
 *
 * This is the exact bug that was in two routes: the response body was searched
 * for the substring "refund" and a match was treated as proof the money had gone
 * back to the guest. Paystack's refusal messages contain that word, so a
 * rejected refund was recorded as a successful one - the order was marked
 * refunded, the host's revenue was released, the ticket was returned to sale,
 * and the guest was emailed a receipt for money they never received.
 *
 * Every case below is a real shape Paystack returns. The rule under test is
 * narrow on purpose: only a provider refund id proves money moved, and anything
 * ambiguous must not be guessed at, because guessing wrong pays a guest twice.
 */

// Opaque, deliberately not shaped like a real key. This file is committed.
const SECRET = 'refund-classifier-test-key';
let previousSecret: string | undefined;

before(() => {
  previousSecret = process.env.PAYSTACK_SECRET_KEY;
  process.env.PAYSTACK_SECRET_KEY = SECRET;
});

after(() => {
  if (previousSecret === undefined) delete process.env.PAYSTACK_SECRET_KEY;
  else process.env.PAYSTACK_SECRET_KEY = previousSecret;
});

/** Replaces global fetch with one canned response, and restores it after. */
async function withFetch(
  handler: () => Promise<Response>,
  fn: () => Promise<void>,
): Promise<void> {
  const original = globalThis.fetch;
  globalThis.fetch = handler as unknown as typeof fetch;
  try {
    await fn();
  } finally {
    globalThis.fetch = original;
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('refunds: only a provider refund id counts as money returned', () => {
  it('reports a refund carrying a provider id as refunded', async () => {
    await withFetch(
      async () =>
        jsonResponse(200, {
          status: true,
          message: 'Refund successful',
          data: { id: 4180021, status: 'success', reference: 'LL-1234' },
        }),
      async () => {
        const result = await paystackRefundTransaction('LL-1234', 5000);
        assert.equal(result.outcome, 'refunded');
        assert.equal(result.providerRefundId, '4180021');
        assert.equal(result.providerStatus, 'success');
      },
    );
  });

  it('does NOT treat a refusal that says "Refund" as a success', async () => {
    // This is the regression. The old check was
    //   json.message.toLowerCase().includes('refund')
    // which matches every one of these.
    const refusals = [
      'Refund rejected',
      'Refund not permitted for this transaction',
      'Refund failed',
      'Unable to refund this transaction',
      'This transaction has already been refunded',
    ];

    for (const message of refusals) {
      await withFetch(
        async () => jsonResponse(200, { status: false, message }),
        async () => {
          const result = await paystackRefundTransaction('LL-1234', 5000);
          assert.equal(
            result.outcome,
            'failed',
            `"${message}" must not be read as a successful refund`,
          );
          assert.equal(result.providerRefundId, null);
        },
      );
    }
  });

  it('does not call a status:true response with no refund id a success', async () => {
    // Paystack answers 200 with status:true for an accepted refund, so a body
    // claiming success but carrying no id is not something to trust: it is
    // indistinguishable from a shape we have not seen, and marking the order
    // refunded without a reference leaves finance unable to find it later.
    await withFetch(
      async () => jsonResponse(200, { status: true, message: 'Refund successful' }),
      async () => {
        const result = await paystackRefundTransaction('LL-1234', 5000);
        assert.equal(result.outcome, 'unknown');
        assert.equal(result.providerRefundId, null);
      },
    );
  });

  it('treats a 500 as unknown, not as a refusal', async () => {
    // A 5xx may arrive after Paystack already moved the money. Closing it as
    // 'failed' invites an automatic retry that refunds the guest twice.
    await withFetch(
      async () => jsonResponse(500, { status: false, message: 'Internal server error' }),
      async () => {
        const result = await paystackRefundTransaction('LL-1234', 5000);
        assert.equal(result.outcome, 'unknown');
      },
    );
  });

  it('treats an unreadable body as unknown', async () => {
    await withFetch(
      async () => new Response('<html>gateway timeout</html>', { status: 200 }),
      async () => {
        const result = await paystackRefundTransaction('LL-1234', 5000);
        assert.equal(result.outcome, 'unknown');
      },
    );
  });

  it('treats a network failure as unknown', async () => {
    await withFetch(
      async () => {
        throw new Error('socket hang up');
      },
      async () => {
        const result = await paystackRefundTransaction('LL-1234', 5000);
        assert.equal(result.outcome, 'unknown', 'a transport failure is the ambiguous case');
        assert.match(result.message, /socket hang up/);
      },
    );
  });

  it('never calls a refund successful without asking Paystack at all', async () => {
    const result = await paystackRefundTransaction('', 5000);
    assert.notEqual(result.outcome, 'refunded');

    const zero = await paystackRefundTransaction('LL-1234', 0);
    assert.notEqual(zero.outcome, 'refunded');
  });

  it('sends the amount in kobo', async () => {
    let sent: { transaction?: string; amount?: number } | undefined;
    const original = globalThis.fetch;
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body ?? '{}'));
      return jsonResponse(200, { status: true, data: { id: 7, status: 'success' } });
    }) as unknown as typeof fetch;
    try {
      const result = await paystackRefundTransaction('LL-abc', 5500);
      assert.equal(result.outcome, 'refunded');
    } finally {
      globalThis.fetch = original;
    }

    assert.equal(sent?.transaction, 'LL-abc');
    assert.equal(sent?.amount, 550000, '5500 naira is 550000 kobo');
  });
});
