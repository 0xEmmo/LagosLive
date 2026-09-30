export type EmailTicketTier = 'silver' | 'gold' | 'early' | 'regular';

export interface EmailTicketSkin {
  kind: EmailTicketTier;
  stubBackground: string;
  stubFallback: string;
  stubColor: string;
}

export interface TicketEmailData {
  to: string;
  partyTitle: string;
  partyDate: string;
  partyTime: string;
  partyLocation: string;
  partyAddress?: string;
  partyImageUrl?: string | null;
  ticketTypeName: string;
  quantity: number;
  total: number;
  orderRef: string;
  ticketUrl: string;
  guestName?: string;
  guestPhone?: string;
  promoCode?: string;
  promoDiscount?: number;
}

export interface TicketEmailOptions {
  formatMoney: (amount: number) => string;
  supportUrl: string;
  paymentDate: string;
}

function escapeEmailHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeTicketImageUrl(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function quantityLabel(quantity: number): string {
  return `&times;${quantity}`;
}

/** Render a light, email-client-safe boarding pass that echoes the printable ticket. */
export function renderTicketEmailHtml(
  d: TicketEmailData,
  skin: EmailTicketSkin,
  options: TicketEmailOptions
): string {
  const totalLabel = d.total === 0 ? 'Free' : escapeEmailHtml(options.formatMoney(d.total));
  const typeLabel = escapeEmailHtml(d.ticketTypeName).toUpperCase();
  const imageUrl = safeTicketImageUrl(d.partyImageUrl);
  const tierLabel = skin.kind === 'gold' ? 'VIP ADMISSION' : skin.kind === 'silver' ? 'VVIP ADMISSION' : skin.kind === 'early' ? 'EARLY BIRD' : 'GENERAL ADMISSION';
  const earlyBirdMark = skin.kind === 'early' ? ' &nbsp;🐦' : '';
  const eventArtwork = imageUrl
    ? `<img src="${escapeEmailHtml(imageUrl)}" alt="${escapeEmailHtml(d.partyTitle)} event artwork" width="520" style="display:block;width:100%;height:210px;object-fit:cover;border:0;">`
    : `<div style="height:150px;padding:30px;background:#EDF3FF;color:#1F5FFF;font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">Lagos Live &nbsp;·&nbsp; Event boarding pass</div>`;
  const buyerLabel = d.guestName ? escapeEmailHtml(d.guestName) : escapeEmailHtml(d.to);
  const address = d.partyAddress ? `<div style="margin-top:4px;font-size:11px;line-height:17px;color:#4B586D;">${escapeEmailHtml(d.partyAddress)}</div>` : '';
  const promoRow = d.promoCode && d.promoDiscount
    ? `<div style="border-top:1px dashed #DCE3EF;background:#F8FAFF;padding:13px 16px;color:#35445C;font-size:11px;">Promo ${escapeEmailHtml(d.promoCode)} · You saved <strong style="color:#147A5A;">${escapeEmailHtml(options.formatMoney(d.promoDiscount))}</strong></div>`
    : '';

  return `
    <div style="margin:0;padding:24px 12px;background:#F5F7FC;font-family:Arial,Helvetica,sans-serif;color:#172033;">
      <div style="max-width:520px;margin:0 auto;">
        <div style="padding:18px 20px;background:#FFFFFF;border:1px solid #DCE3EF;border-bottom:0;border-radius:18px 18px 0 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr>
              <td valign="middle">
                <div style="font-size:12px;font-weight:900;letter-spacing:2.2px;color:#1F5FFF;text-transform:uppercase;">Lagos Live</div>
                <div style="margin-top:4px;font-size:9px;letter-spacing:1.3px;color:#68758A;text-transform:uppercase;">Your event ticket</div>
              </td>
              <td align="right" valign="middle"><span style="display:inline-block;padding:6px 10px;border-radius:999px;background:#E7F7F0;border:1px solid #B9E6D2;color:#147A5A;font-size:9px;font-weight:800;text-transform:uppercase;">&#10003; Confirmed</span></td>
            </tr>
          </table>
        </div>

        <div style="overflow:hidden;background:#FFFFFF;border:1px solid #DCE3EF;border-radius:0 0 18px 18px;">
          ${eventArtwork}
          <div style="padding:20px 21px 18px;background:#FFFFFF;">
            <div style="font-size:9px;font-weight:800;letter-spacing:1.7px;color:#1F5FFF;text-transform:uppercase;">You&apos;re going to</div>
            <div style="margin-top:6px;font-size:25px;font-weight:900;line-height:30px;letter-spacing:-.3px;color:#172033;word-break:break-word;">${escapeEmailHtml(d.partyTitle)}</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;border-collapse:collapse;">
              <tr>
                <td width="50%" valign="top" style="padding:0 10px 15px 0;">
                  <div style="font-size:8px;font-weight:800;letter-spacing:1.3px;color:#68758A;text-transform:uppercase;">Date</div>
                  <div style="margin-top:5px;font-size:12px;font-weight:700;line-height:17px;color:#172033;">${escapeEmailHtml(d.partyDate)}</div>
                </td>
                <td width="50%" valign="top" style="padding:0 0 15px 10px;">
                  <div style="font-size:8px;font-weight:800;letter-spacing:1.3px;color:#68758A;text-transform:uppercase;">Time</div>
                  <div style="margin-top:5px;font-size:12px;font-weight:700;line-height:17px;color:#172033;">${escapeEmailHtml(d.partyTime)}</div>
                </td>
              </tr>
              <tr>
                <td valign="top" style="padding:0 10px 0 0;">
                  <div style="font-size:8px;font-weight:800;letter-spacing:1.3px;color:#68758A;text-transform:uppercase;">Venue</div>
                  <div style="margin-top:5px;font-size:12px;font-weight:700;line-height:17px;color:#172033;">${escapeEmailHtml(d.partyLocation)}</div>${address}
                </td>
                <td valign="top" style="padding:0 0 0 10px;">
                  <div style="font-size:8px;font-weight:800;letter-spacing:1.3px;color:#68758A;text-transform:uppercase;">Ticket holder</div>
                  <div style="margin-top:5px;font-size:12px;font-weight:700;line-height:17px;color:#172033;word-break:break-word;">${buyerLabel}</div>
                </td>
              </tr>
            </table>
          </div>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-top:1px dashed #AEBBD0;">
            <tr>
              <td width="62%" valign="middle" bgcolor="${skin.stubFallback}" style="background-color:${skin.stubFallback};background:${skin.stubBackground};color:${skin.stubColor};padding:16px 18px;">
                <div style="font-size:8px;font-weight:800;letter-spacing:1.3px;opacity:.75;text-transform:uppercase;">${tierLabel}</div>
                <div style="margin-top:5px;font-size:15px;font-weight:900;letter-spacing:.2px;word-break:break-word;">${typeLabel}${earlyBirdMark}</div>
                <div style="margin-top:12px;font-size:8px;font-weight:800;letter-spacing:1.3px;opacity:.75;text-transform:uppercase;">Pass code</div>
                <div style="margin-top:4px;font-family:'Courier New',monospace;font-size:10px;font-weight:700;word-break:break-all;">${escapeEmailHtml(d.orderRef)}</div>
              </td>
              <td width="38%" align="right" valign="middle" bgcolor="${skin.stubFallback}" style="background-color:${skin.stubFallback};background:${skin.stubBackground};color:${skin.stubColor};padding:16px 18px;border-left:1px dashed rgba(23,32,51,.28);">
                <div style="font-size:8px;font-weight:800;letter-spacing:1.2px;opacity:.75;text-transform:uppercase;">Admit</div>
                <div style="margin-top:4px;font-size:16px;font-weight:900;">${quantityLabel(d.quantity)}</div>
                <div style="margin-top:10px;font-size:8px;font-weight:800;letter-spacing:1.2px;opacity:.75;text-transform:uppercase;">Paid</div>
                <div style="margin-top:3px;font-size:13px;font-weight:900;">${totalLabel}</div>
              </td>
            </tr>
          </table>
          ${promoRow}
        </div>

        <div style="margin-top:14px;padding:20px 18px;background:#FFFFFF;border:1px solid #DCE3EF;border-radius:16px;text-align:center;">
          <div style="font-size:15px;font-weight:900;color:#172033;">Your scan-ready ticket is ready</div>
          <div style="margin:7px auto 16px;max-width:410px;font-size:11px;line-height:18px;color:#4B586D;">Open your ticket to view its QR code, then choose Download ticket and save as PDF for offline entry.</div>
          <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="border-collapse:collapse;">
            <tr><td align="center" bgcolor="#1F5FFF" style="border-radius:10px;background:#1F5FFF;"><a href="${escapeEmailHtml(d.ticketUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:13px 24px;border-radius:10px;color:#FFFFFF;font-size:13px;font-weight:800;text-decoration:none;">Open &amp; download ticket</a></td></tr>
          </table>
          <div style="margin-top:11px;font-size:9px;line-height:15px;color:#68758A;">Keep your QR code private; it is used to validate entry.</div>
        </div>

        <div style="padding:14px 4px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr><td style="padding:4px 0;font-size:9px;color:#68758A;">Order reference</td><td align="right" style="padding:4px 0;font-family:'Courier New',monospace;font-size:9px;font-weight:700;color:#35445C;">${escapeEmailHtml(d.orderRef)}</td></tr>
            <tr><td style="padding:4px 0;font-size:9px;color:#68758A;">Purchased by</td><td align="right" style="padding:4px 0;font-size:9px;font-weight:700;color:#35445C;">${buyerLabel}</td></tr>
            <tr><td style="padding:4px 0;font-size:9px;color:#68758A;">Payment date</td><td align="right" style="padding:4px 0;font-size:9px;font-weight:700;color:#35445C;">${escapeEmailHtml(options.paymentDate)}</td></tr>
          </table>
        </div>
        <div style="margin-top:13px;padding:14px 15px;background:#E9EEF7;border:1px solid #DCE3EF;border-radius:12px;">
          <div style="font-size:11px;font-weight:800;color:#172033;">At the entrance</div>
          <div style="margin-top:5px;font-size:10px;line-height:16px;color:#4B586D;">Show the QR code on your Lagos Live ticket for scanning. Save the ticket as a PDF before you leave in case your connection is unreliable.</div>
        </div>
        <div style="padding:17px 8px 0;text-align:center;">
          <div style="font-size:9px;line-height:16px;color:#68758A;">Didn&apos;t purchase this ticket? <a href="${escapeEmailHtml(options.supportUrl)}/support" target="_blank" style="color:#1F5FFF;text-decoration:none;font-weight:700;">Contact Lagos Live</a></div>
          <div style="margin-top:14px;font-size:10px;font-weight:800;letter-spacing:2px;color:#1F5FFF;text-transform:uppercase;">Lagos Live</div>
          <div style="margin-top:4px;font-size:9px;color:#68758A;">Discover. Book. Experience Lagos.</div>
        </div>
      </div>
    </div>
  `;
}
