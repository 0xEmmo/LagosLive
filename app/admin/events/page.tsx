'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Eye, Pencil, Check, X, Ban, RotateCcw, Trash2, Flag, Search, Download } from 'lucide-react';
import AdminShell from '@/components/admin-shell';
import { PageHeader, LoadingBlock, ErrorBlock, EmptyBlock, useRoleGuard, Badge } from '@/components/ui/dashboard-ui';
import { fetchAdminEvents, type AdminEventJoined, toCsv, downloadCsv } from '@/lib/admin-queries';
import { updatePartyStatus, deleteParty } from '@/lib/queries';
import { useLagosLiveStore } from '@/lib/store';
import { formatNaira } from '@/lib/filters';

const PAGE_SIZE = 50;

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
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

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
    setPage(1);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, attempt, filter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((ev) => !q || ev.title.toLowerCase().includes(q) || ev.organizer.toLowerCase().includes(q) || ev.location.toLowerCase().includes(q));
  }, [events, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const exportCsv = () => {
    const csv = toCsv(
      filtered.map((e) => ({
        'Event Name': e.title,
        Organizer: e.organizer,
        Date: e.date,
        Status: e.status,
        'Capacity': e.capacity,
        'Spots Left': e.spots_left,
        'Entry Fee': e.fee_num / 100,
        Location: e.location,
        Vibe: e.vibe,
      })),
      ['Event Name', 'Organizer', 'Date', 'Status', 'Capacity', 'Spots Left', 'Entry Fee', 'Location', 'Vibe']
    );
    downloadCsv(`events-export-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    showToast('Export complete', `${filtered.length} events exported.`);
  };

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
        <PageHeader
          title="Events"
          subtitle={`${filtered.length} event${filtered.length === 1 ? '' : 's'} total`}
          right={
            <button
              onClick={exportCsv}
              className="flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-[12.5px] font-semibold"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#A7A8B5' }}
            >
              <Download size={13} /> Export CSV
            </button>
          }
        />

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-xl px-3.5 py-2.5 min-w-[200px]" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <Search size={14} strokeWidth={2} color="#6B6C80" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search events..."
              className="w-full bg-transparent text-[13px] outline-none"
              style={{ color: '#FFFFFF' }}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
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
        </div>

        {status === 'loading' ? (
          <LoadingBlock />
        ) : status === 'error' ? (
          <ErrorBlock message="Couldn't load events." onRetry={() => setAttempt((a) => a + 1)} />
        ) : events.length === 0 ? (
          <EmptyBlock title="No events" subtitle="No events match this filter." />
        ) : (
          <>
            {/* Mobile view */}
            <div className="flex flex-col gap-2.5 md:hidden">
              {paged.map((ev) => {
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
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <ActionLink href={`/admin/events/${ev.id}`} label="View" icon={<Eye size={12} />} />
                      <ActionLink href={`/host/${ev.id}/edit`} label="Edit" icon={<Pencil size={12} />} />
                      {ev.status === 'approved' && <ActionBtn label="Suspend" icon={<Ban size={12} />} color="#FF8A00" onClick={() => setStatusOf(ev.id, 'suspended', ev.title)} />}
                      {(ev.status === 'suspended' || ev.status === 'rejected') && <ActionBtn label="Reinstate" icon={<RotateCcw size={12} />} color="#00F5D4" onClick={() => setStatusOf(ev.id, 'approved', ev.title)} />}
                      {ev.status === 'pending' && (
                        <>
                          <ActionBtn label="Approve" icon={<Check size={12} />} color="#00F5D4" onClick={() => setStatusOf(ev.id, 'approved', ev.title)} />
                          <ActionBtn label="Reject" icon={<X size={12} />} color="#FF8A00" onClick={() => setStatusOf(ev.id, 'rejected', ev.title)} />
                        </>
                      )}
                      <ActionBtn label="Delete" icon={<Trash2 size={12} />} color="#FF2D95" onClick={() => remove(ev)} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop table view */}
            <div className="hidden overflow-hidden rounded-2xl md:block" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                    {['Event', 'Organizer', 'Date', 'Status', 'Tickets', 'Fee', 'Actions'].map((h) => (
                      <th key={h} className="px-4 py-3 text-[10.5px] font-bold uppercase tracking-[1px]" style={{ color: '#6B6C80', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paged.map((ev) => {
                    const st = STATUS_STYLE[ev.status] ?? STATUS_STYLE.pending;
                    const sold = ev.capacity - ev.spots_left;
                    return (
                      <tr key={ev.id} className="transition-colors hover:bg-white/[0.02]">
                        <td className="border-t px-4 py-3 text-[12.5px]" style={{ borderColor: 'rgba(255,255,255,0.05)', color: '#FFFFFF' }}>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold truncate max-w-[180px]">{ev.title}</span>
                            {ev.flagged && <Flag size={11} color="#FFD600" />}
                          </div>
                          <div className="text-[10.5px] mt-0.5" style={{ color: '#6B6C80' }}>{ev.location}</div>
                        </td>
                        <td className="border-t px-4 py-3 text-[12.5px]" style={{ borderColor: 'rgba(255,255,255,0.05)', color: '#D5D6E0' }}>{ev.organizer || 'Platform'}</td>
                        <td className="border-t px-4 py-3 text-[12.5px]" style={{ borderColor: 'rgba(255,255,255,0.05)', color: '#D5D6E0' }}>{ev.date}</td>
                        <td className="border-t px-4 py-3 text-[12.5px]" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                          <Badge label={st.label} bg={st.bg} color={st.color} />
                        </td>
                        <td className="border-t px-4 py-3 text-[12.5px]" style={{ borderColor: 'rgba(255,255,255,0.05)', color: '#D5D6E0' }}>{sold}/{ev.capacity}</td>
                        <td className="border-t px-4 py-3 text-[12.5px]" style={{ borderColor: 'rgba(255,255,255,0.05)', color: '#D5D6E0' }}>{formatNaira(ev.fee_num)}</td>
                        <td className="border-t px-4 py-3 text-[12.5px]" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                          <div className="flex items-center gap-1">
                            <Link href={`/admin/events/${ev.id}`} className="rounded-lg px-2 py-1 text-[11px] font-semibold hover:bg-white/[0.04]" style={{ color: '#A7A8B5' }}>View</Link>
                            <Link href={`/host/${ev.id}/edit`} className="rounded-lg px-2 py-1 text-[11px] font-semibold hover:bg-white/[0.04]" style={{ color: '#A7A8B5' }}>Edit</Link>
                            {ev.status === 'approved' && <button onClick={() => setStatusOf(ev.id, 'suspended', ev.title)} className="rounded-lg px-2 py-1 text-[11px] font-semibold hover:bg-white/[0.04]" style={{ color: '#FF8A00' }}>Suspend</button>}
                            {ev.status === 'pending' && <button onClick={() => setStatusOf(ev.id, 'approved', ev.title)} className="rounded-lg px-2 py-1 text-[11px] font-semibold hover:bg-white/[0.04]" style={{ color: '#00F5D4' }}>Approve</button>}
                            <button onClick={() => remove(ev)} className="rounded-lg px-2 py-1 text-[11px] font-semibold hover:bg-white/[0.04]" style={{ color: '#FF2D95' }}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded-lg px-3 py-1.5 text-[12px] font-semibold disabled:opacity-40"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#A7A8B5' }}
                >
                  Previous
                </button>
                <span className="text-[12px]" style={{ color: '#6B6C80' }}>Page {page} of {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="rounded-lg px-3 py-1.5 text-[12px] font-semibold disabled:opacity-40"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#A7A8B5' }}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </AdminShell>
  );
}

function ActionLink({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-1.5 rounded-[9px] border px-2.5 py-1.5 text-[11.5px] font-semibold" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.1)', color: '#A7A8B5' }}>
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
