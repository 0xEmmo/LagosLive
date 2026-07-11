'use client';

import { useEffect } from 'react';
import { useRouter, notFound } from 'next/navigation';
import BackButton from '@/components/BackButton';
import PartyForm from '@/components/PartyForm';
import { updateParty, type PartyFormInput } from '@/lib/queries';
import { useParty } from '@/lib/hooks/useParty';
import { useLagosLiveStore } from '@/lib/store';

export default function EditEventPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const user = useLagosLiveStore((s) => s.user);
  const authLoading = useLagosLiveStore((s) => s.authLoading);
  const { party, loading } = useParty(Number(params.id));

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [authLoading, user, router]);

  if (!user) return null;
  if (!party) {
    if (loading) return null;
    notFound();
  }
  if (party.createdBy !== user.id) {
    // Not your event — RLS would reject the update anyway, redirect rather
    // than show a form that can't actually save.
    router.replace('/host');
    return null;
  }

  const submit = async (input: PartyFormInput) => {
    await updateParty(party.id, input, user.id);
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
          Edit Event
        </span>
      </div>
      <div className="p-5">
        <PartyForm initial={party} onSubmit={submit} submitLabel="Save Changes" />
      </div>
    </div>
  );
}
