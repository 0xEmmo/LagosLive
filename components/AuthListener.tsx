'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useLagosLiveStore } from '@/lib/store';

// Single source of truth for auth state: login/signup/logout in the store just
// call the Supabase auth method and report errors back to the UI — this listener
// is what actually hydrates user/savedParties/reminders once a session lands,
// so every entry point (sign in, sign up, token refresh, cross-tab logout) stays in sync.
export default function AuthListener() {
  const loadUserData = useLagosLiveStore((s) => s.loadUserData);
  const clearUserData = useLagosLiveStore((s) => s.clearUserData);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) loadUserData(session.user.id);
      else clearUserData();
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) loadUserData(session.user.id);
      else clearUserData();
    });

    return () => subscription.unsubscribe();
  }, [loadUserData, clearUserData]);

  return null;
}
