export const DEFAULT_AUTH_REDIRECT = '/profile';

const INTERNAL_ORIGIN = 'https://auth-redirect.invalid';

export type OAuthErrorCode =
  | 'oauth_cancelled'
  | 'oauth_not_allowed'
  | 'oauth_not_configured'
  | 'oauth_link_expired'
  | 'oauth_missing_code'
  | 'oauth_email_exists'
  | 'oauth_profile_missing'
  | 'oauth_failed';

const OAUTH_ERROR_MESSAGES: Record<OAuthErrorCode, string> = {
  oauth_cancelled: 'Google sign-in was cancelled. Try again or use your email and password.',
  oauth_not_allowed: 'This Google account is not allowed to sign in. Try an approved account, or use your email and password.',
  oauth_not_configured: 'Google sign-in is not available right now. Please use your email and password.',
  oauth_link_expired: 'This Google sign-in attempt expired. Please try again.',
  oauth_missing_code: 'Google sign-in did not return a valid response. Please try again.',
  oauth_email_exists: 'An account already exists for this email. Sign in with your password instead.',
  oauth_profile_missing: "We couldn't finish setting up your LagosLive account. Please contact support.",
  oauth_failed: 'Google sign-in could not be completed. Please try again.',
};

export function safeNextPath(
  value: string | null | undefined,
  fallback: string = DEFAULT_AUTH_REDIRECT,
): string {
  if (typeof value !== 'string') return fallback;

  const candidate = value.trim();
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.startsWith('/\\')) {
    return fallback;
  }
  if (/[\u0000-\u001f\u007f]/.test(candidate)) return fallback;

  try {
    const url = new URL(candidate, INTERNAL_ORIGIN);
    if (url.origin !== INTERNAL_ORIGIN || url.pathname === '/auth/callback') return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export function buildGoogleCallbackUrl(origin: string, next: string): string {
  const url = new URL('/auth/callback', origin);
  url.searchParams.set('next', safeNextPath(next));
  return url.toString();
}

export function classifyOAuthError(
  rawCode?: string | null,
  description?: string | null,
): OAuthErrorCode {
  const code = (rawCode ?? '').toLowerCase();
  const details = `${code} ${description ?? ''}`.toLowerCase();

  if (code === 'access_denied') {
    if (
      details.includes('test user') ||
      details.includes('not allowed') ||
      details.includes('not authorized') ||
      details.includes('unauthorized')
    ) {
      return 'oauth_not_allowed';
    }
    return 'oauth_cancelled';
  }

  if (
    details.includes('provider_not_enabled') ||
    details.includes('provider is not enabled') ||
    details.includes('provider is disabled')
  ) {
    return 'oauth_not_configured';
  }

  if (
    details.includes('otp_expired') ||
    details.includes('invalid_code') ||
    details.includes('code verifier') ||
    details.includes('requested path is invalid') ||
    details.includes('has expired')
  ) {
    return 'oauth_link_expired';
  }

  if (
    details.includes('email_exists') ||
    details.includes('email_conflict') ||
    details.includes('manual_linking') ||
    (details.includes('already') && (details.includes('registered') || details.includes('exists')))
  ) {
    return 'oauth_email_exists';
  }

  return 'oauth_failed';
}

export function oauthErrorMessage(code: string | null | undefined): string {
  if (!code || !code.startsWith('oauth_')) return '';
  return OAUTH_ERROR_MESSAGES[code as OAuthErrorCode] ?? OAUTH_ERROR_MESSAGES.oauth_failed;
}
