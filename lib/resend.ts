// Server-only Resend email helper. Reads RESEND_API_KEY and must NEVER be
// imported from a client component. Sending is strictly best-effort: the
// return value is just a boolean, and callers must treat a failed send as
// informational — a confirmed payment stays confirmed either way.

import { formatNaira } from './filters';

const RESEND_API = 'https://api.resend.com/emails';

export interface TicketConfirmationData {
  to: string;
  partyTitle: string;
  partyDate: string;
  partyTime: string;
  partyLocation: string;
  ticketTypeName: string;
  quantity: number;
  total: number;
  orderRef: string;
  ticketUrl: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPaymentDate(date = new Date()): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function qtyLabel(qty: number): string {
  return `\u00d7${qty}`;
}

// Premium Lagos Live ticket-confirmation email. All values are escaped and
// injected at render time — nothing is hardcoded. Event info arrives on the
// `data` object; the secure ticket URL is hidden inside the CTA's href (never
// displayed as a raw link). Uses table-based layout and inline styles so it
// renders reliably in Gmail, Outlook, Apple Mail, and light/dark modes.
function ticketEmailHtml(d: TicketConfirmationData): string {
  const totalLabel = d.total === 0 ? 'Free' : escapeHtml(formatNaira(d.total));
  const paymentDate = formatPaymentDate();
  const typeLabel = escapeHtml(d.ticketTypeName).toUpperCase();
  const qty = qtyLabel(d.quantity);

  return `
    <div style="background-color:#0B0B10;margin:0;padding:32px 12px;font-family:Segoe UI, Roboto, Helvetica, Arial, sans-serif;">
      <div style="max-width:520px;margin:0 auto;background-color:#12121C;border-radius:24px;overflow:hidden;border:1px solid #26263A;">

        <div style="padding:38px 30px 28px 30px;background:linear-gradient(135deg,#1A0B16 0%,#12121C 60%);border-bottom:1px solid rgba(255,45,149,0.22);">
          <div style="font-size:11px;font-weight:800;letter-spacing:3px;color:#FF2D95;text-transform:uppercase;">Lagos&nbsp;Live</div>
          <div style="font-size:30px;font-weight:900;color:#FFFFFF;margin-top:14px;letter-spacing:-0.4px;line-height:36px;">You're officially in. \ud83c\udf89</div>
          <div style="font-size:14px;color:#A7A8B5;margin-top:9px;line-height:21px;">Your ticket for <strong style="color:#FFFFFF;">${escapeHtml(d.partyTitle)}</strong> has been confirmed.</div>
          <div style="display:inline-block;margin-top:20px;background:rgba(50,205,150,0.12);border:1px solid rgba(50,205,150,0.28);border-radius:999px;padding:7px 13px;">
            <span style="font-size:11px;font-weight:800;letter-spacing:1px;color:#5DE0B1;text-transform:uppercase;">\u2713 Payment Confirmed</span>
          </div>
          <div style="font-size:12px;color:#6B6C80;margin-top:10px;">${escapeHtml(paymentDate)}</div>
        </div>

        <div style="padding:26px 30px 0 30px;">
          <div style="font-size:10px;font-weight:800;letter-spacing:2px;color:#6B6C80;text-transform:uppercase;margin-bottom:8px;">Your Event</div>
          <div style="font-size:23px;font-weight:900;color:#FFFFFF;letter-spacing:-0.4px;line-height:29px;">${escapeHtml(d.partyTitle)}</div>
        </div>

        <div style="padding:16px 30px 0 30px;">
          <div style="background:linear-gradient(135deg,rgba(255,45,149,0.10),rgba(138,43,226,0.08));border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:18px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
              <tr>
                <td width="50%" valign="top" style="padding-bottom:17px;">
                  <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;color:#6B6C80;text-transform:uppercase;margin-bottom:5px;">Date</div>
                  <div style="font-size:14px;font-weight:700;color:#FFFFFF;line-height:20px;">${escapeHtml(d.partyDate)}</div>
                </td>
                <td width="50%" valign="top" style="padding-bottom:17px;">
                  <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;color:#6B6C80;text-transform:uppercase;margin-bottom:5px;">Time</div>
                  <div style="font-size:14px;font-weight:700;color:#FFFFFF;line-height:20px;">${escapeHtml(d.partyTime)}</div>
                </td>
              </tr>
              <tr>
                <td colspan="2" valign="top">
                  <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;color:#6B6C80;text-transform:uppercase;margin-bottom:5px;">Location</div>
                  <div style="font-size:14px;font-weight:700;color:#FFFFFF;line-height:20px;">${escapeHtml(d.partyLocation)}</div>
                </td>
              </tr>
            </table>
          </div>
        </div>

        <div style="padding:28px 30px 0 30px;">
          <div style="font-size:10px;font-weight:800;letter-spacing:2px;color:#6B6C80;text-transform:uppercase;margin-bottom:12px;">Ticket Details</div>
          <div style="background-color:#0B0B10;border:1px solid rgba(255,255,255,0.07);border-radius:16px;overflow:hidden;">
            <div style="padding:18px 18px 14px 18px;border-bottom:1px dashed rgba(255,255,255,0.12);">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                <tr>
                  <td>
                    <div style="font-size:10px;color:#6B6C80;letter-spacing:1.3px;text-transform:uppercase;margin-bottom:6px;">Ticket</div>
                    <div style="font-size:15px;font-weight:800;color:#FFFFFF;">${typeLabel} <span style="color:#A7A8B5;">${qty}</span></div>
                  </td>
                  <td align="right" valign="bottom">
                    <div style="font-size:19px;font-weight:900;color:#FFFFFF;">${totalLabel}</div>
                  </td>
                </tr>
              </table>
            </div>
            <div style="padding:16px 18px;">
              <div style="font-size:10px;color:#6B6C80;letter-spacing:1.3px;text-transform:uppercase;margin-bottom:7px;">Ticket Code</div>
              <div style="font-size:15px;font-weight:800;color:#FF2D95;letter-spacing:1px;font-family:'Courier New', monospace;word-break:break-all;">${escapeHtml(d.orderRef)}</div>
            </div>
          </div>
        </div>

        <div style="padding:26px 30px 4px 30px;">
          <div style="background:linear-gradient(135deg,#FF2D95 0%,#8A2BE2 100%);border-radius:16px;padding:1px;">
            <div style="background:#15121C;border-radius:15px;padding:22px 20px;text-align:center;">
              <div style="font-size:16px;font-weight:900;color:#FFFFFF;margin-bottom:6px;">Your ticket is ready \ud83c\udf9f\ufe0f</div>
              <div style="font-size:12px;color:#A7A8B5;line-height:18px;margin-bottom:18px;">Open your digital ticket to view your QR code and full ticket details before you arrive.</div>
              <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="border-collapse:collapse;">
                <tr>
                  <td align="center" style="border-radius:11px;background:linear-gradient(135deg,#FF2D95,#8A2BE2);">
                    <a href="${escapeHtml(d.ticketUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:15px 30px;border-radius:11px;color:#FFFFFF;font-size:14px;font-weight:800;text-decoration:none;letter-spacing:0.1px;">View Ticket &amp; QR Code</a>
                  </td>
                </tr>
              </table>
            </div>
          </div>
        </div>

        <div style="padding:24px 30px 0 30px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-top:1px solid rgba(255,255,255,0.07);">
            <tr>
              <td style="padding-top:17px;font-size:11px;color:#6B6C80;">Order Reference</td>
              <td align="right" style="padding-top:17px;font-size:11px;font-weight:700;color:#A7A8B5;font-family:'Courier New', monospace;">${escapeHtml(d.orderRef)}</td>
            </tr>
            <tr>
              <td style="padding-top:9px;font-size:11px;color:#6B6C80;">Purchased by</td>
              <td align="right" style="padding-top:9px;font-size:11px;font-weight:700;color:#A7A8B5;">${escapeHtml(d.to)}</td>
            </tr>
          </table>
        </div>

        <div style="padding:24px 30px 28px 30px;">
          <div style="background:rgba(138,43,226,0.06);border:1px solid rgba(138,43,226,0.12);border-radius:14px;padding:17px;">
            <div style="font-size:12px;font-weight:800;color:#FFFFFF;margin-bottom:7px;">At the entrance</div>
            <div style="font-size:11px;line-height:18px;color:#A7A8B5;">Open your Lagos Live ticket and present the QR code to be scanned. Save your ticket to your phone before heading out so you don't need an internet connection at the venue.</div>
          </div>
          <div style="text-align:center;padding-top:22px;">
            <div style="font-size:11px;color:#6B6C80;line-height:17px;">Didn't purchase this ticket? <a href="https://lagos-live.vercel.app/support" target="_blank" style="color:#FF2D95;text-decoration:none;font-weight:700;">Contact Lagos Live</a></div>
          </div>
        </div>

        <div style="padding:22px 30px 24px 30px;background:#0D0D13;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
          <div style="font-size:11px;font-weight:800;letter-spacing:2.5px;color:#FF2D95;text-transform:uppercase;">Lagos Live</div>
          <div style="font-size:10px;color:#555666;margin-top:7px;">Discover. Book. Experience Lagos.</div>
        </div>

      </div>
    </div>
  `;
}

// Best-effort send. Never throws: a payment must not fail because an email
// couldn't be delivered. Missing key / bad request / network error all just
// log and return false, but with enough detail to diagnose delivery problems.
export async function sendTicketConfirmation(data: TicketConfirmationData): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;

