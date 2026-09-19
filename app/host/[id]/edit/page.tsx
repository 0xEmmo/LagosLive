'use client';

import { useEffect, useState } from 'react';
import { useRouter, notFound } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import HostDashboardNav from '@/components/HostDashboardNav';
import PartyForm from '@/components/PartyForm';
import DeleteEventDialog from '@/components/DeleteEventDialog';
import { updateParty, deleteParty, fetchTicketTypes, submitEventForReview, type PartyFormInput, type PartySubmitMode, type TicketFormType } from '@/lib/queries';
import { notifyTelegramEvent } from '@/lib/telegram-client';
import { useParty } from '@/lib/hooks/useParty';
import { useLagosLiveStore } from '@/lib/store';

export default function EditEventPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const user = useLagosLiveStore((s) => s.user);
  const authLoading = useLagosLiveStore((s) => s.authLoading);
  const showToast = useLagosLiveStore((s) => s.showToast);
  const { party, loading } = useParty(Number(params.id));
  const [ticketTypes, setTicketTypes] = useState<TicketFormType[] | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    fetchTicketTypes(Number(params.id))
      .then((types) => setTicketTypes(types))
      .catch(() => setTicketTypes([]));
  }, [params.id]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login?next=' + encodeURIComponent(`/host/${params.id}/edit`));
    }
  }, [authLoading, user, router, params.id]);

  if (authLoading || !user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 size={26} strokeWidth={2} color="#FF2D95" className="animate-spin" />
      </div>
    );
  }
  if (!party) {
    if (loading) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 size={26} strokeWidth={2} color="#FF2D95" className="animate-spin" />
        </div>
      );
    }
    notFound();
  }
  if (party.createdBy !== user.id && !user.isAdmin) {
    router.replace('/host');
    return null;
  }

  const isAdminEditingOthersEvent = user.isAdmin && party.createdBy !== user.id;

  // mode: 'submit' means the host explicitly chose "Submit for Review", so after
  // the save the event is pushed into pending review and the ops Telegram ping
  // fires exactly once for that transition. Admins editing someone else's event
  // only save (they moderate through /admin), and an already-pending event is
  // never submitted twice (the server RPC also refuses draft/rejected-only).
  const submit = async (input: PartyFormInput, mode: PartySubmitMode) => {
    // Phase 5: notify attending guests when a live event's key details shift.
    const changes: string[] = [];
    if (new Date(party.startsAt).getTime() !== new Date(input.startsAt).getTime()) {
      changes.push('Date & time updated');
    }
    if (party.location !== input.location) changes.push('Venue changed');
    if (party.address !== input.address) changes.push('Address changed');

    await updateParty(party.id, input);

    if (changes.length > 0) {
      fetch('/api/events/notify-changes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partyId: party.id, changes }),
      }).catch(() => {
        // Best-effort — a failed change email must never block a save.
      });
    }

    if (mode === 'submit' && !isAdminEditingOthersEvent && (party.status === 'draft' || party.status === 'rejected')) {
      await submitEventForReview(party.id);
      await notifyTelegramEvent(party.id, 'event_created');
      showToast('Event submitted for review', 'Your event is with the review team.');
    }

    router.push(isAdminEditingOthersEvent ? '/admin' : `/party/${party.id}`);
  };

  const remove = async () => {
    try {
      await deleteParty(party.id);
      setDeleteOpen(false);
      router.push(isAdminEditingOthersEvent ? '/admin' : '/host');
    } catch (err) {
      setDeleteOpen(false);
      alert(
        err instanceof Error && err.message.includes('foreign key')
          ? "Can't delete — this event already has ticket orders. Suspend it instead."
          : 'Something went wrong deleting this event.'
      );
    }
  };

  return (
    <div className="mx-auto max-w-[520px] animate-fade-in md:max-w-[900px]">
      <HostDashboardNav title="Edit Event" backHref={isAdminEditingOthersEvent ? '/admin' : '/host'} />
      <div className="p-5">
        {isAdminEditingOthersEvent && (
          <div className="mb-4 rounded-[10px] px-3.5 py-2.5 text-[13px]" style={{ background: 'rgba(255,214,0,0.08)', border: '1px solid rgba(255,214,0,0.2)', color: '#FFD600' }}>
            You&apos;re editing {party.organizer}&apos;s event as an admin.
          </div>
        )}
        {!isAdminEditingOthersEvent && party.status === 'pending' && (
          <div className="mb-4 rounded-[10px] px-3.5 py-2.5 text-[13px]" style={{ background: 'rgba(255,214,0,0.08)', border: '1px solid rgba(255,214,0,0.2)', color: '#FFD600' }}>
            This event is pending review and isn&apos;t public yet. Edits you make now will be included in the review.
          </div>
        )}
        {ticketTypes === null ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <Loader2 size={26} strokeWidth={2} color="#FF2D95" className="animate-spin" />
          </div>
        ) : (
          <PartyForm initial={party} initialTicketTypes={ticketTypes} onSubmit={submit} disableSubmit={isAdminEditingOthersEvent} />
        )}
        <button
          onClick={() => setDeleteOpen(true)}
          className="mt-3 w-full rounded-xl py-[13px] text-sm font-semibold transition-all duration-200 active:scale-[0.98]"
          style={{ background: 'rgba(255,138,0,0.08)', border: '1px solid rgba(255,138,0,0.2)', color: '#FF8A00' }}
        >
          Delete Event
        </button>
        <DeleteEventDialog open={deleteOpen} eventName={party.title} onClose={() => setDeleteOpen(false)} onDelete={remove} />
      </div>
    </div>
  );
}
