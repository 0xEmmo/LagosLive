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
  return `\u00d7${quantity}`;
}

/** Render a ticket email body; the sender wraps it in the selected color scheme. */
export function renderTicketEmailHtml(
  d: TicketEmailData,
  skin: EmailTicketSkin,
  options: TicketEmailOptions
): string {
  const totalLabel = d.total === 0 ? 'Free' : escapeEmailHtml(options.formatMoney(d.total));
  const typeLabel = escapeEmailHtml(d.ticketTypeName).toUpperCase();
  const qty = quantityLabel(d.quantity);
  const imageUrl = safeTicketImageUrl(d.partyImageUrl);
  const tierLabel = skin.kind === 'gold' ? 'VIP ADMISSION' : skin.kind === 'silver' ? 'VVIP ADMISSION' : skin.kind === 'early' ? 'EARLY BIRD' : 'GENERAL ADMISSION';
  const earlyBirdMark = skin.kind === 'early' ? ' <span style="font-size:16px;vertical-align:middle;">🐦</span>' : '';
  const eventArtwork = imageUrl
    ? `<img src="${escapeEmailHtml(imageUrl)}" alt="${escapeEmailHtml(d.partyTitle)} event artwork" width="600" style="display:block;width:100%;height:190px;object-fit:cover;border:0;">`
    : `<div style="height:110px;padding:30px 24px;background-color:#0D1E3A;color:#A8EFFF;font-size:11px;font-weight:800;letter-spacing:3px;text-transform:uppercase;">Lagos Live &nbsp;·&nbsp; Event boarding pass</div>`;
  const buyerLabel = d.guestName
    ? `${escapeEmailHtml(d.guestName)}${d.guestPhone ? ` &nbsp;·&nbsp; ${escapeEmailHtml(d.guestPhone)}` : ''}`
    : escapeEmailHtml(d.to);
  const addressRow = d.partyAddress
    ? `<div style="font-size:11px;line-height:17px;color:#AFC2E0;margin-top:3px;word-break:break-word;">${escapeEmailHtml(d.partyAddress)}</div>`
    : '';
  const promoRow =
    d.promoCode && d.promoDiscount
      ? `
        <div style="padding:14px 18px 16px 18px;border-top:1px dashed #DCE3EF;background:#FFFFFF;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr>
              <td>
                <div style="font-size:10px;color:#68758A;letter-spacing:1.3px;text-transform:uppercase;margin-bottom:5px;">Promo ${escapeEmailHtml(d.promoCode)}</div>
                <div style="font-size:11px;font-weight:700;color:#147A5A;">You saved ${escapeEmailHtml(options.formatMoney(d.promoDiscount))}</div>
              </td>
              <td align="right" valign="bottom">
                <div style="font-size:13px;font-weight:900;color:#147A5A;">-${escapeEmailHtml(options.formatMoney(d.promoDiscount))}</div>
              </td>
            </tr>
          </table>
        </div>`
      : '';

  return `
    <div style="background:#F5F7FC;margin:0;padding:24px 10px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#172033;">
      <div style="max-width:600px;margin:0 auto;">
        <div style="padding:22px 22px 18px;background:#FFFFFF;border:1px solid #DCE3EF;border-bottom:0;border-radius:20px 20px 0 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr>
              <td valign="middle">
                <div style="font-size:12px;font-weight:900;letter-spacing:2.4px;color:#1F5FFF;text-transform:uppercase;">Lagos Live</div>
                <div style="font-size:10px;color:#68758A;margin-top:5px;letter-spacing:1.4px;text-transform:uppercase;">Your event boarding pass</div>
              </td>
              <td align="right" valign="middle">
                <span style="display:inline-block;background:#E7F7F0;border:1px solid #B9E6D2;border-radius:999px;padding:7px 11px;color:#147A5A;font-size:10px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;">&#10003; Confirmed</span>
              </td>
            </tr>
          </table>
        </div>

        <div style="overflow:hidden;background:#07152C;border:1px solid #23395E;border-radius:0 0 20px 20px;">
          ${eventArtwork}
          <div style="padding:22px 22px 20px;background:#07152C;color:#FFFFFF;">
            <div style="font-size:9px;font-weight:800;letter-spacing:2px;color:#A8EFFF;text-transform:uppercase;">Admit to</div>
            <div style="font-size:27px;font-weight:900;line-height:32px;letter-spacing:-.3px;color:#FFFFFF;margin-top:6px;word-break:break-word;">${escapeEmailHtml(d.partyTitle)}</div>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:21px;">
              <tr>
                <td width="43%" valign="top">
                  <div style="font-size:9px;font-weight:700;letter-spacing:1.5px;color:#AFC2E0;text-transform:uppercase;">From</div>
                  <div style="font-size:20px;font-weight:800;letter-spacing:.5px;color:#A8EFFF;margin-top:5px;">LAGOS</div>
                  <div style="font-size:10px;color:#AFC2E0;">Lagos Live</div>
                </td>
                <td width="14%" align="center" valign="middle" style="font-size:24px;color:#62D8FF;">&#8594;</td>
                <td width="43%" valign="top">
                  <div style="font-size:9px;font-weight:700;letter-spacing:1.5px;color:#AFC2E0;text-transform:uppercase;">To &middot; venue</div>
                  <div style="font-size:17px;font-weight:800;line-height:21px;color:#A8EFFF;margin-top:5px;word-break:break-word;">${escapeEmailHtml(d.partyLocation)}</div>
                  ${addressRow}
                </td>
              </tr>
            </table>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-top:1px solid #294161;margin-top:19px;padding-top:13px;">
              <tr>
                <td width="50%" valign="top" style="padding-top:13px;padding-right:10px;">
                  <div style="font-size:8px;font-weight:700;letter-spacing:1.4px;color:#AFC2E0;text-transform:uppercase;">Date</div>
                  <div style="font-size:12px;font-weight:700;color:#FFFFFF;margin-top:5px;line-height:17px;">${escapeEmailHtml(d.partyDate)}</div>
                </td>
                <td width="50%" valign="top" style="padding-top:13px;padding-left:10px;">
                  <div style="font-size:8px;font-weight:700;letter-spacing:1.4px;color:#AFC2E0;text-transform:uppercase;">Time</div>
                  <div style="font-size:12px;font-weight:700;color:#FFFFFF;margin-top:5px;line-height:17px;">${escapeEmailHtml(d.partyTime)}</div>
                </td>
              </tr>
              <tr>
                <td colspan="2" valign="top" style="padding-top:12px;">
                  <div style="font-size:8px;font-weight:700;letter-spacing:1.4px;color:#AFC2E0;text-transform:uppercase;">Passenger</div>
                  <div style="font-size:12px;font-weight:700;color:#FFFFFF;margin-top:5px;line-height:17px;word-break:break-word;">${d.guestName ? escapeEmailHtml(d.guestName) : escapeEmailHtml(d.to)}</div>
                </td>
              </tr>
            </table>
          </div>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-top:1px dashed rgba(7,21,44,.4);">
            <tr>
              <td width="66%" valign="middle" bgcolor="${skin.stubFallback}" style="background-color:${skin.stubFallback};background:${skin.stubBackground};color:${skin.stubColor};padding:17px 20px;">
                <div style="font-size:8px;font-weight:800;letter-spacing:1.5px;opacity:.72;text-transform:uppercase;">${tierLabel}</div>
                <div style="font-size:16px;font-weight:900;letter-spacing:.4px;margin-top:5px;word-break:break-word;">${typeLabel}${earlyBirdMark}</div>
                <div style="font-size:8px;font-weight:800;letter-spacing:1.3px;margin-top:13px;opacity:.72;text-transform:uppercase;">Pass code</div>
                <div style="font-size:11px;font-weight:800;letter-spacing:.6px;font-family:'Courier New',monospace;margin-top:4px;word-break:break-all;">${escapeEmailHtml(d.orderRef)}</div>
              </td>
              <td width="34%" align="right" valign="middle" bgcolor="${skin.stubFallback}" style="background-color:${skin.stubFallback};background:${skin.stubBackground};color:${skin.stubColor};padding:17px 20px;border-left:1px dashed rgba(7,21,44,.36);">
                <div style="font-size:8px;font-weight:800;letter-spacing:1.3px;opacity:.72;text-transform:uppercase;">Admit</div>
                <div style="font-size:17px;font-weight:900;margin-top:4px;">${qty}</div>
                <div style="font-size:8px;font-weight:800;letter-spacing:1.3px;opacity:.72;text-transform:uppercase;margin-top:10px;">Paid</div>
                <div style="font-size:14px;font-weight:900;margin-top:3px;">${totalLabel}</div>
              </td>
            </tr>
          </table>
          ${promoRow}
        </div>

        <div style="margin-top:16px;padding:22px 20px;background:#FFFFFF;border:1px solid #DCE3EF;border-radius:18px;text-align:center;">
          <div style="font-size:16px;font-weight:900;color:#172033;margin-bottom:6px;">Your scan-ready ticket is ready</div>
          <div style="font-size:12px;line-height:19px;color:#4B586D;margin-bottom:17px;">Open your ticket to see its QR code and full details. At the ticket page, choose <strong>Download ticket</strong> and save as PDF for offline access.</div>
          <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="border-collapse:collapse;">
            <tr>
              <td align="center" bgcolor="#1F5FFF" style="border-radius:11px;background:#1F5FFF;">
                <a href="${escapeEmailHtml(d.ticketUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 27px;border-radius:11px;color:#FFFFFF;font-size:14px;font-weight:800;text-decoration:none;letter-spacing:.1px;">Open &amp; download ticket</a>
              </td>
            </tr>
          </table>
          <div style="font-size:10px;line-height:16px;color:#68758A;margin-top:12px;">Keep the QR code private; it is used to validate entry.</div>
        </div>

        <div style="padding:18px 4px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr>
              <td style="font-size:10px;color:#68758A;padding:5px 0;">Order reference</td>
              <td align="right" style="font-size:10px;font-weight:700;color:#35445C;font-family:'Courier New',monospace;padding:5px 0;">${escapeEmailHtml(d.orderRef)}</td>
            </tr>
            <tr>
              <td style="font-size:10px;color:#68758A;padding:5px 0;">Purchased by</td>
              <td align="right" style="font-size:10px;font-weight:700;color:#35445C;padding:5px 0;">${buyerLabel}</td>
            </tr>
            <tr>
              <td style="font-size:10px;color:#68758A;padding:5px 0;">Payment date</td>
              <td align="right" style="font-size:10px;font-weight:700;color:#35445C;padding:5px 0;">${escapeEmailHtml(options.paymentDate)}</td>
            </tr>
          </table>
        </div>

        <div style="margin-top:17px;padding:16px;background:#E9EEF7;border:1px solid #DCE3EF;border-radius:14px;">
          <div style="font-size:12px;font-weight:800;color:#172033;margin-bottom:6px;">At the entrance</div>
          <div style="font-size:11px;line-height:18px;color:#4B586D;">Open your Lagos Live ticket and present its QR code to be scanned. Save the ticket as a PDF before you leave in case your connection is unreliable.</div>
        </div>
        <div style="text-align:center;padding:18px 8px 0;">
          <div style="font-size:10px;color:#68758A;line-height:17px;">Didn't purchase this ticket? <a href="${escapeEmailHtml(options.supportUrl)}/support" target="_blank" style="color:#1F5FFF;text-decoration:none;font-weight:700;">Contact Lagos Live</a></div>
          <div style="font-size:10px;font-weight:800;letter-spacing:2px;color:#1F5FFF;text-transform:uppercase;margin-top:17px;">Lagos Live</div>
          <div style="font-size:10px;color:#68758A;margin-top:5px;">Discover. Book. Experience Lagos.</div>
        </div>
      </div>
    </div>
  `;
}