  // Sender is configurable via RESEND_FROM_EMAIL. Falls back to the Resend
  // onboarding address (guaranteed to exist on every account) so a hardcoded or
  // unverified domain never silently blocks delivery.
  const from = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

  console.log('[resend] starting ticket email send', {
    to: data.to,
    subject: `Your ${data.partyTitle} ticket is confirmed — Lagos Live`,
    orderRef: data.orderRef,
  });
  console.log('[resend] config', {
    apiKey: apiKey ? `SET (len ${apiKey.length})` : 'MISSING',
    from,
    to: data.to,
  });

  if (!apiKey) {
    console.warn('[resend] RESEND_API_KEY is not configured — skipping ticket email to', data.to);
    return false;
  }

  try {
    const response = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [data.to],
        subject: `Your ${data.partyTitle} ticket is confirmed — Lagos Live`,
        html: ticketEmailHtml(data),
      }),
    });

    const bodyText = await response.text();
    if (!response.ok) {
      console.error('[resend] send failed', {
        status: response.status,
        to: data.to,
        from,
        responseBody: bodyText,
      });
      return false;
    }

    let id: string | undefined;
    try {
      id = (JSON.parse(bodyText) as { id?: string }).id;
    } catch {
      /* non-JSON success body — fine */
    }
    console.log('[resend] send succeeded', { to: data.to, id });
    return true;
  } catch (err) {
    console.error('[resend] unexpected error sending to', data.to, err);
    return false;
  }
}
