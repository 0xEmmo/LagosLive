'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Eye, Pencil, Check, X, Ban, RotateCcw, Trash2, Flag } from 'lucide-react';
import AdminShell from '@/components/admin-shell';
import { PageHeader, LoadingBlock, ErrorBlock, EmptyBlock, useRoleGuard, Cell } from '@/components/ui/dashboard-ui';
import { fetchAdminEvents, type AdminEventJoined } from '@/lib/admin-queries';
import { updatePartyStatus, deleteParty } from '@/lib/queries';
import { useLagosLiveStore } from '@/lib/store';
import { formatNaira } from '@/lib/filters';

const STATUS_STYLE: Record<string, { label: string; bg: string; color: string }> = {
  pending: { label: 'Pending', bg: 'rgba(255,214,0,0.1)', color: '#FFD600' },
  approved: { label: 'Live', bg: 'rgba(0,245,212,0.08)', color: '#00F5D4' },
  rejected: { label: 'Rejected', bg: 'rgba(255,138,0,0.08)', color: '#FF8A00' },
  suspended: { label: 'Suspended', bg: 'rgba(255,138,0,0.08)', color: '#FF8A00' },
};

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected' | 'suspended';

export default function AdminEventsPage() {
  const { ready } = useRoleGuard('admin');
  const showToast = useLagosLiveStore((s) => s.showToast);
  const [events, setEvents] = useState<AdminEventJoined[]>([]);
  const [status, setStatus] = useState<'loading' | 'error' | 'ok'>('loading');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [attempt, setAttempt] = useState(0);

  const load = async () => {
    setStatus('loading');
    try {
      const data = await fetchAdminEvents(filter === 'all' ? undefined : { status: filter });
      setEvents(data);
      setStatus('ok');
    } catch {
      setStatus('error');
    }
  };

  useEffect(() => {
    if (!ready) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, attempt, filter]);

  const setStatusOf = async (id: number, next: string, title: string) => {
    if ((next === 'rejected' || next === 'suspended') && !confirm(`${next === 'suspended' ? 'Suspend' : 'Reject'} "${title}"? It will be hidden from the public.`)) return;
    const prev = events;
    setEvents((e) => e.map((x) => (x.id === id ? { ...x, status: next } : x)));
    try {
      await updatePartyStatus(id, next as never);
      showToast(next === 'approved' ? 'Event approved' : next === 'rejected' ? 'Event rejected' : next === 'suspended' ? 'Event suspended' : 'Event reinstated', `"${title}" updated.`);
    } catch {
      setEvents(prev);
      showToast('Something went wrong', "Couldn't update the event status.");
    }
  };

  const remove = async (ev: AdminEventJoined) => {
    if (!confirm(`Delete "${ev.title}" permanently? This can't be undone.`)) return;
    const prev = events;
    setEvents((e) => e.filter((x) => x.id !== ev.id));
    try {
      await deleteParty(ev.id);
      showToast('Event deleted', `"${ev.title}" was deleted.`);
    } catch {
      setEvents(prev);
      showToast('Something went wrong', "Can't delete — it may already have orders. Suspend it instead.");
    }
  };

  if (!ready) return null;

  return (
    <AdminShell>
      <div className="mx-auto max-w-[980px] p-5">
        <PageHeader title="Events" subtitle="Review, moderate and manage all events" />

        <div className="mb-4 flex flex-wrap gap-2">
          {(['all', 'pending', 'approved', 'rejected', 'suspended'] as StatusFilter[]).map((f) => {
            const active = filter === f;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="rounded-full px-3.5 py-1.5 text-[12px] font-semibold capitalize transition-colors"
                style={
                  active
                    ? { background: 'rgba(255,45,149,0.16)', border: '1px solid rgba(255,45,149,0.4)', color: '#FF2D95' }
                    : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#A7A8B5' }
                }
              >
                {f}
              </button>
            );
          })}
        </div>

        {status === 'loading' ? (
          <LoadingBlock />
        ) : status === 'error' ? (
          <ErrorBlock message="Couldn't load events." onRetry={() => setAttempt((a) => a + 1)} />
        ) : events.length === 0 ? (
          <EmptyBlock title="No events" subtitle="No events match this filter." />
        ) : (
          <div className="flex flex-col gap-2.5">
            {events.map((ev) => {
              const st = STATUS_STYLE[ev.status] ?? STATUS_STYLE.pending;
              return (
                <div key={ev.id} className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: ev.flagged ? '1px solid rgba(255,214,0,0.35)' : '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-heading text-[15px] font-bold" style={{ color: '#FFFFFF' }}>{ev.title}</span>
                        {ev.flagged && <Flag size={13} color="#FFD600" />}
                      </div>
                      <div className="mt-0.5 text-[11.5px]" style={{ color: '#A7A8B5' }}>
                        {ev.date} · {ev.time} · by {ev.organizer || 'Platform'}
                      </div>
                    </div>
                    <span className="rounded-full px-2.5 py-1 text-[10.5px] font-semibold" style={{ background: st.bg, color: st.color }}>
                      {st.label}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]" style={{ color: '#A7A8B5' }}>
                    <span>{ev.capacity?.toLocaleString() ?? '—'} capacity</span>
                    <span>· {ev.spots_left} left</span>
                    <span>· {formatNaira(ev.fee_num ?? 0)}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <ActionLink href={`/admin/events/${ev.id}`} label="View" icon={<Eye size={13} />} color="#A7A8B5" />
                    <ActionLink href={`/host/${ev.id}/edit`} label="Edit" icon={<Pencil size={13} />} color="#A7A8B5" />
                    {ev.status === 'approved' && (
                      <ActionBtn label="Suspend" icon={<Ban size={13} />} color="#FF8A00" onClick={() => setStatusOf(ev.id, 'suspended', ev.title)} />
                    )}
                    {(ev.status === 'suspended' || ev.status === 'rejected') && (
                      <ActionBtn label="Reinstate" icon={<RotateCcw size={13} />} color="#00F5D4" onClick={() => setStatusOf(ev.id, 'approved', ev.title)} />
                    )}
                    {ev.status === 'pending' && (
                      <>
                        <ActionBtn label="Approve" icon={<Check size={13} />} color="#00F5D4" onClick={() => setStatusOf(ev.id, 'approved', ev.title)} />
                        <ActionBtn label="Reject" icon={<X size={13} />} color="#FF8A00" onClick={() => setStatusOf(ev.id, 'rejected', ev.title)} />
                      </>
                    )}
                    <ActionBtn label="Delete" icon={<Trash2 size={13} />} color="#FF2D95" onClick={() => remove(ev)} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminShell>
  );
}

function ActionLink({ href, label, icon, color }: { href: string; label: string; icon: React.ReactNode; color: string }) {
  return (
    <Link href={href} className="flex items-center gap-1.5 rounded-[9px] border px-2.5 py-1.5 text-[11.5px] font-semibold" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.1)', color }}>
      {icon} {label}
    </Link>
  );
}

function ActionBtn({ label, icon, color, onClick }: { label: string; icon: React.ReactNode; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 rounded-[9px] border px-2.5 py-1.5 text-[11.5px] font-semibold" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.1)', color }}>
      {icon} {label}
    </button>
  );
}
