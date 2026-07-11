import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './database.types';

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// The whole app is client components, so one shared instance is fine —
// @supabase/ssr's browser client already manages its own session/cookie sync.
export const supabase = createClient();
