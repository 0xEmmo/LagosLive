import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// The user-scoped server client: reads the browser session cookies exactly like
// the client-side client, so RLS still applies. Used only inside API routes /
// server code — never in client components.
export function createServerSupabase() {
  const cookieStore = cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Setting cookies can throw when called from a Server Component —
            // safe to ignore, the session is already in the request.
          }
        },
      },
    }
  );
}

// The service-role client: bypasses RLS and is used for the *only* writes the
// app intentionally keeps out of reach of users — confirming/failing/cancelling
// an order and the inventory bookkeeping that goes with it. Never import this
// from client code, and never expose the key through an API response.
export function createServiceSupabase() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  }
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}
