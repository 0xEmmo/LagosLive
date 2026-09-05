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

export interface PayoutStatusEmailData {
  to: string;
  hostName: string;
  amount: number; // kobo
  status: 'pending' | 'processing' | 'approved' | 'paid' | 'rejected';
  payoutDate?: string;
}

const PAYOUT_MESSAGES: Record<PayoutStatusEmailData['status'], string> = {
  pending: 'Your payout request has been received and is awaiting review.',
  processing: 'Your payout is being processed. You should see it in your bank within 1-2 business days.',
  approved: 'Your payout has been approved and will be processed soon.',
  paid: 'Your payout has been completed! Check your bank account.',
  rejected: 'Your payout request was not approved. Please contact support for details.',
};

export async function sendPayoutStatusEmail(data: PayoutStatusEmailData): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[resend] RESEND_API_KEY is not configured — skipping payout email to', data.to);
    return false;
  }
  const from = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
  const line = `<tr>
    <td style="padding:8px 0;"><span style="color:#6B6C80;">Amount</span><br/><strong style="color:#FFFFFF;">${formatNaira(data.amount)}</strong></td>
    <td style="padding:8px 0;"><span style="color:#6B6C80;">Status</span><br/><strong style="color:#00F5D4;text-transform:uppercase;">${data.status}</strong></td>
  </tr>`;
  const when = data.payoutDate
    ? `<tr><td style="padding:8px 0;"><span style="color:#6B6C80;">Processed</span><br/><span style="color:#FFFFFF;">${data.payoutDate}</span></td></tr>`
    : '';
  const html = `
    <div style="background:#07070B;padding:32px;font-family:Arial,sans-serif;">
      <div style="max-width:480px;margin:0 auto;background:#171725;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:28px;">
        <div style="font-size:18px;font-weight:800;color:#FF2D95;margin-bottom:20px;">Lagos&nbsp;Live</div>
        <h2 style="color:#FFFFFF;font-size:20px;margin:0 0 8px;">Payout Update</h2>
        <p style="color:#D5D6E0;font-size:14px;line-height:1.6;margin:0 0 16px;">Hi ${data.hostName},</p>
        <p style="color:#D5D6E0;font-size:14px;line-height:1.6;margin:0 0 16px;">${PAYOUT_MESSAGES[data.status]}</p>
        <table role="presentation" style="width:100%;color:#D5D6E0;font-size:13px;">${line}${when}</table>
        <p style="color:#A7A8B5;font-size:13px;line-height:1.6;margin:20px 0 0;">Login to your host dashboard to view the full details.</p>
        <p style="color:#6B6C80;font-size:12px;margin:24px 0 0;">— Lagos Live Team</p>
      </div>
    </div>`;
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
        subject: `Lagos Live — Payout ${data.status.toUpperCase()}`,
        html,
      }),
    });
    const bodyText = await response.text();
    if (!response.ok) {
      console.error('[resend] payout email send failed', { status: response.status, to: data.to, responseBody: bodyText });
      return false;
    }
    console.log('[resend] payout email send succeeded', { to: data.to, status: data.status });
    return true;
  } catch (err) {
    console.error('[resend] unexpected error sending payout email to', data.to, err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Batch 18 — transactional emails (best-effort, same pattern as the others).
// ---------------------------------------------------------------------------

interface SendHtmlEmailArgs {
  to: string;
  subject: string;
  html: string;
  scheduledAt?: string;
}

// Shared best-effort sender for the Batch 18 emails. Never throws: every
// delivery problem is logged and the caller gets a boolean back.
async function sendHtmlEmail({ to, subject, html, scheduledAt }: SendHtmlEmailArgs): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[resend] RESEND_API_KEY is not configured — skipping email to', to);
    return false;
  }
  const from = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
  try {
    const response = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
        ...(scheduledAt ? { scheduled_at: scheduledAt } : {}),
      }),
    });
    const bodyText = await response.text();
    if (!response.ok) {
      console.error('[resend] send failed', { status: response.status, to, subject, responseBody: bodyText });
      return false;
    }
    console.log('[resend] send succeeded', { to, subject });
    return true;
  } catch (err) {
    console.error('[resend] unexpected error sending to', to, err);
    return false;
  }
}

