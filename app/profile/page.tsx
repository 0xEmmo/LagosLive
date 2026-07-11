'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { X, Bell } from 'lucide-react';
import { useParties } from '@/lib/hooks/useParties';
import { useLagosLiveStore } from '@/lib/store';

export default function ProfilePage() {
  const router = useRouter();
  const user = useLagosLiveStore((s) => s.user);
  const authLoading = useLagosLiveStore((s) => s.authLoading);
  const savedParties = useLagosLiveStore((s) => s.savedParties);
  const reminders = useLagosLiveStore((s) => s.reminders);
  const pushEnabled = useLagosLiveStore((s) => s.pushEnabled);
  const theme = useLagosLiveStore((s) => s.theme);
  const togglePush = useLagosLiveStore((s) => s.togglePush);
  const toggleTheme = useLagosLiveStore((s) => s.toggleTheme);
  const removeReminder = useLagosLiveStore((s) => s.removeReminder);
  const logout = useLagosLiveStore((s) => s.logout);
  const { parties } = useParties();

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [authLoading, user, router]);

  if (!user) return null;

  const userInitials = user.name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const reminderList = parties.filter((p) => reminders.includes(p.id));

  return (
    <div className="mx-auto max-w-[480px] p-5 animate-fade-in">
      <div className="flex flex-col items-center px-5 py-9 pb-7 text-center">
        <div
          className="flex h-[86px] w-[86px] items-center justify-center rounded-full font-display text-[32px] tracking-[1px] text-white"
          style={{ background: 'linear-gradient(135deg,#552CB7,#FB7DA8)' }}
        >
          {userInitials}
        </div>
        <h1 className="font-display mt-4 text-[30px] tracking-[0.5px]" style={{ color: 'var(--c-text)' }}>
          {user.name}
        </h1>
        <p className="mt-0.5 text-sm" style={{ color: 'var(--c-text-muted)' }}>
          {user.email}
        </p>
      </div>

      <div className="mb-5 grid grid-cols-3 gap-2.5">
        {[
          { label: 'Saved', value: savedParties.length },
          { label: 'Reminders', value: reminders.length },
          { label: 'Tickets', value: 0 },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border px-2 py-3.5 text-center" style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
            <div className="font-display text-2xl" style={{ color: '#552CB7' }}>
              {stat.value}
            </div>
            <div className="mt-0.5 text-[10px] uppercase tracking-[0.4px]" style={{ color: 'var(--c-text-faint)' }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      <div className="mb-2.5 flex items-center justify-between rounded-2xl border px-4 py-3.5" style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
        <div>
          <div className="text-[13px] font-semibold" style={{ color: 'var(--c-text)' }}>Push Notifications</div>
          <div className="mt-px text-[11px]" style={{ color: 'var(--c-text-faint)' }}>Get reminded before parties start</div>
        </div>
        <div
          onClick={togglePush}
          className="relative h-[22px] w-10 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-150"
          style={{ background: pushEnabled ? 'linear-gradient(135deg,#552CB7,#FB7DA8)' : 'var(--c-border3)' }}
        >
          <div
            className="absolute left-[2px] top-[2px] h-[18px] w-[18px] rounded-full bg-white transition-transform duration-150 ease-out"
            style={{ transform: `translateX(${pushEnabled ? 18 : 0}px)` }}
          />
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between rounded-2xl border px-4 py-3.5" style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
        <div>
          <div className="text-[13px] font-semibold" style={{ color: 'var(--c-text)' }}>Dark Mode</div>
          <div className="mt-px text-[11px]" style={{ color: 'var(--c-text-faint)' }}>Switch between dark and light theme</div>
        </div>
        <div
          onClick={toggleTheme}
          className="relative h-[22px] w-10 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-150"
          style={{ background: theme === 'dark' ? 'linear-gradient(135deg,#552CB7,#FB7DA8)' : 'var(--c-border3)' }}
        >
          <div
            className="absolute left-[2px] top-[2px] h-[18px] w-[18px] rounded-full bg-white transition-transform duration-150 ease-out"
            style={{ transform: `translateX(${theme === 'dark' ? 18 : 0}px)` }}
          />
        </div>
      </div>

      {reminderList.length > 0 && (
        <>
          <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[1.2px]" style={{ color: 'var(--c-text-muted)' }}>
            Upcoming Reminders
          </div>
          <div className="mb-5 flex flex-col gap-2">
            {reminderList.map((p) => (
              <div key={p.id} className="flex items-center gap-2.5 rounded-xl border px-3 py-2.5" style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
                <div className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-[9px]" style={{ background: 'rgba(255,197,103,0.22)' }}>
                  <Bell size={15} color="#B8860B" strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold" style={{ color: 'var(--c-text)' }}>{p.title}</div>
                  <div className="text-[11px]" style={{ color: 'var(--c-text-faint)' }}>{p.date} · {p.time}</div>
                </div>
                <button onClick={() => removeReminder(p.id)} className="flex-shrink-0 p-1 transition-transform duration-150 active:scale-90" style={{ color: 'var(--c-text-dim)' }}>
                  <X size={13} strokeWidth={2.5} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <Link
        href="/saved"
        className="mb-2.5 flex w-full items-center justify-between rounded-xl border px-4 py-[15px] text-sm font-medium"
        style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)', color: 'var(--c-text)' }}
      >
        My Saved Parties
        <span style={{ color: 'var(--c-text-faint)' }}>→</span>
      </Link>
      <Link
        href="/host"
        className="mb-4 flex w-full items-center justify-between rounded-xl border px-4 py-[15px] text-sm font-medium"
        style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)', color: 'var(--c-text)' }}
      >
        List an Event
        <span style={{ color: 'var(--c-text-faint)' }}>→</span>
      </Link>
      <button
        onClick={async () => {
          await logout();
          router.push('/');
        }}
        className="w-full rounded-xl border py-[15px] text-sm font-semibold transition-transform duration-150 active:scale-[0.98]"
        style={{ background: 'rgba(214,64,44,0.1)', borderColor: 'rgba(214,64,44,0.32)', color: '#D6402C' }}
      >
        Log Out
      </button>
    </div>
  );
}
