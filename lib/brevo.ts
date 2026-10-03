import 'server-only';

const BREVO_API = 'https://api.brevo.com/v3/smtp/email';
const FALLBACK_FROM = 'onboarding@resend.dev';

export interface BrevoEmailInput {
  to: string;
  subject: string;
  html: string;
}

/** Send one transactional HTML email through Brevo. Never throws. */
export async function sendBrevoHtmlEmail({ to, subject, html }: BrevoEmailInput): Promise<boolean> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.warn('[brevo] BREVO_API_KEY is not configured — skipping email to', to);
    return false;
  }
  const senderEmail = process.env.BREVO_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || FALLBACK_FROM;
  const senderName = process.env.BREVO_FROM_NAME || 'LagosLive';
  try {
    const response = await fetch(BREVO_API, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { email: senderEmail, name: senderName },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      }),
    });
    const bodyText = await response.text();
    if (!response.ok) {
      console.error('[brevo] send failed', { status: response.status, to, subject, responseBody: bodyText });
      return false;
    }
    console.log('[brevo] send succeeded', { to, subject });
    return true;
  } catch (error) {
    console.error('[brevo] unexpected send error', { to, subject, error });
    return false;
  }
}