export interface EventCancellationEmailData {
  to: string;
  guestName: string;
  partyTitle: string;
  reason: string;
  amountNaira: number;
}

// Sent to every guest of a cancelled event, right after the refund is issued.
export async function sendEventCancellationEmail(data: EventCancellationEmailData): Promise<boolean> {
  const amountLabel = data.amountNaira >= 0 ? escapeHtml(formatNaira(data.amountNaira)) : '';
  const payoutCopy = data.amountNaira > 0
    ? `<div style="margin-top:14px;background:rgba(50,205,150,0.10);border:1px solid rgba(50,205,150,0.25);border-radius:12px;padding:14px 16px;">
         <span style="font-size:12px;font-weight:800;color:#5DE0B1;text-transform:uppercase;letter-spacing:1px;">\u2713 Full refund processed</span>
         <div style="font-size:13px;color:#FFFFFF;margin-top:4px;">${amountLabel} is on its way back to your original payment method.</div>
       </div>`
    : '';
  const html = `
    <div style="background-color:#0B0B10;margin:0;padding:32px 12px;font-family:Segoe UI, Roboto, Helvetica, Arial, sans-serif;">
      <div style="max-width:520px;margin:0 auto;background-color:#12121C;border-radius:24px;overflow:hidden;border:1px solid #26263A;">
        <div style="padding:34px 30px 24px 30px;background:linear-gradient(135deg,#2E0B14 0%,#12121C 60%);border-bottom:1px solid rgba(255,45,149,0.22);">
          <div style="font-size:11px;font-weight:800;letter-spacing:3px;color:#FF2D95;text-transform:uppercase;">Lagos&nbsp;Live</div>
          <div style="font-size:28px;font-weight:900;color:#FFFFFF;margin-top:12px;line-height:34px;">Event Cancelled</div>
          <div style="display:inline-block;margin-top:16px;background:rgba(255,45,149,0.12);border:1px solid rgba(255,45,149,0.28);border-radius:999px;padding:6px 13px;">
            <span style="font-size:10px;font-weight:800;letter-spacing:1px;color:#FF2D95;text-transform:uppercase;">\u2716 Cancelled</span>
          </div>
        </div>
        <div style="padding:26px 30px 30px 30px;">
          <p style="font-size:14px;line-height:22px;color:#D5D6E0;margin:0 0 8px;">Hi ${escapeHtml(data.guestName)},</p>
          <p style="font-size:14px;line-height:22px;color:#D5D6E0;margin:0;">We're sorry to share that <strong style="color:#FFFFFF;">${escapeHtml(data.partyTitle)}</strong> has been cancelled.</p>
          <div style="margin-top:16px;background:#0B0B10;border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:16px;">
            <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;color:#6B6C80;text-transform:uppercase;margin-bottom:6px;">Reason</div>
            <div style="font-size:14px;color:#FFFFFF;">${escapeHtml(data.reason)}</div>
          </div>
          ${payoutCopy}
          <p style="font-size:13px;color:#A7A8B5;line-height:20px;margin:18px 0 0;">Refunds typically appear within 1-2 business days. If you don't see it, email <a href="mailto:support@lagoslive.ng" style="color:#FF2D95;text-decoration:none;font-weight:700;">support@lagoslive.ng</a>.</p>
          <p style="font-size:12px;color:#6B6C80;margin:22px 0 0;line-height:18px;">— Lagos Live Team</p>
        </div>
      </div>
    </div>`;
  return sendHtmlEmail({
    to: data.to,
    subject: `Event Cancelled — Refund on the way · ${data.partyTitle}`,
    html,
  });
}

const RESEND_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://lagos-live.vercel.app';

export interface HostVerificationEmailData {
  to: string;
  hostName: string;
  decision: 'approved' | 'rejected' | 'suspended';
  reason?: string;
}

