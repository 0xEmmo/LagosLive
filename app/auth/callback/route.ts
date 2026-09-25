import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { classifyOAuthError, safeNextPath, type OAuthErrorCode } from '@/lib/auth-redirect';

export const dynamic = 'force-dynamic';

function noStoreRedirect(location: URL): NextResponse {
  const response = NextResponse.redirect(location);
  response.headers.set('Cache-Control', 'private, no-store, no-cache, must-revalidate');
  response.headers.set('Pragma', 'no-cache');
  return response;
}

function loginRedirect(
  request: NextRequest,
  error: OAuthErrorCode,
  next: string,
): NextResponse {
  const url = new URL('/login', request.nextUrl.origin);
  url.searchParams.set('error', error);
  url.searchParams.set('next', next);
  return noStoreRedirect(url);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = safeNextPath(searchParams.get('next'));

  const providerError = searchParams.get('error');
  if (providerError) {
    return loginRedirect(
      request,
      classifyOAuthError(providerError, searchParams.get('error_description')),
      next,
    );
  }

  const code = searchParams.get('code');
  if (!code) {
    return loginRedirect(request, 'oauth_missing_code', next);
  }

  const supabase = createServerSupabase();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    return loginRedirect(
      request,
      classifyOAuthError(exchangeError.code, exchangeError.message),
      next,
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return loginRedirect(request, 'oauth_failed', next);
  }

  if (!user.email) {
    await supabase.auth.signOut();
    return loginRedirect(request, 'oauth_profile_missing', next);
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    return loginRedirect(request, 'oauth_failed', next);
  }

  if (!profile) {
    await supabase.auth.signOut();
    return loginRedirect(request, 'oauth_profile_missing', next);
  }

  return noStoreRedirect(new URL(next, request.nextUrl.origin));
}
