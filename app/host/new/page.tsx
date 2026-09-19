'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2 } from 'lucide-react';
import HostDashboardNav from '@/components/HostDashboardNav';
import PartyForm from '@/components/PartyForm';
import { createParty, submitEventForReview, type PartyFormInput, type PartySubmitMode } from '@/lib/queries';
import { notifyTelegramEvent } from '@/lib/telegram-client';
import { useLagosLiveStore } from '@/lib/store';

interface CreatedEvent {
  title: string;
  id: number;
  mode: PartySubmitMode;
}

export default function NewEventPage() {
  const router = useRouter();
  const user = useLagosLiveStore((s) => s.user);
  const authLoading = useLagosLiveStore((s) => s.authLoading);
  const showToast = useLagosLiveStore((s) => s.showToast);
  const refreshUser = useLagosLiveStore((s) => s.refreshUser);
  const [created, setCreated] = useState<CreatedEvent | null>(null);
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

  // One shared save path, two intents:
  //   draft  -> create the event and leave it in the draft state (private,
  //             no admin review, no ops Telegram ping).
  //   submit -> create it and immediately push it into pending review, which
  //             is what fires the "NEW EVENT CREATED / SUBMITTED FOR REVIEW"
  //             Telegram notification. Reopening the event to find another
  //             submit button is never needed.
  const submit = async (input: PartyFormInput, mode: PartySubmitMode) => {
    const { party, promoted } = await createParty(input, user.id);
    if (promoted) {
      await refreshUser();
      setWasPromoted(true);
    }
    if (mode === 'submit') {
      try {
        await submitEventForReview(party.id);
        await notifyTelegramEvent(party.id, 'event_created');
      } catch (err) {
        // The event was created (as a draft) but the review push failed. Never
        // roll it back, and never let the host retype the form — a retry here
        // would create a duplicate event. Land on the draft screen instead, from
        // which "Continue Editing Draft" and the edit page's Submit button pick
        // the review push back up.
        setCreated({ title: input.title, id: party.id, mode: 'draft' });
        showToast('Saved as draft', err instanceof Error ? err.message : "Couldn't submit for review right now.");
        return;
      }
      showToast('Event submitted for review', 'Your event is with the review team.');
    } else {
      showToast('Event saved as draft', 'Submit it for review when it\u2019s ready.');
    }
    setCreated({ title: input.title, id: party.id, mode });
  };

  if (created) {
    const submitted = created.mode === 'submit';
    return (
      <div className="mx-auto flex min-h-screen max-w-[520px] flex-col animate-fade-in md:max-w-[900px]">
        <HostDashboardNav title={submitted ? 'Event Submitted' : 'Draft Saved'} />
        <div className="flex flex-1 flex-col items-center px-6 py-[52px] text-center">
          <div
            className="mb-5 flex h-[72px] w-[72px] items-center justify-center rounded-full"
            style={{ background: 'rgba(0,245,212,0.08)', border: '1px solid rgba(0,245,212,0.2)' }}
          >
            <CheckCircle2 size={32} color="#00F5D4" strokeWidth={2.5} />
          </div>
          <h1 className="font-display mb-2 text-[36px] tracking-[1px]" style={{ color: '#FFFFFF' }}>
            {wasPromoted ? "You're a Host!" : submitted ? 'Submitted for Review!' : 'Draft Saved!'}
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
            {submitted ? (
              <>
                <strong style={{ color: '#FFFFFF' }}>{created.title}</strong> is now with the Lagos Live admin team. It&apos;ll
                go live as soon as it&apos;s approved.
              </>
            ) : (
              <>
                <strong style={{ color: '#FFFFFF' }}>{created.title}</strong> is saved as a draft. You can come back
                anytime and submit it for review when you&apos;re ready.
              </>
            )}
          </p>
          <div
            className="mb-7 w-full max-w-[340px] rounded-2xl p-4 text-left"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[1.2px]" style={{ color: '#A7A8B5' }}>
              What happens next
            </div>
            <ol className="flex flex-col gap-2 text-[13px]" style={{ color: '#A7A8B5' }}>
              {submitted ? (
                <>
                  <li className="flex gap-2">
                    <span style={{ color: '#FFD600' }}>1.</span> An admin reviews your listing.
                  </li>
                  <li className="flex gap-2">
                    <span style={{ color: '#FFD600' }}>2.</span> Once approved, it appears on the main feed and search.
                  </li>
                  <li className="flex gap-2">
                    <span style={{ color: '#FFD600' }}>3.</span> Guests can start booking tickets.
                  </li>
                </>
              ) : (
                <>
                  <li className="flex gap-2">
                    <span style={{ color: '#FFD600' }}>1.</span> Your listing stays private as a draft until you submit it.
                  </li>
                  <li className="flex gap-2">
                    <span style={{ color: '#FFD600' }}>2.</span> Submit it for review when it&apos;s ready.
                  </li>
                  <li className="flex gap-2">
                    <span style={{ color: '#FFD600' }}>3.</span> Once approved, it appears on the main feed and search.
                  </li>
                </>
              )}
            </ol>
          </div>
          <div className="flex w-full max-w-[340px] flex-col gap-2.5">
            {!submitted && (
              <Link href={`/host/${created.id}/edit`} className="btn-primary w-full py-[15px] text-center text-sm font-bold">
                Continue Editing Draft
              </Link>
            )}
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
    <div className="mx-auto max-w-[520px] animate-fade-in md:max-w-[900px]">
      <HostDashboardNav title="List a New Event" />
      <div className="flex flex-col gap-4 p-5">
        <div
          className="rounded-2xl px-4 py-3.5 text-[13px] leading-[1.6]"
          style={{ background: 'rgba(255,214,0,0.06)', border: '1px solid rgba(255,214,0,0.15)', color: '#A7A8B5' }}
        >
          <span style={{ color: '#FFD600', fontWeight: 600 }}>Heads up:</span> new events are reviewed by an admin before
          going live. Submit your listing and we&apos;ll get it approved fast.
        </div>
        <PartyForm onSubmit={submit} />
      </div>
    </div>
  );
}
