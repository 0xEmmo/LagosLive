'use client';

import { useEffect } from 'react';
import { useRouter, notFound } from 'next/navigation';
import BackButton from '@/components/BackButton';
import PartyForm from '@/components/PartyForm';
import { updateParty, deleteParty, type PartyFormInput } from '@/lib/queries';
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
  if (party.createdBy !== user.id && !user.isAdmin) {
    // Not your event and not an admin — RLS would reject the update anyway,
    // redirect rather than show a form that can't actually save.
    router.replace('/host');
    return null;
  }

  const isAdminEditingOthersEvent = user.isAdmin && party.createdBy !== user.id;

  const submit = async (input: PartyFormInput) => {
    await updateParty(party.id, input);
    router.push(isAdminEditingOthersEvent ? '/admin' : `/party/${party.id}`);
  };

  const remove = async () => {
    if (!confirm(`Delete "${party.title}" permanently? This can't be undone.`)) return;
    try {
      await deleteParty(party.id);
      router.push(isAdminEditingOthersEvent ? '/admin' : '/host');
    } catch (err) {
      alert(
        err instanceof Error && err.message.includes('foreign key')
          ? "Can't delete — this event already has ticket orders. Suspend it instead."
          : 'Something went wrong deleting this event.'
      );
    }
  };

  return (
    <div className="mx-auto max-w-[520px] animate-fade-in">
      <div
        className="sticky top-0 z-40 flex items-center gap-3 border-b px-5 py-3.5 backdrop-blur-[22px] backdrop-saturate-150"
        style={{ background: 'var(--c-header)', borderColor: 'var(--c-border)' }}
      >
        <BackButton href={isAdminEditingOthersEvent ? '/admin' : '/host'} />
        <span className="font-heading text-[13px] font-bold uppercase tracking-[1px]" style={{ color: 'var(--c-text)' }}>
          Edit Event
        </span>
      </div>
      <div className="p-5">
        {isAdminEditingOthersEvent && (
          <div className="mb-4 rounded-[10px] border px-3.5 py-2.5 text-[13px]" style={{ background: 'rgba(255,197,103,0.14)', borderColor: 'rgba(255,197,103,0.4)', color: '#9A6A00' }}>
            You&apos;re editing {party.organizer}&apos;s event as an admin.
          </div>
        )}
        <PartyForm initial={party} onSubmit={submit} submitLabel="Save Changes" />
        <button
          onClick={remove}
          className="mt-3 w-full rounded-xl border py-[13px] text-sm font-semibold transition-transform duration-150 active:scale-[0.98]"
          style={{ background: 'rgba(214,64,44,0.1)', borderColor: 'rgba(214,64,44,0.32)', color: '#D6402C' }}
        >
          Delete Event
        </button>
      </div>
    </div>
  );
}
