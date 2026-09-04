'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2 } from 'lucide-react';
import BackButton from '@/components/BackButton';
import PartyForm from '@/components/PartyForm';
import { createParty, type PartyFormInput } from '@/lib/queries';
import { useLagosLiveStore } from '@/lib/store';

export default function NewEventPage() {
  const router = useRouter();
  const user = useLagosLiveStore((s) => s.user);
  const authLoading = useLagosLiveStore((s) => s.authLoading);
  const showToast = useLagosLiveStore((s) => s.showToast);
  const refreshUser = useLagosLiveStore((s) => s.refreshUser);
  const [submittedTitle, setSubmittedTitle] = useState<string | null>(null);
  const [wasPromoted, setWasPromoted] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login?next=%2Fhost%2Fnew');
  }, [authLoading, user, router]);

  if (authLoading || !user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 size={26} strokeWidth={2} color="#FF2D95" className="animate-spin" />
      </div>
    );
  }

  const submit = async (input: PartyFormInput) => {
    const { party, promoted } = await createParty(input, user.id);
    setSubmittedTitle(input.title);
    if (promoted) {
      await refreshUser();
      setWasPromoted(true);
      showToast('Welcome to Lagos Live Hosts!', "You're now an organizer. Create and manage events from your host dashboard.");
    } else {
      showToast('Event submitted', 'Your event is pending admin review.');
    }
  };

  if (submittedTitle) {
    return (
      <div className="mx-auto flex min-h-screen max-w-[520px] flex-col animate-fade-in">
        <div
          className="sticky top-0 z-40 flex items-center gap-3 border-b px-5 py-3.5 backdrop-blur-[22px] backdrop-saturate-150"
          style={{ background: 'var(--c-header)', borderColor: 'rgba(255,255,255,0.04)' }}
        >
          <BackButton href="/host" />
          <span className="font-heading text-[13px] font-bold uppercase tracking-[1px]" style={{ color: '#FFFFFF' }}>
            Event Submitted
          </span>
        </div>
        <div className="flex flex-1 flex-col items-center px-6 py-[52px] text-center">
          <div
            className="mb-5 flex h-[72px] w-[72px] items-center justify-center rounded-full"
            style={{ background: 'rgba(0,245,212,0.08)', border: '1px solid rgba(0,245,212,0.2)' }}
          >
            <CheckCircle2 size={32} color="#00F5D4" strokeWidth={2.5} />
          </div>
          <h1 className="font-display mb-2 text-[36px] tracking-[1px]" style={{ color: '#FFFFFF' }}>
            {wasPromoted ? "You're a Host!" : 'Event Submitted!'}
          </h1>
          {wasPromoted && (
            <div
              className="mb-5 w-full max-w-[340px] rounded-2xl p-4 text-left"
              style={{ background: 'rgba(255,45,149,0.08)', border: '1px solid rgba(255,45,149,0.2)' }}
            >
              <div className="mb-1.5 text-[13px] font-bold" style={{ color: '#FF2D95' }}>Welcome to Lagos Live Hosts!</div>
              <div className="text-[12px] leading-[1.6]" style={{ color: '#A7A8B5' }}>
                Your account has been upgraded. You can now create, manage, and track all your events from the host dashboard.
              </div>
            </div>
          )}
          <p className="mb-6 max-w-[320px] text-sm leading-[1.7]" style={{ color: '#A7A8B5' }}>
            <strong style={{ color: '#FFFFFF' }}>{submittedTitle}</strong> is now pending review. It&apos;ll go live on
            Lagos Live as soon as an admin approves it.
          </p>
          <div
            className="mb-7 w-full max-w-[340px] rounded-2xl p-4 text-left"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[1.2px]" style={{ color: '#A7A8B5' }}>
              What happens next
            </div>
            <ol className="flex flex-col gap-2 text-[13px]" style={{ color: '#A7A8B5' }}>
              <li className="flex gap-2">
                <span style={{ color: '#FFD600' }}>1.</span> An admin reviews your listing.
              </li>
              <li className="flex gap-2">
                <span style={{ color: '#FFD600' }}>2.</span> Once approved, it appears on the main feed and search.
              </li>
              <li className="flex gap-2">
                <span style={{ color: '#FFD600' }}>3.</span> Track tickets &amp; revenue from Your Events.
              </li>
            </ol>
          </div>
          <div className="flex w-full max-w-[340px] flex-col gap-2.5">
            <Link href="/host" className="btn-primary w-full py-[15px] text-center text-sm font-bold">
              View My Events
            </Link>
            <Link
              href="/"
              className="w-full rounded-xl py-[15px] text-sm font-semibold glass glass-hover"
              style={{ color: '#A7A8B5' }}
            >
              Done
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[520px] animate-fade-in">
      <div
        className="sticky top-0 z-40 flex items-center gap-3 border-b px-5 py-3.5 backdrop-blur-[22px] backdrop-saturate-150"
        style={{ background: 'var(--c-header)', borderColor: 'rgba(255,255,255,0.04)' }}
      >
        <BackButton href="/host" />
        <span className="font-heading text-[13px] font-bold uppercase tracking-[1px]" style={{ color: '#FFFFFF' }}>
          List a New Event
        </span>
      </div>
      <div className="flex flex-col gap-4 p-5">
        <div
          className="rounded-2xl px-4 py-3.5 text-[13px] leading-[1.6]"
          style={{ background: 'rgba(255,214,0,0.06)', border: '1px solid rgba(255,214,0,0.15)', color: '#A7A8B5' }}
        >
          <span style={{ color: '#FFD600', fontWeight: 600 }}>Heads up:</span> new events are reviewed by an admin before
          going live. Submit your listing and we&apos;ll get it approved fast.
        </div>
        <PartyForm onSubmit={submit} submitLabel="Submit Event" />
      </div>
    </div>
  );
}
