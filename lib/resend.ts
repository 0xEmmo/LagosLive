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

function ticketEmailHtml(d: TicketConfirmationData): string {
  const lines = [d.partyTitle, d.partyDate, d.partyTime, d.partyLocation]
    .map((line) => (line ? `<tr><td style="font-size:14px;line-height:22px;color:#FFFFFF;padding:0 0 6px 0;">${escapeHtml(line)}</td></tr>` : ''))
    .join('');
  return `
    <div style="background-color:#0B0B10;margin:0;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
      <div style="max-width:480px;margin:0 auto;background-color:#12121C;border-radius:24px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
        <div style="padding:32px 28px 28px 28px;background:linear-gradient(135deg,#1A0B16 0%,#12121C 60%);">
          <div style="font-size:11px;font-weight:700;letter-spacing:3px;color:#FF2D95;text-transform:uppercase;">Lagos&nbsp;Live</div>
          <div style="font-size:24px;font-weight:800;color:#FFFFFF;margin-top:8px;letter-spacing:0.5px;">You're in!</div>
          <div style="font-size:14px;color:#A7A8B5;margin-top:6px;line-height:20px;">Your ${d.quantity} ${d.quantity === 1 ? 'ticket' : 'tickets'} for <strong style="color:#FFFFFF;">${escapeHtml(d.partyTitle)}</strong> are confirmed.</div>
        </div>
        <div style="padding:24px 28px 28px 28px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            ${lines}
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-top:1px dashed rgba(255,255,255,0.14);margin-top:16px;">
            <tr>
              <td style="padding:16px 0 4px 0;font-size:11px;letter-spacing:1px;color:#6B6C80;text-transform:uppercase;">Ticket Code</td>
            </tr>
            <tr>
              <td style="padding:0 0 12px 0;font-size:14px;font-weight:700;color:#FFFFFF;letter-spacing:0.5px;">${escapeHtml(d.orderRef)}</td>
            </tr>
            <tr>
              <td style="padding:0 0 6px 0;font-size:12px;color:#A7A8B5;">${escapeHtml(d.ticketTypeName)} &times; ${d.quantity}</td>
            </tr>
            <tr>
              <td style="padding:0 0 20px 0;font-size:14px;font-weight:700;color:#FFFFFF;">${d.total === 0 ? 'Free' : escapeHtml(formatNaira(d.total))}</td>
            </tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr>
              <td align="center" style="padding:8px 0 0 0;">
                <a href="${escapeHtml(d.ticketUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:15px 32px;border-radius:14px;background:linear-gradient(135deg,#FF2D95,#8A2BE2);color:#FFFFFF;font-size:14px;font-weight:700;text-decoration:none;">View My Ticket</a>
              </td>
            </tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:24px;">
            <tr>
              <td style="font-size:12px;line-height:18px;color:#6B6C80;">Show the QR code at the entrance. If you didn't make this purchase, you can safely ignore this email.</td>
            </tr>
          </table>
        </div>
      </div>
    </div>
  `;
}

// Best-effort send. Never throws: a payment must not fail because an email
// couldn't be delivered. Missing key / bad request / network error all just
// log and return false.
export async function sendTicketConfirmation(data: TicketConfirmationData): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[resend] RESEND_API_KEY is not configured — skipping ticket email to', data.to);
    return false;
  }
  try {
    const res = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Lagos Live <tickets@lagoslive.ng>',
        to: [data.to],
        subject: `Your ticket for ${data.partyTitle} — Lagos Live`,
        html: ticketEmailHtml(data),
      }),
    });
    if (!res.ok) {
      console.warn(`[resend] send failed (${res.status}) for`, data.to, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[resend] unexpected error sending to', data.to, err);
    return false;
  }
}
