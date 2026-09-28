import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { paystackListBanks } from '../../lib/paystack-server.ts';

let previousSecret: string | undefined;
let originalFetch: typeof fetch;

before(() => {
  previousSecret = process.env.PAYSTACK_SECRET_KEY;
  process.env.PAYSTACK_SECRET_KEY = 'test-bank-list-secret';
  originalFetch = globalThis.fetch;
});

after(() => {
  if (previousSecret === undefined) delete process.env.PAYSTACK_SECRET_KEY;
  else process.env.PAYSTACK_SECRET_KEY = previousSecret;
  globalThis.fetch = originalFetch;
});

function mockBankResponse(data: Array<{ name?: string; code?: string }>) {
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    const request = new URL(String(input));
    assert.equal(request.searchParams.get('country'), 'nigeria');
    assert.equal(request.searchParams.get('perPage'), '100');
    return new Response(JSON.stringify({ status: true, data }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
}

describe('Paystack bank list', () => {
  it('requests Nigerian banks and returns valid options sorted by name', async () => {
    mockBankResponse([
      { name: 'Zenith Bank', code: '057' },
      { name: 'Access Bank', code: '044' },
      { name: '', code: '999' },
    ]);

    assert.deepEqual(await paystackListBanks(), [
      { name: 'Access Bank', code: '044' },
      { name: 'Zenith Bank', code: '057' },
    ]);
  });

  it('rejects an empty successful response so callers can use the offline fallback', async () => {
    mockBankResponse([]);
    await assert.rejects(paystackListBanks(), /no supported Nigerian banks/i);
  });
});
