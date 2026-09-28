// Server-only Resend email helper. Reads RESEND_API_KEY and must NEVER be
// imported from a client component. Sending is strictly best-effort: the
// return value is just a boolean, and callers must treat a failed send as
// informational — a confirmed payment stays confirmed either way.

import { formatNaira } from './filters';
import { appUrl } from './seo';
import { getTicketSkin } from './ticket-skin';
import { renderTicketEmailHtml } from './ticket-email-template';
import { emailDocument, type EmailColorScheme } from './email-document';

const RESEND_API = 'https://api.resend.com/emails';

// Resend account address that works on every account without a verified
// domain. Used both as the default sender and as the retry fallback when the
// configured RESEND_FROM_EMAIL domain isn't verified yet.
const FALLBACK_FROM = 'onboarding@resend.dev';

function isFromDomainError(status: number, bodyText: string): boolean {
  if (status < 400 || status >= 500) return false;
  const text = bodyText.toLowerCase();
  return text.includes('verified') || text.includes('domain') || text.includes('validation');
}

export interface TicketConfirmationData {
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

// Ticket email markup is kept separate and pure so it can be previewed/tested without sending mail.
function ticketEmailHtml(d: TicketConfirmationData): string {
  const skin = getTicketSkin(d.ticketTypeName, '#1F5FFF');
  return renderTicketEmailHtml(d, skin, {
    formatMoney: formatNaira,
    supportUrl: RESEND_SITE_URL,
    paymentDate: formatPaymentDate(),
  });
}

// Best-effort send. Never throws: a payment must not fail because an email
// couldn't be delivered. Missing key / bad request / network error all just
// log and return false, but with enough detail to diagnose delivery problems.
export async function sendTicketConfirmation(data: TicketConfirmationData): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;

  // Sender is configurable via RESEND_FROM_EMAIL. Falls back to the Resend
  // onboarding address (guaranteed to exist on every account). Even when a
  // domain isn't verified yet, sendHtmlEmail retries from the fallback sender.
  const from = process.env.RESEND_FROM_EMAIL || FALLBACK_FROM;

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

  // Sends through the same resilient path as the other emails: the configured
  // sender is tried first, and if Resend rejects it because its domain isn't
  // verified yet, the ticket email is retried from the account default address.
  return sendHtmlEmail({
    to: data.to,
    subject: `Your ${data.partyTitle} ticket is confirmed — Lagos Live`,
    html: ticketEmailHtml(data),
    colorScheme: 'light',
  });
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
  const from = process.env.RESEND_FROM_EMAIL || FALLBACK_FROM;
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
        html: emailDocument(html, '#07070B'),
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
  colorScheme?: EmailColorScheme;
  scheduledAt?: string;
}

// Shared best-effort sender for the Batch 18 emails. Never throws: every
// delivery problem is logged and the caller gets a boolean back. When Resend
// rejects the configured sender (typically a domain that isn't verified yet),
// the message is retried from the account default address so delivery never
// silently depends on a pending DNS verification.
async function sendHtmlEmail({ to, subject, html, colorScheme, scheduledAt }: SendHtmlEmailArgs): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[resend] RESEND_API_KEY is not configured — skipping email to', to);
    return false;
  }
  const senders = [process.env.RESEND_FROM_EMAIL || FALLBACK_FROM, FALLBACK_FROM];
  for (const from of senders) {
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
        html: emailDocument(html, colorScheme === 'light' ? '#F5F7FC' : '#0B0B10', colorScheme ?? 'dark'),
        ...(scheduledAt ? { scheduled_at: scheduledAt } : {}),
      }),
      });
      const bodyText = await response.text();
      if (!response.ok) {
        const shouldRetryFromFallback = from !== FALLBACK_FROM && isFromDomainError(response.status, bodyText);
        if (shouldRetryFromFallback) {
          console.warn('[resend] sender domain rejected, retrying from', FALLBACK_FROM, {
            to,
            from,
            status: response.status,
            responseBody: bodyText,
          });
          continue;
        }
        console.error('[resend] send failed', { status: response.status, to, from, subject, responseBody: bodyText });
        return false;
      }
      console.log('[resend] send succeeded', { to, subject, from });
      return true;
    } catch (err) {
      console.error('[resend] unexpected error sending to', to, err);
      return false;
    }
  }
  return false;
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
          <p style="font-size:13px;color:#A7A8B5;line-height:20px;margin:18px 0 0;">Refunds typically appear within 1-2 business days. If you don't see it, email <a href="mailto:support@lagoslive.com.ng" style="color:#FF2D95;text-decoration:none;font-weight:700;">support@lagoslive.com.ng</a>.</p>
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

