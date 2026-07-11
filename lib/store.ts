'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ThemeName } from './theme';
import { supabase } from './supabase/client';

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Toast {
  title: string;
  subtitle: string;
}

interface LagosLiveState {
  theme: ThemeName;
  toggleTheme: () => void;

  user: User | null;
  authLoading: boolean;
  login: (email: string, password: string) => Promise<string | null>;
  signup: (name: string, email: string, password: string) => Promise<{ error: string | null; needsEmailConfirmation: boolean }>;
  logout: () => Promise<void>;
  loadUserData: (userId: string) => Promise<void>;
  clearUserData: () => void;

  savedParties: number[];
  toggleSave: (id: number) => void;

  reminders: number[];
  pushEnabled: boolean;
  togglePush: () => void;
  toggleReminder: (id: number, title: string, onSet?: () => void) => void;
  removeReminder: (id: number) => void;

  toast: Toast | null;
  showToast: (title: string, subtitle: string) => void;
  dismissToast: () => void;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useLagosLiveStore = create<LagosLiveState>()(
  persist(
    (set, get) => ({
      theme: 'light',
      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),

      user: null,
      authLoading: true,

      // These two only kick off the Supabase auth call and report back any
      // error — AuthListener's onAuthStateChange subscription is what
      // actually hydrates `user`/savedParties/reminders once the session lands,
      // so login/signup/logout all funnel through one place.
      login: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return error ? error.message : null;
      },

      signup: async (name, email, password) => {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name } },
        });
        if (error) return { error: error.message, needsEmailConfirmation: false };
        return { error: null, needsEmailConfirmation: !data.session };
      },

      logout: async () => {
        await supabase.auth.signOut();
      },

      loadUserData: async (userId) => {
        const [{ data: profile }, { data: saved }, { data: rem }] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
          supabase.from('saved_parties').select('party_id').eq('user_id', userId),
          supabase.from('reminders').select('party_id').eq('user_id', userId),
        ]);
        set({
          user: profile ? { id: profile.id, name: profile.name, email: profile.email } : null,
          pushEnabled: profile?.push_enabled ?? true,
          savedParties: (saved ?? []).map((r) => r.party_id),
          reminders: (rem ?? []).map((r) => r.party_id),
          authLoading: false,
        });
      },
      clearUserData: () =>
        set({ user: null, savedParties: [], reminders: [], pushEnabled: true, authLoading: false }),

      savedParties: [],
      toggleSave: (id) => {
        const wasSaved = get().savedParties.includes(id);
        set((s) => ({
          savedParties: wasSaved ? s.savedParties.filter((x) => x !== id) : [...s.savedParties, id],
        }));
        const userId = get().user?.id;
        if (!userId) return;
        const write = wasSaved
          ? supabase.from('saved_parties').delete().eq('user_id', userId).eq('party_id', id)
          : supabase.from('saved_parties').insert({ user_id: userId, party_id: id });
        write.then(({ error }) => {
          if (error) {
            set((s) => ({
              savedParties: wasSaved ? [...s.savedParties, id] : s.savedParties.filter((x) => x !== id),
            }));
          }
        });
      },

      reminders: [],
      pushEnabled: true,
      togglePush: () => {
        const next = !get().pushEnabled;
        set({ pushEnabled: next, toast: null });
        if (toastTimer) clearTimeout(toastTimer);
        const userId = get().user?.id;
        if (userId) supabase.from('profiles').update({ push_enabled: next }).eq('id', userId);
      },
      toggleReminder: (id, title) => {
        const wasSet = get().reminders.includes(id);
        set((s) => ({
          reminders: wasSet ? s.reminders.filter((x) => x !== id) : [...s.reminders, id],
        }));
        const userId = get().user?.id;
        if (userId) {
          const write = wasSet
            ? supabase.from('reminders').delete().eq('user_id', userId).eq('party_id', id)
            : supabase.from('reminders').insert({ user_id: userId, party_id: id });
          write.then(({ error }) => {
            if (error) {
              set((s) => ({
                reminders: wasSet ? [...s.reminders, id] : s.reminders.filter((x) => x !== id),
              }));
            }
          });
        }
        if (!wasSet && get().pushEnabled) {
          get().showToast('Reminder Set', `We'll notify you 1 hour before ${title} starts.`);
        }
      },
      removeReminder: (id) => {
        set((s) => ({ reminders: s.reminders.filter((x) => x !== id) }));
        const userId = get().user?.id;
        if (userId) supabase.from('reminders').delete().eq('user_id', userId).eq('party_id', id);
      },

      toast: null,
      showToast: (title, subtitle) => {
        if (toastTimer) clearTimeout(toastTimer);
        set({ toast: { title, subtitle } });
        toastTimer = setTimeout(() => set({ toast: null }), 4000);
      },
      dismissToast: () => {
        if (toastTimer) clearTimeout(toastTimer);
        set({ toast: null });
      },
    }),
    {
      name: 'lagos-live-store',
      // Everything else now lives in Supabase (auth session + tables) — only
      // the device-level theme preference still belongs in localStorage.
      partialize: (s) => ({ theme: s.theme }),
    }
  )
);
