import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './database.types';

type SupabaseBrowserClient = ReturnType<typeof createBrowserClient<Database>>;

let client: SupabaseBrowserClient | undefined;

function getClient(): SupabaseBrowserClient {
  if (!client) {
    client = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return client;
}

// Every call site does `supabase.from(...)` / `supabase.auth...` from inside an
// event handler or useEffect, never at module-eval time — but Next.js still
// executes 'use client' modules once during build-time prerendering. A Proxy
// defers the actual createBrowserClient() call (which throws if the env vars
// are missing) until the first real property access, so prerendering a page
// that merely imports this file can't crash the build.
export const supabase = new Proxy({} as SupabaseBrowserClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getClient(), prop, receiver);
  },
});