const RESEND_SITE_URL = appUrl();

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
    'You can no longer list new events or request payouts while suspended. If you believe this is a mistake, reply to this email or contact support@lagoslive.com.ng.',
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
  // Changed-detail bullets. Built as tables with a text checkmark (no SVG/data
  // URIs — Gmail strips those and the whole list item disappears).
  const bullets =
    s.bullets && s.bullets.length > 0
      ? s.bullets
          .map(
            (b) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr>
              <td width="26" valign="top" style="padding:9px 0;">
                <span style="display:inline-block;font-size:12px;font-weight:900;line-height:20px;color:#FF9B3E;">&#10003;</span>
              </td>
              <td valign="top" style="padding:9px 0;">
                <div style="font-size:13px;line-height:20px;color:#FFFFFF;">${escapeHtml(b)}</div>
              </td>
            </tr>
          </table>`
          )
          .join('')
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
          <p style="font-size:12px;color:#6B6C80;margin:24px 0 0;line-height:18px;">— Lagos Live Team · <a href="mailto:support@lagoslive.com.ng" style="color:#6B6C80;text-decoration:none;">support@lagoslive.com.ng</a></p>
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

export interface RefundProcessedEmailData {
  to: string;
  guestName: string;
  partyTitle: string;
  amountNaira: number;
  orderRef: string;
}

// Sent to a guest once an admin-issued (or retried) refund actually went out.
// Deduped per order by the callers in the admin operations route.
export async function sendRefundProcessedEmail(data: RefundProcessedEmailData): Promise<boolean> {
  const html = notificationShellHtml({
    badge: 'Refund processed',
    heading: 'Your refund is on its way',
    greeting: `Hi ${data.guestName},`,
    paragraphs: [
      `Your payment for ${data.partyTitle} has been refunded. It typically lands back on your original payment method within 1-2 business days.`,
    ],
    details: [
      { label: 'Event', value: data.partyTitle },
      { label: 'Refund amount', value: formatNaira(data.amountNaira) },
      { label: 'Order reference', value: data.orderRef },
    ],
    note: 'If the money hasn\u2019t appeared after a few days, reply to this email and our team will chase it for you.',
  });
  return sendHtmlEmail({
    to: data.to,
    subject: `Refund processed · ${data.partyTitle}`,
    html,
  });
}

export interface CheckInSummaryEmailData {
  to: string;
  hostName: string;
  partyTitle: string;
  partyDate: string;
  partyLocation: string;
  sold: number;
  checkedIn: number;
  noShow: number;
  revenueNaira: number;
  dashboardUrl: string;
}

// Sent to hosts shortly after one of their approved events wraps up, with the
// door report. The cron waits until the event has ended, then claims + sends.
export async function sendCheckInSummaryEmail(data: CheckInSummaryEmailData): Promise<boolean> {
  const html = notificationShellHtml({
    badge: 'Event wrap-up',
    heading: `${data.partyTitle} — the numbers are in`,
    greeting: `Hi ${data.hostName},`,
    paragraphs: ['Thanks for hosting. Here\u2019s how the door went, at a glance.'],
    details: [
      { label: 'Event', value: data.partyTitle },
      { label: 'Date', value: data.partyDate },
      { label: 'Venue', value: data.partyLocation },
      { label: 'Tickets sold', value: `${data.sold}` },
      { label: 'Checked in', value: `${data.checkedIn}` },
      { label: 'No-shows', value: `${data.noShow}` },
      { label: 'Door revenue', value: formatNaira(data.revenueNaira) },
    ],
    ctaUrl: data.dashboardUrl,
    ctaLabel: 'View Event Dashboard',
  });
  return sendHtmlEmail({
    to: data.to,
    subject: `Wrap-up · ${data.partyTitle} door report`,
    html,
  });
}
