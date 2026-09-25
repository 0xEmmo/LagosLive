'use client';

import { useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useLagosLiveStore } from '@/lib/store';
import { linkGuestOrdersOnce } from '@/lib/orders-linking';

// Single source of truth for auth state: login/signup/logout in the store just
// call the Supabase auth method and report errors back to the UI — this listener
// is what actually hydrates user/savedParties/reminders once a session lands,
// so every entry point (sign in, sign up, Google OAuth, token refresh,
// cross-tab logout) stays in sync.
//
// Profiles are created by the on_auth_user_created database trigger. The short
// retry below covers the first Google callback without ever writing profiles
// from the browser or creating duplicates.
export default function AuthListener() {
  const loadUserData = useLagosLiveStore((s) => s.loadUserData);
  const clearUserData = useLagosLiveStore((s) => s.clearUserData);

  const hydrateUserData = useCallback(
    async (userId: string) => {
      await loadUserData(userId);
      if (useLagosLiveStore.getState().user) return;
      await new Promise((resolve) => setTimeout(resolve, 350));
      await loadUserData(userId);
    },
    [loadUserData],
  );

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        await hydrateUserData(session.user.id);
        await linkGuestOrdersOnce();
      } else {
        clearUserData();
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        const userId = session.user.id;
        void (async () => {
          await hydrateUserData(userId);
          if (event === 'SIGNED_IN') await linkGuestOrdersOnce();
        })();
      } else {
        clearUserData();
      }
    });

    return () => subscription.unsubscribe();
  }, [hydrateUserData, clearUserData]);

  return null;
}
