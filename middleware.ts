import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/lib/supabase/database.types';

const STAFF_ROLES = new Set(['admin', 'super_admin', 'finance', 'support']);
const HOST_ROLES = new Set(['organizer', 'admin', 'super_admin']);

function redirectTo(request: NextRequest, pathname: string, next?: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = '';
  if (next) url.searchParams.set('next', next);
  return NextResponse.redirect(url);
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isPublicHostProfile = pathname === '/host/profile' || pathname.startsWith('/host/profile/');
  const isHostArea = pathname === '/host' || pathname.startsWith('/host/');
  const isAdminArea = pathname === '/admin' || pathname.startsWith('/admin/');

  if ((!isHostArea || isPublicHostProfile) && !isAdminArea) return NextResponse.next();

  let response = NextResponse.next({ request: { headers: request.headers } });
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return redirectTo(request, '/login', `${pathname}${request.nextUrl.search}`);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_admin, account_status')
    .eq('id', user.id)
    .maybeSingle();
  const role = profile?.role ?? null;

  if (profile?.account_status && profile.account_status !== 'active') {
    return redirectTo(request, '/login');
  }

  // A signed-in viewer may enter the event creation flow and is promoted to a
  // host after the event is created. All other /host pages are host-only.
  if (isHostArea && !isPublicHostProfile) {
    const isOnboarding = pathname === '/host/new';
    if (!HOST_ROLES.has(role ?? '') && !isOnboarding) return redirectTo(request, '/');
    return response;
  }

  if (isAdminArea && !profile?.is_admin && !STAFF_ROLES.has(role ?? '')) {
    return redirectTo(request, role === 'organizer' ? '/host/dashboard' : '/');
  }

  return response;
}

export const config = {
  matcher: ['/host/:path*', '/admin/:path*'],
};
