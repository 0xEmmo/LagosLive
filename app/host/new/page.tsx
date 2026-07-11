'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import BackButton from '@/components/BackButton';
import PartyForm from '@/components/PartyForm';
import { createParty, type PartyFormInput } from '@/lib/queries';
import { useLagosLiveStore } from '@/lib/store';

export default function NewEventPage() {
  const router = useRouter();
  const user = useLagosLiveStore((s) => s.user);
  const authLoading = useLagosLiveStore((s) => s.authLoading);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [authLoading, user, router]);

  if (!user) return null;

  const submit = async (input: PartyFormInput) => {
    const party = await createParty(input, user.id);
    router.push(`/party/${party.id}`);
  };

  return (
    <div className="mx-auto max-w-[520px] animate-fade-in">
      <div
        className="sticky top-0 z-40 flex items-center gap-3 border-b px-5 py-3.5 backdrop-blur-[22px] backdrop-saturate-150"
        style={{ background: 'var(--c-header)', borderColor: 'var(--c-border)' }}
      >
        <BackButton href="/host" />
        <span className="font-heading text-[13px] font-bold uppercase tracking-[1px]" style={{ color: 'var(--c-text)' }}>
          List a New Event
        </span>
      </div>
      <div className="p-5">
        <PartyForm onSubmit={submit} submitLabel="Publish Event" />
      </div>
    </div>
  );
}
