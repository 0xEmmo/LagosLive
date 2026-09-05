'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw, ShieldCheck, CalendarDays, Users, QrCode, Lock } from 'lucide-react';
import BackButton from '@/components/BackButton';
import PartyPhoto from '@/components/PartyPhoto';
import { useLagosLiveStore } from '@/lib/store';
import { fetchCheckInEvents } from '@/lib/queries';
import { partyPhoto } from '@/lib/data';
import { ci } from '@/lib/check-in/ui';
import type { Party } from '@/lib/types';

const STAFF_ROLES = ['finance', 'admin', 'super_admin'];

function canOperateDoor(role: string | undefined): boolean {
  return role === 'organizer' || (!!role && STAFF_ROLES.includes(role));
}

export default function CheckInHomePage() {
  const router = useRouter();
  const user = useLagosLiveStore((s) => s.user);
  const authLoading = useLagosLiveStore((s) => s.authLoading);
  const [events, setEvents] = useState<Party[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login?next=/check-in');
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    if (!canOperateDoor(user.role)) {
      setEvents([]);
      return;
    }
    let cancelled = false;
    setError(null);
    fetchCheckInEvents(user.id, user.role)
      .then((rows) => {
        if (cancelled) return;
        setEvents(rows);
        if (rows.length === 1) router.replace(`/check-in/${rows[0]!.id}`);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load events.');
          setEvents([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user, attempt, router]);

  if (!user) {
    if (authLoading) {
      return (
        <div className="flex min-h-screen items-center justify-center" style={{ background: ci.surface }}>
          <Loader2 size={26} strokeWidth={2} color={ci.accent} className="animate-spin" />
        </div>
      );
    }
    return null;
  }

  if (!canOperateDoor(user.role)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center" style={{ background: ci.surface }}>
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: ci.raised, border: `1px solid ${ci.line}` }}>
          <Lock size={26} strokeWidth={1.5} color={ci.dim} />
        </div>
        <h1 className="font-display text-[26px] tracking-[1px]" style={{ color: ci.text }}>
          Check-in is for hosts &amp; staff
        </h1>
        <p className="max-w-[280px] text-sm leading-relaxed" style={{ color: ci.muted }}>
          Event hosts, admins and finance staff can run the door. Ask your event host to grant you access.
        </p>
        <Link
          href="/"
          className="mt-2 rounded-[14px] px-7 py-3 text-sm font-bold"
          style={{ background: ci.gradient, color: '#FFFFFF', boxShadow: ci.buttonShadow }}
        >
          Back to Lagos Live
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-[520px] animate-fade-in" style={{ background: ci.surface }}>
      <header className="sticky top-0 z-40 border-b px-5 py-3.5" style={{ background: 'rgba(19,19,22,0.9)', borderColor: ci.line, backdropFilter: 'blur(22px)' }}>
        <div className="flex items-center gap-3">
          <BackButton href="/host" label="" />
          <div>
            <span className="font-heading text-[13px] font-bold uppercase tracking-[1px]" style={{ color: ci.text }}>
              Check In
            </span>
            <div className="text-[11px]" style={{ color: ci.dim }}>
              {user.role === 'organizer' ? 'Your events' : 'All live events'}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-1.5 rounded-full px-2.5 py-1" style={{ background: ci.raised, border: `1px solid ${ci.line}` }}>
            <ShieldCheck size={12} strokeWidth={2} color={ci.ok} />
            <span className="text-[10px] font-semibold uppercase tracking-[0.5px]" style={{ color: ci.muted }}>
              Door access verified
            </span>
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-4 p-5">
        <div>
          <h1 className="font-display text-[28px] leading-none" style={{ color: ci.text }}>
            Select event
          </h1>
          <p className="mt-1.5 text-[13px]" style={{ color: ci.muted }}>
            Pick the event you&apos;re running the entrance for.
          </p>
        </div>

        {error ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl px-6 py-12 text-center" style={{ background: ci.raised, border: `1px solid ${ci.line}` }}>
            <div className="text-sm" style={{ color: ci.muted }}>
              Couldn&apos;t load your events. Check your connection and try again.
            </div>
            <button
              onClick={() => setAttempt((a) => a + 1)}
              className="flex items-center gap-2 rounded-[10px] px-4 py-2 text-[13px] font-semibold"
              style={{ background: ci.warnSoft, border: `1px solid rgba(255,179,71,0.3)`, color: ci.gold }}
            >
              <RefreshCw size={13} strokeWidth={2.5} />
              Retry
            </button>
          </div>
        ) : events === null ? (
          <div className="flex flex-col gap-2.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[92px] animate-pulse rounded-2xl" style={{ background: ci.raised }} />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl px-6 py-14 text-center" style={{ background: ci.raised, border: `1px solid ${ci.line}` }}>
            <div className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: ci.warnSoft }}>
              <CalendarDays size={22} strokeWidth={1.5} color={ci.gold} />
            </div>
            <div>
              <div className="font-heading text-[16px] font-bold" style={{ color: ci.text }}>
                No events available
              </div>
              <div className="mt-1 max-w-[260px] text-[13px]" style={{ color: ci.muted }}>
                {user.role === 'organizer'
                  ? 'You need an approved, upcoming event to check guests in.'
                  : 'No approved events are live in the 12-hour door window right now.'}
              </div>
            </div>
            <Link href="/host/new" className="mt-1 rounded-[12px] px-6 py-3 text-[13px] font-bold" style={{ background: ci.gradient, color: '#FFFFFF', boxShadow: ci.buttonShadow }}>
              List Your Event
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {events.map((p) => (
              <Link
                key={p.id}
                href={`/check-in/${p.id}`}
                className="flex items-center gap-3 rounded-2xl p-3 transition-transform active:scale-[0.98]"
                style={{ background: ci.raised, border: `1px solid ${ci.line}`, cursor: 'pointer' }}
              >
                <div className="relative h-[64px] w-[64px] flex-shrink-0 overflow-hidden rounded-[12px]" style={{ background: p.gradient }}>
                  <PartyPhoto src={partyPhoto(p.id, p.coverUrl)} alt={p.title} gradient={p.gradient} sizes="64px" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-heading text-[14px] font-bold" style={{ color: ci.text }}>
                    {p.title}
                  </div>
                  <div className="mt-0.5 text-[12px]" style={{ color: ci.muted }}>
                    {p.date} · {p.time}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px]" style={{ color: ci.dim }}>
                    <Users size={11} strokeWidth={2} />
                    {p.location}
                  </div>
                </div>
                <div
                  className="flex flex-shrink-0 items-center gap-1.5 rounded-[11px] px-3.5 py-2.5 text-[12px] font-bold"
                  style={{ background: ci.gradient, color: '#FFFFFF', boxShadow: ci.buttonShadow }}
                >
                  <QrCode size={13} strokeWidth={2} />
                  Start
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}