const VERIFICATION_INTRO: Record<HostVerificationEmailData['decision'], string> = {
  approved: 'Great news — your host account is now verified.',
  rejected: `We couldn't verify your host account yet.`,
  suspended: 'Your host account has been suspended.',
};

const VERIFICATION_COPY: Record<HostVerificationEmailData['decision'], string> = {
  approved:
    'You can now list events on Lagos Live and request payouts. Verified hosts get the public "Verified Host" badge next to their events so buyers know they are dealing with a real operator.',
  rejected:
    'An admin reviewed your details. Update your host profile with accurate business information and request verification again.',
  suspended:
    'You can no longer list new events or request payouts while suspended. If you believe this is a mistake, reply to this email or contact support@lagoslive.ng.',
};

// Sent to hosts when an admin resolves their verification request. Best-effort.
export async function sendHostVerificationEmail(data: HostVerificationEmailData): Promise<boolean> {
  const reasonBlock = data.reason
    ? `<div style="margin-top:16px;background:#0B0B10;border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:16px;">
         <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;color:#6B6C80;text-transform:uppercase;margin-bottom:6px;">Note from the review team</div>
         <div style="font-size:14px;color:#FFFFFF;">${escapeHtml(data.reason)}</div>
       </div>`
    : '';
  const cta = data.decision === 'approved'
    ? `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="border-collapse:collapse;margin-top:22px;">
         <tr><td align="center" style="border-radius:11px;background:linear-gradient(135deg,#FF9B3E,#FF6A00);">
           <a href="${RESEND_SITE_URL}/host" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 26px;border-radius:11px;color:#FFFFFF;font-size:14px;font-weight:800;text-decoration:none;">Go to your dashboard</a>
         </td></tr>
       </table>`
    : `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="border-collapse:collapse;margin-top:22px;">
         <tr><td align="center" style="border-radius:11px;background:rgba(255,255,255,0.08);">
           <a href="${RESEND_SITE_URL}/host/verification" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 26px;border-radius:11px;color:#FFFFFF;font-size:14px;font-weight:800;text-decoration:none;">Update details</a>
         </td></tr>
       </table>`;
  const html = `
    <div style="background-color:#0B0B10;margin:0;padding:32px 12px;font-family:Segoe UI, Roboto, Helvetica, Arial, sans-serif;">
      <div style="max-width:520px;margin:0 auto;background-color:#12121C;border-radius:24px;overflow:hidden;border:1px solid #26263A;">
        <div style="padding:34px 30px 24px 30px;background:linear-gradient(135deg,#2A1606 0%,#12121C 60%);border-bottom:1px solid rgba(255,154,62,0.22);">
          <div style="font-size:11px;font-weight:800;letter-spacing:3px;color:#FF9B3E;text-transform:uppercase;">Lagos&nbsp;Live</div>
          <div style="font-size:26px;font-weight:900;color:#FFFFFF;margin-top:12px;line-height:32px;">Host Verification Update</div>
        </div>
        <div style="padding:26px 30px 30px 30px;">
          <p style="font-size:14px;line-height:22px;color:#D5D6E0;margin:0 0 8px;">Hi ${escapeHtml(data.hostName)},</p>
          <p style="font-size:14px;line-height:22px;color:#D5D6E0;margin:0;">${VERIFICATION_INTRO[data.decision]}</p>
          <p style="font-size:14px;line-height:22px;color:#A7A8B5;margin:14px 0 0;">${VERIFICATION_COPY[data.decision]}</p>
          ${reasonBlock}
          ${cta}
          <p style="font-size:12px;color:#6B6C80;margin:24px 0 0;line-height:18px;">— Lagos Live Team</p>
        </div>
      </div>
    </div>`;
  return sendHtmlEmail({
    to: data.to,
    subject: `Lagos Live — Host verification ${data.decision === 'approved' ? 'approved' : 'update'}`,
    html,
  });
}

export interface ReviewRequestEmailData {
  to: string;
  guestName: string;
  partyTitle: string;
  reviewUrl: string;
  scheduledAt?: string;
}

