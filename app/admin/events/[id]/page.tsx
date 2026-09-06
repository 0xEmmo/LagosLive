'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Check, X, Ban, RotateCcw, Flag, Download, Trash2, MapPin, Clock, Ticket, QrCode } from 'lucide-react';
import AdminShell from '@/components/admin-shell';
import { PageHeader, LoadingBlock, ErrorBlock, EmptyBlock, TableShell, Cell, usePermissionGuard, Badge, StatCard } from '@/components/ui/dashboard-ui';
import { usePermission } from '@/lib/hooks/usePermission';
import { fetchAdminEvent, fetchEventOrders, flagEvent, updateEventNotes, fetchAdminNotes, createAdminNote, deleteAdminNote, logAudit, type AdminEventJoined, type AdminOrderJoined, type NoteRow, toCsv, downloadCsv } from '@/lib/admin-queries';
import { setEventReviewStatus } from '@/lib/queries';
import { useLagosLiveStore } from '@/lib/store';
import { formatNaira } from '@/lib/filters';

const PAYMENT_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  confirmed: { label: 'Paid', bg: 'rgba(0,245,212,0.08)', color: '#00F5D4' },
  pending: { label: 'Pending', bg: 'rgba(255,214,0,0.1)', color: '#FFD600' },
  failed: { label: 'Failed', bg: 'rgba(255,138,0,0.08)', color: '#FF8A00' },
  cancelled: { label: 'Cancelled', bg: 'rgba(255,45,149,0.1)', color: '#FF2D95' },
};

