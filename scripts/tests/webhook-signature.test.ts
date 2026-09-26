import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { paystackVerifyWebhookSignature } from '../../lib/paystack-server.ts';

/**
 * PART 2 — webhook signature verification.
 *
 * This is the only thing standing between an attacker and the ability to mark
 * arbitrary orders paid by POSTing a signed-looking body to the webhook, so it
 * is tested directly rather than only through the route.
 */

// An opaque HMAC key. Deliberately NOT shaped like a real Paystack key: this
// value is checked into git, and a literal matching sk_live_/sk_test_ is either
// going to be redacted by secret scanning or, worse, teach everyone that
// committed key-shaped strings are fine here.
const SECRET = 'part2-webhook-signing-key';
const OTHER_KEY = 'a-different-signing-key';
let previousSecret: string | undefined;
let previousWebhookSecret: string | undefined;

before(() => {
  previousSecret = process.env.PAYSTACK_SECRET_KEY;
  previousWebhookSecret = process.env.PAYSTACK_WEBHOOK_SECRET;
  process.env.PAYSTACK_SECRET_KEY = SECRET;
  delete process.env.PAYSTACK_WEBHOOK_SECRET;
});

after(() => {
  if (previousSecret === undefined) delete process.env.PAYSTACK_SECRET_KEY;
  else process.env.PAYSTACK_SECRET_KEY = previousSecret;
  if (previousWebhookSecret === undefined) delete process.env.PAYSTACK_WEBHOOK_SECRET;
  else process.env.PAYSTACK_WEBHOOK_SECRET = previousWebhookSecret;
});

function sign(body: string, secret = SECRET) {
  return createHmac('sha512', secret).update(body, 'utf8').digest('hex');
}

describe('webhook: signature verification', () => {
  it('accepts a correctly signed body', async () => {
    const body = JSON.stringify({ event: 'charge.success', data: { reference: 'LL-1' } });
    assert.equal(paystackVerifyWebhookSignature(body, sign(body)), true);
  });

  it('rejects a body signed with the wrong key', async () => {
    const body = JSON.stringify({ event: 'charge.success' });
    assert.equal(paystackVerifyWebhookSignature(body, sign(body, OTHER_KEY)), false);
  });

  it('rejects a signature that does not match the body', async () => {
    const body = JSON.stringify({ event: 'charge.success' });
    assert.equal(paystackVerifyWebhookSignature(body, sign(JSON.stringify({ event: 'charge.failed' }))), false);
  });

  it('rejects a missing signature outright', async () => {
    assert.equal(paystackVerifyWebhookSignature('{}', null), false);
    assert.equal(paystackVerifyWebhookSignature('{}', ''), false);
  });

  it('rejects a malformed or truncated signature without throwing', async () => {
    const body = JSON.stringify({ event: 'charge.success' });
    assert.equal(paystackVerifyWebhookSignature(body, 'not-a-signature'), false);
    assert.equal(paystackVerifyWebhookSignature(body, sign(body).slice(0, 20)), false);
    assert.equal(paystackVerifyWebhookSignature(body, sign(body) + 'ff'), false);
  });

  it('fails closed when no secret is configured', async () => {
    const body = JSON.stringify({ event: 'charge.success' });
    const saved = process.env.PAYSTACK_SECRET_KEY;
    delete process.env.PAYSTACK_SECRET_KEY;
    try {
      // A missing secret must reject, never accept.
      assert.equal(paystackVerifyWebhookSignature(body, sign(body)), false);
    } finally {
      process.env.PAYSTACK_SECRET_KEY = saved;
    }
  });

  it('prefers a dedicated webhook secret when one is set', async () => {
    const body = JSON.stringify({ event: 'charge.success' });
    process.env.PAYSTACK_WEBHOOK_SECRET = 'separate_webhook_key';
    try {
      assert.equal(paystackVerifyWebhookSignature(body, sign(body, 'separate_webhook_key')), true);
      assert.equal(paystackVerifyWebhookSignature(body, sign(body, SECRET)), false);
    } finally {
      delete process.env.PAYSTACK_WEBHOOK_SECRET;
    }
  });

  it('is not fooled by a re-serialized body', async () => {
    // The digest covers exact bytes: same data, different key order/whitespace
    // must not verify, which is why the route reads request.text() and never
    // re-encodes a parsed object.
    const original = '{"event":"charge.success","data":{"reference":"LL-1","amount":100}}';
    const reserialized = JSON.stringify(JSON.parse(original), null, 2);
    assert.notEqual(original, reserialized);
    assert.equal(paystackVerifyWebhookSignature(reserialized, sign(original)), false);
  });
});