// Sent ~1 day after an event so attendees can rate & review. Uses scheduled_at
// so the cron simply queues it and Resend delivers at the right moment.
export async function sendReviewRequestEmail(data: ReviewRequestEmailData): Promise<boolean> {
  const html = `
    <div style="background-color:#0B0B10;margin:0;padding:32px 12px;font-family:Segoe UI, Roboto, Helvetica, Arial, sans-serif;">
      <div style="max-width:520px;margin:0 auto;background-color:#12121C;border-radius:24px;overflow:hidden;border:1px solid #26263A;">
        <div style="padding:34px 30px 24px 30px;background:linear-gradient(135deg,#1A0B16 0%,#12121C 60%);border-bottom:1px solid rgba(255,45,149,0.22);">
          <div style="font-size:11px;font-weight:800;letter-spacing:3px;color:#FF2D95;text-transform:uppercase;">Lagos&nbsp;Live</div>
          <div style="font-size:26px;font-weight:900;color:#FFFFFF;margin-top:12px;line-height:32px;">How was it?</div>
        </div>
        <div style="padding:26px 30px 30px 30px;">
          <p style="font-size:14px;line-height:22px;color:#D5D6E0;margin:0 0 8px;">Hi ${escapeHtml(data.guestName)},</p>
          <p style="font-size:14px;line-height:22px;color:#D5D6E0;margin:0;">Thanks for attending <strong style="color:#FFFFFF;">${escapeHtml(data.partyTitle)}</strong>. Help others find their next favourite night — rate the vibe, the music, the venue.</p>
          <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="border-collapse:collapse;margin-top:22px;">
            <tr>
              <td align="center" style="border-radius:11px;background:linear-gradient(135deg,#FF2D95,#8A2BE2);">
                <a href="${escapeHtml(data.reviewUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 26px;border-radius:11px;color:#FFFFFF;font-size:14px;font-weight:800;text-decoration:none;">Rate &amp; Review</a>
              </td>
            </tr>
          </table>
          <p style="font-size:12px;color:#6B6C80;margin:24px 0 0;line-height:18px;">— Lagos Live</p>
        </div>
      </div>
    </div>`;
  return sendHtmlEmail({
    to: data.to,
    subject: `How was ${data.partyTitle}? Share your review`,
    html,
    scheduledAt: data.scheduledAt,
  });
}

export interface NewsletterCampaignEmailData {
  to: string;
  firstName: string | null;
  eventListHtml: string;
  exploreUrl: string;
}

// The weekly "what's hot in Lagos" campaign (Batch 19), built from the top
// trending events of the week by the cron job.
export async function sendNewsletterCampaignEmail(data: NewsletterCampaignEmailData): Promise<boolean> {
  const html = `
    <div style="background-color:#0B0B10;margin:0;padding:32px 12px;font-family:Segoe UI, Roboto, Helvetica, Arial, sans-serif;">
      <div style="max-width:520px;margin:0 auto;background-color:#12121C;border-radius:24px;overflow:hidden;border:1px solid #26263A;">
        <div style="padding:34px 30px 24px 30px;background:linear-gradient(135deg,#1A0B16 0%,#12121C 60%);border-bottom:1px solid rgba(255,45,149,0.22);">
          <div style="font-size:11px;font-weight:800;letter-spacing:3px;color:#FF2D95;text-transform:uppercase;">Lagos&nbsp;Live</div>
          <div style="font-size:26px;font-weight:900;color:#FFFFFF;margin-top:12px;line-height:32px;">What's on this week \ud83c\udf89</div>
        </div>
        <div style="padding:26px 30px 30px 30px;">
          <p style="font-size:14px;line-height:22px;color:#D5D6E0;margin:0 0 16px;">Hey ${escapeHtml(data.firstName || 'there')}, here are the hottest events happening around Lagos right now.</p>
          <ul style="margin:0;padding-left:0;list-style:none;">${data.eventListHtml}</ul>
          <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="border-collapse:collapse;margin-top:22px;">
            <tr>
              <td align="center" style="border-radius:11px;background:linear-gradient(135deg,#FF2D95,#8A2BE2);">
                <a href="${escapeHtml(data.exploreUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 26px;border-radius:11px;color:#FFFFFF;font-size:14px;font-weight:800;text-decoration:none;">Explore All Events</a>
              </td>
            </tr>
          </table>
          <p style="font-size:11px;color:#6B6C80;margin:24px 0 0;line-height:18px;">
            You're receiving this because you joined the Lagos Live community. No longer interested?
            <a href="${escapeHtml(data.exploreUrl)}" style="color:#6B6C80;text-decoration:underline;">Unsubscribe</a>
          </p>
        </div>
      </div>
    </div>`;
  return sendHtmlEmail({
    to: data.to,
    subject: `This Week's Hottest Lagos Events`,
    html,
  });
}

