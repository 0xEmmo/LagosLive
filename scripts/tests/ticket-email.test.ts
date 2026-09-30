import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getTicketSkin } from '../../lib/ticket-skin.ts';
import { renderTicketEmailHtml, type TicketEmailData } from '../../lib/ticket-email-template.ts';
import { emailDocument } from '../../lib/email-document.ts';

const sampleTicket: TicketEmailData = {
  to: 'buyer@example.test',
  partyTitle: 'Lagos After Dark',
  partyDate: 'Sat, Oct 24, 2026',
  partyTime: '9:00 PM',
  partyLocation: 'The New Afrika Shrine',
  partyAddress: 'Nerho Street, Ikeja, Lagos',
  partyImageUrl: 'https://cdn.example.test/events/lagos-after-dark.jpg',
  ticketTypeName: 'General Admission',
  quantity: 2,
  total: 24000,
  orderRef: 'LL-ORDER-1234',
  ticketUrl: 'https://lagoslive.example/ticket/order-123?token=secure-bearer-token',
  guestName: 'Ada Okafor',
  guestPhone: '+2348000000000',
  promoCode: 'WELCOME10',
  promoDiscount: 2000,
};

const options = {
  formatMoney: (amount: number) => `₦${amount.toLocaleString('en-NG')}`,
  supportUrl: 'https://lagoslive.example',
  paymentDate: 'Sep 28, 2026',
};

describe('ticket confirmation email', () => {
  it('uses the same gold, silver, early-bird, and regular tiers as the printable ticket', () => {
    assert.equal(getTicketSkin('VIP', '#123456').kind, 'gold');
    assert.equal(getTicketSkin('VVIP', '#123456').kind, 'silver');
    assert.equal(getTicketSkin('Early Bird', '#123456').kind, 'early');
    assert.equal(getTicketSkin('General Admission', '#123456').kind, 'regular');
  });

  it('locks ticket email documents to light mode while retaining dark mode as the generic default', () => {
    const light = emailDocument('<main>Ticket</main>', '#F5F7FC', 'light');
    const dark = emailDocument('<main>Other transactional email</main>');

    assert.match(light, /<meta name="color-scheme" content="light">/);
    assert.match(light, /<meta name="supported-color-schemes" content="light">/);
    assert.match(light, /prefers-color-scheme: dark/);
    assert.match(light, /background-color:#F5F7FC/);
    assert.match(dark, /<meta name="color-scheme" content="dark">/);
    assert.match(dark, /prefers-color-scheme: light/);
    assert.match(dark, /background-color:#0B0B10/);
  });

  it('renders an event-art boarding pass in the current light/blue brand palette', () => {
    const html = renderTicketEmailHtml(sampleTicket, getTicketSkin(sampleTicket.ticketTypeName, '#1F5FFF'), options);

    assert.match(html, /Your event ticket/);
    assert.match(html, /src="https:\/\/cdn\.example\.test\/events\/lagos-after-dark\.jpg"/);
    assert.match(html, /The New Afrika Shrine/);
    assert.match(html, /Nerho Street, Ikeja, Lagos/);
    assert.match(html, /background:#F5F7FC/);
    assert.match(html, /#1F5FFF/);
    assert.match(html, /Open &amp; download ticket/);
    assert.match(html, /href="https:\/\/lagoslive\.example\/ticket\/order-123\?token=secure-bearer-token"/);
    assert.match(html, /save as PDF/i);
    assert.doesNotMatch(html, /#FF2D95|#8A2BE2/);
    assert.doesNotMatch(html, /#07152C|#A8EFFF|#AFC2E0/);
  });

  it('escapes event-supplied HTML and rejects non-HTTPS cover-image URLs', () => {
    const html = renderTicketEmailHtml(
      { ...sampleTicket, partyTitle: "<script>alert('x')</script>", partyImageUrl: 'javascript:alert(1)' },
      getTicketSkin('General Admission', '#1F5FFF'),
      options
    );

    assert.match(html, /&lt;script&gt;alert\(&#39;x&#39;\)&lt;\/script&gt;/);
    assert.match(html, /Event boarding pass/);
    assert.doesNotMatch(html, /<script>|javascript:/i);
    assert.doesNotMatch(html, /src="/);
  });

  it('applies tier-specific stub colors and the early-bird mark', () => {
    const vip = renderTicketEmailHtml({ ...sampleTicket, ticketTypeName: 'VIP' }, getTicketSkin('VIP', '#1F5FFF'), options);
    const vvip = renderTicketEmailHtml({ ...sampleTicket, ticketTypeName: 'VVIP' }, getTicketSkin('VVIP', '#1F5FFF'), options);
    const early = renderTicketEmailHtml({ ...sampleTicket, ticketTypeName: 'Early Bird' }, getTicketSkin('Early Bird', '#1F5FFF'), options);

    assert.match(vip, /VIP ADMISSION/);
    assert.match(vip, /bgcolor="#F4C65E"/);
    assert.match(vvip, /VVIP ADMISSION/);
    assert.match(vvip, /bgcolor="#D0D7E0"/);
    assert.match(early, /EARLY BIRD/);
    assert.match(early, /🐦/);
    assert.match(early, /bgcolor="#56E2C4"/);
  });
});
