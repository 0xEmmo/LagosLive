'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ThemeName } from './theme';

export interface User {
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
  login: (email: string) => void;
  signup: (name: string, email: string) => void;
  logout: () => void;

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
      theme: 'dark',
      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),

      user: null,
      login: (email) => {
        const namePart = email.split('@')[0].replace(/[._]/g, ' ');
        const name = namePart.charAt(0).toUpperCase() + namePart.slice(1);
        set({ user: { name, email } });
      },
      signup: (name, email) => set({ user: { name, email } }),
      logout: () => set({ user: null }),

      savedParties: [],
      toggleSave: (id) =>
        set((s) => ({
          savedParties: s.savedParties.includes(id)
            ? s.savedParties.filter((x) => x !== id)
            : [...s.savedParties, id],
        })),

      reminders: [],
      pushEnabled: true,
      togglePush: () => {
        set((s) => ({ pushEnabled: !s.pushEnabled }));
        if (toastTimer) clearTimeout(toastTimer);
        set({ toast: null });
      },
      toggleReminder: (id, title) => {
        const wasSet = get().reminders.includes(id);
        set((s) => ({
          reminders: wasSet ? s.reminders.filter((x) => x !== id) : [...s.reminders, id],
        }));
        if (!wasSet && get().pushEnabled) {
          get().showToast('Reminder Set', `We'll notify you 1 hour before ${title} starts.`);
        }
      },
      removeReminder: (id) => set((s) => ({ reminders: s.reminders.filter((x) => x !== id) })),

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
      partialize: (s) => ({
        theme: s.theme,
        user: s.user,
        savedParties: s.savedParties,
        reminders: s.reminders,
        pushEnabled: s.pushEnabled,
      }),
    }
  )
);
