'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useLagosLiveStore } from '@/lib/store';

// Single source of truth for auth state: login/signup/logout in the store just
// call the Supabase auth method and report errors back to the UI — this listener
// is what actually hydrates user/savedParties/reminders once a session lands,
// so every entry point (sign in, sign up, token refresh, cross-tab logout) stays in sync.
//
// It also claims any guest orders bought under the same email (Phase 5): once a
// session is live we fire-and-forget the link endpoint so verified reviews,
// reminders and My Tickets work for tickets bought during guest checkout.
export default function AuthListener() {
  const loadUserData = useLagosLiveStore((s) => s.loadUserData);
  const clearUserData = useLagosLiveStore((s) => s.clearUserData);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        loadUserData(session.user.id);
        linkGuestOrdersOnce();
      } else clearUserData();
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        loadUserData(session.user.id);
        if (event === 'SIGNED_IN') linkGuestOrdersOnce();
      } else clearUserData();
    });

    return () => subscription.unsubscribe();
  }, [loadUserData, clearUserData]);

  return null;
}

// Runs at most once per browser session. The link endpoint is idempotent, so
// even a rerun is harmless — this just keeps a sign-in from doing unnecessary work.
function linkGuestOrdersOnce() {
  if (typeof window === 'undefined') return;
  const flag = sessionStorage.getItem('ll_guest_linked');
  if (flag === '1') return;
  sessionStorage.setItem('ll_guest_linked', '1');
  fetch('/api/orders/link-guest', { method: 'POST' }).catch(() => {
    // Best-effort only — the next sign-in retries it.
  });
}