export default function AdminEventDetailPage() {
  const { ready } = usePermissionGuard('events.view');
  const { hasPermission: canEdit } = usePermission('events.edit');
  const { hasPermission: canApprove } = usePermission('events.approve');
  const { hasPermission: canReject } = usePermission('events.reject');
  const { hasPermission: canCancel } = usePermission('events.cancel');
  const { hasPermission: canExport } = usePermission('attendees.export');
  const { hasPermission: canCheckin } = usePermission('attendees.checkin');
  const { hasPermission: canWriteNotes } = usePermission('support.reply');
  const { hasPermission: canDeleteNotes } = usePermission('staff.suspend');
  const routeParams = useParams<{ id: string }>();
  const showToast = useLagosLiveStore((s) => s.showToast);

  const [event, setEvent] = useState<AdminEventJoined | null>(null);
  const [orders, setOrders] = useState<AdminOrderJoined[]>([]);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [noteBody, setNoteBody] = useState('');
  const [status, setStatus] = useState<'loading' | 'error' | 'ok'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [noteBusy, setNoteBusy] = useState(false);

  const id = Number(routeParams.id);

  const load = useCallback(async () => {
    if (!id) return;
    setStatus('loading');
    try {
      const [ev, ords, noteData] = await Promise.all([
        fetchAdminEvent(id),
        fetchEventOrders(id),
        fetchAdminNotes('party', String(id)),
      ]);
      setEvent(ev);
      setOrders(ords);
      setNotes(noteData);
      setStatus('ok');
    } catch {
      setStatus('error');
    }
  }, [id]);

  useEffect(() => {
    if (!ready) return;
    load();
  }, [ready, load, attempt]);

  const setStatusOf = async (next: string) => {
    if (!event) return;
    let reason: string | undefined;
    if (next === 'rejected' || next === 'suspended') {
      reason = prompt(`${next === 'suspended' ? 'Suspend' : 'Reject'} "${event.title}" — add a reason the host will see:`) ?? '';
      if (!reason.trim()) {
        showToast('Reason required', `Add a reason to ${next} an event.`);
        return;
      }
    }
    try {
      await setEventReviewStatus(event.id, next as never, reason);
      setEvent((e) => (e ? { ...e, status: next } : e));
      showToast('Event updated', next);
    } catch {
      showToast('Something went wrong', "Couldn't update the event.");
    }
  };

  const toggleFlag = async () => {
    if (!event) return;
    const next = !event.flagged;
    setEvent((e) => e ? { ...e, flagged: next } : e);
    try {
      await flagEvent(event.id, next);
      await logAudit(next ? 'event_flag' : 'event_unflag', 'event', event.id, { title: event.title });
      showToast(next ? 'Event flagged' : 'Flag removed', `"${event.title}" ${next ? 'flagged for review' : 'flag removed'}.`);
    } catch {
      setEvent((e) => e ? { ...e, flagged: !next } : e);
    }
  };

  const saveNotes = async () => {
    if (!event) return;
    try {
      await updateEventNotes(event.id, noteBody.trim());
      setEvent((e) => e ? { ...e, admin_notes: noteBody.trim() } : e);
      showToast('Notes saved', 'Event notes updated.');
    } catch {
      showToast('Error', "Couldn't save notes.");
    }
  };

  const addNote = async () => {
    const body = noteBody.trim();
    if (!body || !event) return;
    setNoteBusy(true);
    try {
      await createAdminNote('party', String(event.id), body);
      const noteData = await fetchAdminNotes('party', String(event.id));
      setNotes(noteData);
      setNoteBody('');
      showToast('Note added', 'Admin note saved.');
    } catch {
      showToast('Error', "Couldn't add note.");
    } finally {
      setNoteBusy(false);
    }
  };

  const removeNote = async (noteId: number) => {
    try {
      await deleteAdminNote(noteId);
      setNotes((n) => n.filter((x) => x.id !== noteId));
    } catch {
      showToast('Error', "Couldn't delete note.");
    }
  };

  const exportAttendees = () => {
    const csv = toCsv(
      orders.filter((o) => o.payment_status === 'confirmed').map((o) => ({
        'Order Ref': o.order_ref,
        'Guest': o.customer_email ?? 'Guest',
        'Tickets': o.quantity,
        'Amount': o.total / 100,
        'Checked In': o.check_in_status === 'checked_in' ? 'Yes' : 'No',
        'Date': new Date(o.created_at).toLocaleDateString(),
      })),
      ['Order Ref', 'Guest', 'Tickets', 'Amount', 'Checked In', 'Date']
    );
    downloadCsv(`attendees-${event?.title ?? 'event'}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    showToast('Export complete', `${orders.length} attendees exported.`);
  };

  if (!ready) return null;

  const confirmed = orders.filter((o) => o.payment_status === 'confirmed');
  const revenue = confirmed.reduce((s, o) => s + o.total, 0);
  const checkedIn = confirmed.filter((o) => o.check_in_status === 'checked_in').length;
  const refunds = orders.filter((o) => o.refund_status !== 'none').length;

  return (
    <AdminShell>
      <div className="mx-auto max-w-[980px] p-5">
        <Link href="/admin/events" className="mb-4 flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: '#A7A8B5' }}>
          <ArrowLeft size={14} /> Back to events
        </Link>

        {status === 'loading' ? (
          <LoadingBlock />
        ) : status === 'error' ? (
          <ErrorBlock message="Couldn't load this event." onRetry={() => setAttempt((a) => a + 1)} />
        ) : !event ? (
          <EmptyBlock title="Event not found" subtitle="It may have been deleted." />
        ) : (
          <div className="flex flex-col gap-6">
            <PageHeader
              title={event.title}
              subtitle={`${event.date} · ${event.time} · ${event.location}`}
              right={
                <div className="flex flex-wrap gap-2">
                  {event.status === 'approved' && canCheckin && (
                    <Link
                      href={`/check-in/${event.id}`}
                      className="flex items-center gap-1.5 rounded-[9px] border px-2.5 py-1.5 text-[11.5px] font-semibold"
                      style={{ background: 'linear-gradient(135deg, #FF9B3E 0%, #FF6A00 100%)', borderColor: 'transparent', color: '#FFFFFF' }}
                    >
                      <QrCode size={13} /> Check In
                    </Link>
                  )}
                  {event.status === 'approved' && canCancel && <ActionBtn label="Suspend" icon={<Ban size={13} />} color="#FF8A00" onClick={() => setStatusOf('suspended')} />}
                  {(event.status === 'suspended' || event.status === 'rejected') && canApprove && <ActionBtn label="Reinstate" icon={<RotateCcw size={13} />} color="#00F5D4" onClick={() => setStatusOf('approved')} />}
                  {event.status === 'pending' && (
                    <>
                      {canApprove && <ActionBtn label="Approve" icon={<Check size={13} />} color="#00F5D4" onClick={() => setStatusOf('approved')} />}
                      {canReject && <ActionBtn label="Reject" icon={<X size={13} />} color="#FF8A00" onClick={() => setStatusOf('rejected')} />}
                    </>
                  )}
                </div>
              }
            />

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <MiniStat label="Status" value={event.status.toUpperCase()} color={event.status === 'approved' ? '#00F5D4' : '#FFD600'} />
              <MiniStat label="Revenue" value={formatNaira(revenue)} color="#00F5D4" />
              <MiniStat label="Tickets Sold" value={`${confirmed.length}`} color="#FFFFFF" />
              <MiniStat label="Checked In" value={`${checkedIn}/${confirmed.length}`} color="#B06AFF" />
              <MiniStat label="Refunds" value={String(refunds)} color="#FF8A00" />
            </div>

            {/* Event Details */}
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="mb-3 text-[12px] font-bold" style={{ color: '#FFFFFF' }}>Event Details</div>
                <div className="flex flex-col gap-2 text-[12.5px]" style={{ color: '#A7A8B5' }}>
                  <div className="flex items-center gap-2"><MapPin size={14} /> {event.location}</div>
                  <div className="flex items-center gap-2"><Clock size={14} /> {event.date} · {event.time}</div>
                  <div className="flex items-center gap-2"><Ticket size={14} /> {event.capacity.toLocaleString()} capacity · {event.vibe}</div>
                  <div className="mt-2 text-[12px]" style={{ color: '#D5D6E0' }}>{event.description}</div>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                {/* Flag Toggle */}
                <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: event.flagged ? '1px solid rgba(255,214,0,0.35)' : '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[12px] font-bold" style={{ color: '#FFFFFF' }}>Flag for Review</div>
                      <div className="text-[11px] mt-0.5" style={{ color: '#A7A8B5' }}>{event.flagged ? 'This event is flagged' : 'Flag this event for attention'}</div>
                    </div>
                    <button
                      onClick={toggleFlag}
                      disabled={!canEdit}
                      className="flex items-center gap-1.5 rounded-[9px] border px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
                      style={{
                        background: event.flagged ? 'rgba(255,214,0,0.12)' : 'rgba(255,255,255,0.03)',
                        borderColor: event.flagged ? 'rgba(255,214,0,0.35)' : 'rgba(255,255,255,0.1)',
                        color: event.flagged ? '#FFD600' : '#A7A8B5',
                      }}
                    >
                      <Flag size={13} /> {event.flagged ? 'Flagged' : 'Flag'}
                    </button>
                  </div>
                </div>

                {/* Export */}
                {canExport && (
                <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="text-[12px] font-bold" style={{ color: '#FFFFFF' }}>Export Attendees</div>
                  <div className="text-[11px] mt-0.5 mb-3" style={{ color: '#A7A8B5' }}>Download the attendee list as CSV</div>
                  <button
                    onClick={exportAttendees}
                    disabled={confirmed.length === 0}
                    className="flex items-center gap-1.5 rounded-[9px] border px-3 py-2 text-[12px] font-semibold disabled:opacity-50"
                    style={{ background: 'rgba(0,191,255,0.08)', borderColor: 'rgba(0,191,255,0.25)', color: '#00BFFF' }}
                  >
                    <Download size={13} /> Export CSV ({confirmed.length} attendees)
                  </button>
                </div>
              )}
              </div>
            </div>

            {/* Orders Table */}
            <div>
              <div className="mb-3 text-[13px] font-bold" style={{ color: '#FFFFFF' }}>Attendees & Orders ({orders.length})</div>
              {orders.length === 0 ? (
                <EmptyBlock title="No orders yet" subtitle="Sales will appear here once people buy tickets." />
              ) : (
                <div className="overflow-x-auto">
                  <TableShell head={['Order', 'Guest', 'Qty', 'Amount', 'Payment', 'Check-in', 'Refund']}>
                    {orders.map((o) => {
                      const pb = PAYMENT_BADGE[o.payment_status] ?? PAYMENT_BADGE.pending;
                      return (
                        <tr key={o.id}>
                          <Cell>
                            <Link href={`/admin/orders/${o.id}`} className="font-semibold hover:underline" style={{ color: '#FFFFFF' }}>
                              {o.order_ref}
                            </Link>
                          </Cell>
                          <Cell>{o.customer_email ?? 'Guest'}</Cell>
                          <Cell>{o.quantity}</Cell>
                          <Cell>{formatNaira(o.total)}</Cell>
                          <Cell><Badge label={pb.label} bg={pb.bg} color={pb.color} /></Cell>
                          <Cell>{o.check_in_status === 'checked_in' ? '✓ Checked in' : '—'}</Cell>
                          <Cell>{o.refund_status !== 'none' ? <Badge label={o.refund_status} bg="rgba(255,138,0,0.1)" color="#FF8A00" /> : '—'}</Cell>
                        </tr>
                      );
                    })}
                  </TableShell>
                </div>
              )}
            </div>

            {/* Admin Notes */}
            {canWriteNotes && (
            <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="mb-3 text-[12px] font-bold" style={{ color: '#FFFFFF' }}>Admin Notes</div>
              {notes.length > 0 && (
                <div className="mb-4 flex flex-col gap-2.5">
                  {notes.map((n) => (
                    <div key={n.id} className="flex items-start justify-between gap-3 rounded-xl px-3.5 py-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div>
                        <div className="text-[12.5px]" style={{ color: '#D5D6E0' }}>{n.body}</div>
                        <div className="mt-1 text-[10.5px]" style={{ color: '#6B6C80' }}>{new Date(n.created_at).toLocaleString()}</div>
                      </div>
                      {canDeleteNotes && (
                        <button onClick={() => removeNote(n.id)} className="shrink-0" style={{ color: '#FF2D95' }}>
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <textarea
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  rows={2}
                  placeholder="Add a private admin note..."
                  className="flex-1 resize-none rounded-xl px-3.5 py-2.5 text-[13px] outline-none"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFFFFF' }}
                />
                <button
                  onClick={addNote}
                  disabled={noteBusy || !noteBody.trim()}
                  className="self-end rounded-[10px] px-4 py-2 text-[12.5px] font-semibold disabled:opacity-50"
                  style={{ background: 'rgba(255,45,149,0.14)', border: '1px solid rgba(255,45,149,0.35)', color: '#FF2D95' }}
                >
                  {noteBusy ? '...' : 'Add'}
                </button>
              </div>
            </div>
            )}
          </div>
        )}
      </div>
    </AdminShell>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.9px]" style={{ color: '#6B6C80' }}>{label}</div>
      <div className="font-display text-[17px] leading-tight" style={{ color }}>{value}</div>
    </div>
  );
}

function ActionBtn({ label, icon, color, onClick }: { label: string; icon: React.ReactNode; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 rounded-[9px] border px-2.5 py-1.5 text-[11.5px] font-semibold" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.1)', color }}>
      {icon} {label}
    </button>
  );
}
