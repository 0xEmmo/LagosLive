'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { X, Bell, Heart, Ticket, AlertTriangle, RefreshCw, TicketCheck } from 'lucide-react';
import { useParties } from '@/lib/hooks/useParties';
import { useLagosLiveStore } from '@/lib/store';
import { fetchMyTickets } from '@/lib/queries';
import { partyPhoto } from '@/lib/data';
import PartyPhoto from '@/components/PartyPhoto';
import RoleNavButtons from '@/components/RoleNavButtons';
import type { CustomerTicket } from '@/lib/types';

export default function ProfilePage() {
  const router = useRouter();
  const user = useLagosLiveStore((s) => s.user);
  const authLoading = useLagosLiveStore((s) => s.authLoading);
  const savedParties = useLagosLiveStore((s) => s.savedParties);
  const reminders = useLagosLiveStore((s) => s.reminders);
  const pushEnabled = useLagosLiveStore((s) => s.pushEnabled);
  const togglePush = useLagosLiveStore((s) => s.togglePush);
  const removeReminder = useLagosLiveStore((s) => s.removeReminder);
  const logout = useLagosLiveStore((s) => s.logout);
  const { parties } = useParties();

  const [tickets, setTickets] = useState<CustomerTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [ticketsError, setTicketsError] = useState<string | null>(null);
  const [ticketsAttempt, setTicketsAttempt] = useState(0);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setTicketsLoading(true);
    setTicketsError(null);
    fetchMyTickets(user.id)
      .then((data) => {
        if (!cancelled) setTickets(data);
      })
      .catch((err) => {
        if (!cancelled) setTicketsError(err instanceof Error ? err.message : 'Could not load your tickets.');
      })
      .finally(() => {
        if (!cancelled) setTicketsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, ticketsAttempt]);

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
          style={{ background: 'linear-gradient(135deg,#FF5A2E,#FF7F5C)', boxShadow: '0 0 30px rgba(255,90,46,0.3)' }}
        >
          {userInitials}
        </div>
        <h1 className="font-display mt-4 text-[30px] tracking-[0.5px]" style={{ color: '#FFFFFF' }}>
          {user.name}
        </h1>
        <p className="mt-0.5 text-sm" style={{ color: '#A7A8B5' }}>
          {user.email}
        </p>
      </div>

      <div className="mb-5 grid grid-cols-3 gap-2.5">
        {[
          { label: 'Saved', value: savedParties.length, icon: Heart, color: '#FF5A2E' },
          { label: 'Reminders', value: reminders.length, icon: Bell, color: '#FFB347' },
          { label: 'Tickets', value: tickets.length, icon: Ticket, color: '#3ECF8E' },
        ].map((stat) => (
          <div key={stat.label} className="glass rounded-2xl px-2 py-4 text-center" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <stat.icon size={18} strokeWidth={1.5} color={stat.color} className="mx-auto mb-1" />
            <div className="font-display text-2xl" style={{ color: stat.color }}>
              {stat.value}
            </div>
            <div className="mt-0.5 text-[10px] uppercase tracking-[0.4px]" style={{ color: '#6B6C80' }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      <RoleNavButtons variant="stack" />

      <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[1.2px]" style={{ color: '#A7A8B5' }}>
        My Tickets
      </div>

      {ticketsLoading ? (
        <div className="mb-5 flex flex-col gap-2.5">
          <div className="h-[84px] animate-pulse rounded-2xl" style={{ background: 'rgba(255,255,255,0.04)' }} />
          <div className="h-[84px] animate-pulse rounded-2xl" style={{ background: 'rgba(255,255,255,0.04)' }} />
        </div>
      ) : ticketsError ? (
        <div className="mb-5 flex flex-col items-center gap-3 rounded-2xl px-5 py-8 text-center" style={{ background: 'rgba(255,90,46,0.05)', border: '1px solid rgba(255,90,46,0.18)' }}>
          <AlertTriangle size={24} strokeWidth={1.5} color="#FF5A2E" />
          <div className="text-[13px]" style={{ color: '#A7A8B5' }}>Couldn&apos;t load your tickets.</div>
          <button
            onClick={() => setTicketsAttempt((a) => a + 1)}
            className="flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-all duration-200 active:scale-95"
            style={{ background: 'rgba(255,90,46,0.12)', border: '1px solid rgba(255,90,46,0.28)', color: '#FF5A2E' }}
          >
            <RefreshCw size={12} strokeWidth={2.5} />
            Retry
          </button>
        </div>
      ) : tickets.length === 0 ? (
        <div className="mb-5 flex flex-col items-center gap-3 rounded-2xl px-5 py-8 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <TicketCheck size={26} strokeWidth={1.5} color="#6B6C80" />
          <div className="font-heading text-[15px] font-bold" style={{ color: '#FFFFFF' }}>
            No tickets yet
          </div>
          <div className="max-w-[240px] text-xs" style={{ color: '#A7A8B5' }}>
            Buy a ticket to any event and it&apos;ll show up here, ready to flash at the door.
          </div>
          <Link href="/" className="btn-primary mt-1 px-6 py-2.5 text-xs font-bold">
            Discover Events
          </Link>
        </div>
      ) : (
        <div className="mb-5 flex flex-col gap-2.5">
          {tickets.map((t) => (
            <Link
              key={t.id}
              href={`/ticket/${t.id}`}
              className="flex items-center gap-3 rounded-2xl p-2.5 transition-all duration-200 active:scale-[0.98]"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <div className="relative h-[68px] w-[68px] flex-shrink-0 overflow-hidden rounded-[12px]" style={{ background: t.party.gradient }}>
                <PartyPhoto src={partyPhoto(t.party.id)} alt={t.party.title} gradient={t.party.gradient} sizes="68px" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-heading text-[13px] font-bold" style={{ color: '#FFFFFF' }}>{t.party.title}</div>
                <div className="mt-0.5 truncate text-[11px]" style={{ color: '#A7A8B5' }}>{t.party.date} · {t.party.time}</div>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="rounded-full px-2 py-[2px] text-[10px] font-semibold" style={{ background: 'rgba(255,90,46,0.12)', border: '1px solid rgba(255,90,46,0.25)', color: '#FF7F5C' }}>
                    {t.ticketTypeName} × {t.quantity}
                  </span>
                  <span className="truncate text-[10px]" style={{ color: '#6B6C80' }}>{t.orderRef}</span>
                </div>
              </div>
              <span className="flex-shrink-0 rounded-full px-2 py-[3px] text-[10px] font-bold uppercase tracking-[0.5px]" style={{ background: 'rgba(62,207,142,0.1)', border: '1px solid rgba(62,207,142,0.25)', color: '#3ECF8E' }}>
                Confirmed
              </span>
            </Link>
          ))}
        </div>
      )}

      <div className="mb-2.5 flex items-center justify-between glass rounded-2xl px-4 py-3.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
        <div>
          <div className="text-[13px] font-semibold" style={{ color: '#FFFFFF' }}>Push Notifications</div>
          <div className="mt-px text-[11px]" style={{ color: '#A7A8B5' }}>Get reminded before parties start</div>
        </div>
        <div
          onClick={togglePush}
          className="relative h-[22px] w-10 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-150"
          style={{ background: pushEnabled ? '#FF5A2E' : 'rgba(255,255,255,0.12)' }}
        >
          <div
            className="absolute left-[2px] top-[2px] h-[18px] w-[18px] rounded-full bg-white transition-transform duration-150 ease-out"
            style={{ transform: `translateX(${pushEnabled ? 18 : 0}px)` }}
          />
        </div>
      </div>

      {reminderList.length > 0 && (
        <>
          <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[1.2px]" style={{ color: '#A7A8B5' }}>
            Upcoming Reminders
          </div>
          <div className="mb-5 flex flex-col gap-2">
            {reminderList.map((p) => (
              <div key={p.id} className="flex items-center gap-2.5 glass rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <div className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-[9px]" style={{ background: 'rgba(255,179,71,0.12)' }}>
                  <Bell size={15} color="#FFB347" strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold" style={{ color: '#FFFFFF' }}>{p.title}</div>
                  <div className="text-[11px]" style={{ color: '#A7A8B5' }}>{p.date} · {p.time}</div>
                </div>
                <button onClick={() => removeReminder(p.id)} className="flex-shrink-0 p-1 transition-transform duration-150 active:scale-90" style={{ color: '#6B6C80' }}>
                  <X size={13} strokeWidth={2} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <Link
        href="/saved"
        className="mb-2.5 flex w-full items-center justify-between glass rounded-xl px-4 py-[15px] text-sm font-medium transition-all duration-200 hover:border-[rgba(255,255,255,0.15)]"
        style={{ background: 'rgba(255,255,255,0.03)', color: '#FFFFFF' }}
      >
        My Saved Parties
        <span style={{ color: '#A7A8B5' }}>→</span>
      </Link>
      <Link
        href="/host"
        className="mb-4 flex w-full items-center justify-between glass rounded-xl px-4 py-[15px] text-sm font-medium transition-all duration-200 hover:border-[rgba(255,255,255,0.15)]"
        style={{ background: 'rgba(255,255,255,0.03)', color: '#FFFFFF' }}
      >
        List an Event
        <span style={{ color: '#A7A8B5' }}>→</span>
      </Link>
      <button
        onClick={async () => {
          await logout();
          router.push('/');
        }}
        className="w-full rounded-xl py-[15px] text-sm font-semibold transition-all duration-200 active:scale-[0.98]"
        style={{ background: 'rgba(255,90,46,0.08)', border: '1px solid rgba(255,90,46,0.22)', color: '#FF5A2E' }}
      >
        Log Out
      </button>
    </div>
  );
}