// ---------------------------------------------------------------------------
// Batch 22 — retention notifications (best-effort, same pattern as the others).
// Shared shell in the gold/orange identity; each sender assembles its copy.
// ---------------------------------------------------------------------------

interface NotificationShell {
  badge: string;
  heading: string;
  greeting: string;
  paragraphs: string[];
  details?: { label: string; value: string }[];
  bullets?: string[];
  ctaUrl?: string;
  ctaLabel?: string;
  note?: string;
}

function notificationShellHtml(s: NotificationShell): string {
  const details = (s.details ?? [])
    .map(
      (d) => `
      <tr>
        <td width="34%" valign="top" style="padding:9px 16px 9px 0;">
          <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;color:#6B6C80;text-transform:uppercase;">${escapeHtml(d.label)}</div>
        </td>
        <td valign="top" style="padding:9px 0;">
          <div style="font-size:13px;font-weight:700;color:#FFFFFF;line-height:19px;">${escapeHtml(d.value)}</div>
        </td>
      </tr>`
    )
    .join('');
  const bullets =
    s.bullets && s.bullets.length > 0
      ? `<ul style="margin:0;padding:0;list-style:none;">
          ${s.bullets
            .map(
              (b) => `<li style="font-size:13px;line-height:20px;color:#FFFFFF;padding:7px 0 7px 22px;background:url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="%23FF9B3E" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>') left center no-repeat;">${escapeHtml(b)}</li>`
            )
            .join('')}
        </ul>`
      : '';
  const cta =
    s.ctaUrl && s.ctaLabel
      ? `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="border-collapse:collapse;margin-top:24px;">
          <tr><td align="center" style="border-radius:12px;background:linear-gradient(135deg,#FF9B3E,#FF6A00);">
            <a href="${escapeHtml(s.ctaUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:15px 30px;border-radius:12px;color:#FFFFFF;font-size:14px;font-weight:800;text-decoration:none;letter-spacing:0.1px;">${escapeHtml(s.ctaLabel)}</a>
          </td></tr>
        </table>`
      : '';
  const note = s.note
    ? `<p style="font-size:11px;color:#6B6C80;margin:22px 0 0;line-height:18px;">${escapeHtml(s.note)}</p>`
    : '';
  return `
    <div style="background-color:#0B0B10;margin:0;padding:32px 12px;font-family:Segoe UI, Roboto, Helvetica, Arial, sans-serif;">
      <div style="max-width:520px;margin:0 auto;background-color:#12121C;border-radius:24px;overflow:hidden;border:1px solid #26263A;">
        <div style="padding:34px 30px 24px 30px;background:linear-gradient(135deg,#2A1606 0%,#12121C 60%);border-bottom:1px solid rgba(255,154,62,0.22);">
          <div style="font-size:11px;font-weight:800;letter-spacing:3px;color:#FF9B3E;text-transform:uppercase;">Lagos&nbsp;Live</div>
          <div style="font-size:26px;font-weight:900;color:#FFFFFF;margin-top:12px;line-height:32px;">${escapeHtml(s.heading)}</div>
          <div style="display:inline-block;margin-top:16px;background:rgba(255,154,62,0.12);border:1px solid rgba(255,154,62,0.3);border-radius:999px;padding:6px 13px;">
            <span style="font-size:10px;font-weight:800;letter-spacing:1px;color:#FFB347;text-transform:uppercase;">${escapeHtml(s.badge)}</span>
          </div>
        </div>
        <div style="padding:26px 30px 30px 30px;">
          <p style="font-size:14px;line-height:22px;color:#D5D6E0;margin:0 0 8px;">${escapeHtml(s.greeting)}</p>
          ${s.paragraphs.map((p) => `<p style="font-size:14px;line-height:22px;color:#D5D6E0;margin:14px 0 0;">${escapeHtml(p)}</p>`).join('')}
          ${s.details && s.details.length > 0 ? `<div style="margin-top:18px;background:#0B0B10;border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:13px 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${details}</table></div>` : ''}
          ${bullets ? `<div style="margin-top:18px;background:#0B0B10;border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:13px 16px;">${bullets}</div>` : ''}
          ${cta}
          ${note}
          <p style="font-size:12px;color:#6B6C80;margin:24px 0 0;line-height:18px;">— Lagos Live Team · <a href="mailto:support@lagoslive.ng" style="color:#6B6C80;text-decoration:none;">support@lagoslive.ng</a></p>
        </div>
      </div>
    </div>`;
}

export interface EventReminderEmailData {
  to: string;
  guestName: string;
  partyTitle: string;
  partyDate: string;
  partyTime: string;
  partyLocation: string;
  ticketUrl: string;
}

// Sent by the reminders cron ~24h before an event the guest is attending.
export async function sendEventReminderEmail(data: EventReminderEmailData): Promise<boolean> {
  const html = notificationShellHtml({
    badge: 'Happening soon',
    heading: `${data.partyTitle} is happening soon`,
    greeting: `Hi ${data.guestName},`,
    paragraphs: ["Here's your reminder — you're on the list. Keep your ticket handy at the door."],
    details: [
      { label: 'Event', value: data.partyTitle },
      { label: 'Date', value: data.partyDate },
      { label: 'Time', value: data.partyTime },
      { label: 'Location', value: data.partyLocation },
    ],
    ctaUrl: data.ticketUrl,
    ctaLabel: 'View My Ticket',
  });
  return sendHtmlEmail({
    to: data.to,
    subject: `Reminder · ${data.partyTitle} is happening soon`,
    html,
  });
}

export interface EventChangeEmailData {
  to: string;
  guestName: string;
  partyTitle: string;
  changes: string[];
  partyUrl: string;
}

// Sent by the host event editor after a venue/date/time edit for an approved,
// upcoming event — to buyers, savers and reminder-set users.
export async function sendEventChangeEmail(data: EventChangeEmailData): Promise<boolean> {
  const html = notificationShellHtml({
    badge: 'Details updated',
    heading: `Update on ${data.partyTitle}`,
    greeting: `Hi ${data.guestName},`,
    paragraphs: ['The organiser just updated the details for an event you care about. Here is what changed:'],
    bullets: data.changes,
    ctaUrl: data.partyUrl,
    ctaLabel: 'View Event Page',
  });
  return sendHtmlEmail({
    to: data.to,
    subject: `Update · ${data.partyTitle} details changed`,
    html,
  });
}

export interface AlmostSoldOutEmailData {
  to: string;
  guestName: string;
  partyTitle: string;
  partyDate: string;
  partyTime: string;
  partyUrl: string;
}

// Sent by the saved-updates cron to savers of an event that is about to sell out.
export async function sendAlmostSoldOutEmail(data: AlmostSoldOutEmailData): Promise<boolean> {
  const html = notificationShellHtml({
    badge: 'Almost sold out',
    heading: `${data.partyTitle} is almost sold out`,
    greeting: `Hi ${data.guestName},`,
    paragraphs: ['You saved this event and it is on track to sell out. Grab your tickets now so you don\u2019t miss it.'],
    details: [
      { label: 'Event', value: data.partyTitle },
      { label: 'Date', value: data.partyDate },
      { label: 'Time', value: data.partyTime },
    ],
    ctaUrl: data.partyUrl,
    ctaLabel: 'Get Your Ticket',
  });
  return sendHtmlEmail({
    to: data.to,
    subject: `Hurry · ${data.partyTitle} is almost sold out`,
    html,
  });
}
