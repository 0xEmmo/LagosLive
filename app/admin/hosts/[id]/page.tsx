'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Mail, Phone, CalendarDays, Wallet, Ticket, Building2, Shield, Ban, RotateCcw, Trash2, ShieldCheck, Check, X } from 'lucide-react';
import AdminShell from '@/components/admin-shell';
import { PageHeader, StatCard, LoadingBlock, ErrorBlock, EmptyBlock, TableShell, Cell, Badge, useRoleGuard } from '@/components/ui/dashboard-ui';
import { fetchHostDetail, updateProfileStatus, deleteAdminNote, fetchAdminNotes, createAdminNote, logAudit, type HostDetail, type NoteRow } from '@/lib/admin-queries';
import { formatNaira } from '@/lib/filters';
import { useLagosLiveStore } from '@/lib/store';
import { ROLE_LABEL, ACCOUNT_STATUS_LABEL, ACCOUNT_STATUS_COLOR, HOST_VERIFICATION_LABEL, HOST_VERIFICATION_COLOR, type Role, type AccountStatus, type HostVerification } from '@/lib/authz';

const STATUS_STYLE: Record<string, { label: string; bg: string; color: string }> = {
  draft: { label: 'Draft', bg: 'rgba(255,255,255,0.08)', color: '#D5D6E0' },
  pending: { label: 'Pending', bg: 'rgba(255,214,0,0.1)', color: '#FFD600' },
  approved: { label: 'Live', bg: 'rgba(0,245,212,0.08)', color: '#00F5D4' },
  rejected: { label: 'Rejected', bg: 'rgba(255,138,0,0.08)', color: '#FF8A00' },
  suspended: { label: 'Suspended', bg: 'rgba(255,138,0,0.08)', color: '#FF8A00' },
};

export default function AdminHostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { ready } = useRoleGuard('admin');
  const showToast = useLagosLiveStore((s) => s.showToast);

  const [host, setHost] = useState<HostDetail | null>(null);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [noteBody, setNoteBody] = useState('');
  const [status, setStatus] = useState<'loading' | 'error' | 'ok'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [noteBusy, setNoteBusy] = useState(false);
  const [verificationBusy, setVerificationBusy] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const [h, n] = await Promise.all([
        fetchHostDetail(id),
        fetchAdminNotes('profile', id),
      ]);
      setHost(h);
      setNotes(n);
      setStatus('ok');
    } catch {
      setStatus('error');
    }
  }, [id]);

  useEffect(() => {
    if (!ready) return;
    load();
  }, [ready, load, attempt]);

  const toggleStatus = async () => {
    if (!host) return;
    const next = host.account_status === 'active' ? 'suspended' : 'active';
    if (next === 'suspended' && !confirm(`Suspend ${host.name}?`)) return;
    try {
      await updateProfileStatus(host.id, next);
      await logAudit(next === 'active' ? 'host_reinstate' : 'host_suspend', 'host', host.id, { name: host.name });
      setHost((h) => h ? { ...h, account_status: next } : h);
      showToast(next === 'active' ? 'Host reinstated' : 'Host suspended', `${host.name} updated.`);
    } catch {
      showToast('Something went wrong', "Couldn't update status.");
    }
  };

  const setVerification = async (decision: 'verify' | 'reject' | 'suspend') => {
    if (!host) return;
    let reason: string | undefined;
    if (decision === 'reject' || decision === 'suspend') {
      reason = prompt(`${decision === 'suspend' ? 'Suspend' : 'Reject'} ${host.name}'s verification — add a reason the host will see:`) ?? '';
      if (!reason.trim()) {
        showToast('Reason required', `Add a reason to ${decision} a host.`);
        return;
      }
    }
    setVerificationBusy(true);
    try {
      const res = await fetch('/api/admin/host-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: host.id, decision, reason }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Failed');
      setAttempt((a) => a + 1);
      showToast(decision === 'verify' ? 'Host verified' : decision === 'reject' ? 'Verification rejected' : 'Host suspended', `${host.name} updated.`);
    } catch {
      showToast('Something went wrong', "Couldn't update verification.");
    } finally {
      setVerificationBusy(false);
    }
  };

  const addNote = async () => {
    const body = noteBody.trim();
    if (!body) return;
    setNoteBusy(true);
    try {
      await createAdminNote('profile', id, body);
      const noteData = await fetchAdminNotes('profile', id);
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
    if (!confirm('Delete this note?')) return;
    try {
      await deleteAdminNote(noteId);
      setNotes((n) => n.filter((x) => x.id !== noteId));
    } catch {
      showToast('Error', "Couldn't delete note.");
    }
  };

  if (!ready) return null;

  return (
    <AdminShell>
      <div className="mx-auto max-w-[980px] p-5">
        <Link href="/admin/hosts" className="mb-4 flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: '#A7A8B5' }}>
          <ArrowLeft size={14} /> Back to hosts
        </Link>

        {status === 'loading' ? (
          <LoadingBlock />
        ) : status === 'error' ? (
          <ErrorBlock message="Couldn't load host profile." onRetry={() => setAttempt((a) => a + 1)} />
        ) : !host ? (
          <EmptyBlock title="Host not found" subtitle="This account may have been deleted." />
        ) : (() => {
          const v = (host.host_verification_status ?? 'unverified') as HostVerification;
          const vs = HOST_VERIFICATION_COLOR[v];
          return (
          <div className="flex flex-col gap-6">
            {/* Header */}
            <PageHeader
              title={host.name}
              subtitle={host.email}
              right={
                <div className="flex flex-wrap gap-2">
                  {host.account_status === 'active' ? (
                    <ActionBtn label="Suspend" icon={<Ban size={13} />} color="#FF8A00" onClick={toggleStatus} />
                  ) : (
                    <ActionBtn label="Reinstate" icon={<RotateCcw size={13} />} color="#00F5D4" onClick={toggleStatus} />
                  )}
                </div>
              }
            />

            {/* Profile Info */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Role" value={ROLE_LABEL[host.role as Role] ?? host.role} icon={Shield} color="#B06AFF" />
              <StatCard label="Status" value={ACCOUNT_STATUS_LABEL[host.account_status as AccountStatus] ?? host.account_status} icon={Ban} color="#FF8A00" />
              <StatCard label="Events" value={String(host.totalEventsCount)} icon={CalendarDays} color="#FF2D95" />
              <StatCard label="Revenue" value={formatNaira(host.totalRevenue)} icon={Wallet} color="#00F5D4" />
            </div>

            {/* Contact Details */}
            <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="mb-3 text-[12px] font-bold" style={{ color: '#FFFFFF' }}>Contact Details</div>
              <div className="flex flex-col gap-2 text-[12.5px]">
                <div className="flex items-center gap-2" style={{ color: '#A7A8B5' }}>
                  <Mail size={14} /> {host.email}
                </div>
                {host.phone && (
                  <div className="flex items-center gap-2" style={{ color: '#A7A8B5' }}>
                    <Phone size={14} /> {host.phone}
                  </div>
                )}
                {host.bio && (
                  <div className="mt-2 text-[12.5px]" style={{ color: '#D5D6E0' }}>{host.bio}</div>
                )}
                <div className="mt-1 text-[11px]" style={{ color: '#6B6C80' }}>
                  Joined {new Date(host.created_at).toLocaleDateString()}
                  {host.kyc_status !== 'none' && ` · KYC: ${host.kyc_status}`}
                </div>
              </div>
            </div>

            {/* Verification */}
            <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[12px] font-bold" style={{ color: '#FFFFFF' }}>
                  <ShieldCheck size={15} color="#FF8A00" /> Host Verification
                </div>
                <Badge label={HOST_VERIFICATION_LABEL[v]} bg={vs.bg} color={vs.color} />
              </div>
              <div className="flex flex-col gap-2 text-[12.5px]">
                {host.business_name && (
                  <div className="text-[12.5px]" style={{ color: '#D5D6E0' }}>
                    <span style={{ color: '#6B6C80' }}>Business: </span>{host.business_name}
                  </div>
                )}
                {host.website && (
                  <div className="text-[12.5px]">
                    <a href={host.website} target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline" style={{ color: '#FF8A00' }}>{host.website}</a>
                  </div>
                )}
                {v === 'pending' && host.host_verification_requested_at && (
                  <div className="text-[11px]" style={{ color: '#6B6C80' }}>
                    Requested {new Date(host.host_verification_requested_at).toLocaleString()}
                  </div>
                )}
                {v === 'rejected' && host.host_verification_reason && (
                  <div className="rounded-xl px-3 py-2 text-[12px]" style={{ background: 'rgba(255,138,0,0.08)', border: '1px solid rgba(255,138,0,0.25)', color: '#FFB26B' }}>
                    Rejected: {host.host_verification_reason}
                  </div>
                )}
                {host.account_status === 'suspended' && host.host_verification_reason && (
                  <div className="rounded-xl px-3 py-2 text-[12px]" style={{ background: 'rgba(255,138,0,0.08)', border: '1px solid rgba(255,138,0,0.25)', color: '#FFB26B' }}>
                    Suspended: {host.host_verification_reason}
                  </div>
                )}
                {v === 'unverified' && (
                  <div className="text-[12px]" style={{ color: '#A7A8B5' }}>This host hasn&apos;t requested verification yet.</div>
                )}
              </div>
              {host.account_status === 'active' && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {v !== 'verified' && (
                    <ActionBtn label={verificationBusy ? '...' : 'Verify'} icon={<Check size={13} />} color="#00F5D4" onClick={() => setVerification('verify')} />
                  )}
                  {(v === 'pending' || v === 'rejected') && (
                    <ActionBtn label={verificationBusy ? '...' : 'Reject'} icon={<X size={13} />} color="#FF2D95" onClick={() => setVerification('reject')} />
                  )}
                  {v === 'verified' && (
                    <ActionBtn label={verificationBusy ? '...' : 'Suspend'} icon={<Ban size={13} />} color="#FF8A00" onClick={() => setVerification('suspend')} />
                  )}
                </div>
              )}
            </div>

            {/* Events List */}
            <div>
              <div className="mb-3 text-[13px] font-bold" style={{ color: '#FFFFFF' }}>Events ({host.totalEventsCount})</div>
              {!host.events || host.events.length === 0 ? (
                <EmptyBlock title="No events" subtitle="This host hasn't created any events yet." />
              ) : (
                <TableShell head={['Event', 'Date', 'Status', 'Capacity', 'Remaining', '']}>
                  {host.events.map((ev) => {
                    const st = STATUS_STYLE[ev.status] ?? STATUS_STYLE.pending;
                    return (
                      <tr key={ev.id} className="transition-colors hover:bg-white/[0.02]">
                        <Cell><span className="font-semibold" style={{ color: '#FFFFFF' }}>{ev.title}</span></Cell>
                        <Cell>{new Date(ev.starts_at).toLocaleDateString()}</Cell>
                        <Cell><Badge label={st.label} bg={st.bg} color={st.color} /></Cell>
                        <Cell>{ev.capacity.toLocaleString()}</Cell>
                        <Cell>{ev.spots_left}</Cell>
                        <Cell align="right">
                          <Link href={`/admin/events/${ev.id}`} className="text-[11.5px] font-semibold hover:underline" style={{ color: '#FF2D95' }}>View</Link>
                        </Cell>
                      </tr>
                    );
                  })}
                </TableShell>
              )}
            </div>

            {/* Payouts Summary */}
            <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="mb-3 text-[12px] font-bold" style={{ color: '#FFFFFF' }}>Payouts</div>
              <div className="flex gap-6 text-[13px]">
                <span style={{ color: '#A7A8B5' }}>Total Paid: <span className="font-bold" style={{ color: '#00F5D4' }}>{formatNaira(host.totalPayouts)}</span></span>
                <span style={{ color: '#A7A8B5' }}>Total Revenue: <span className="font-bold" style={{ color: '#FFFFFF' }}>{formatNaira(host.totalRevenue)}</span></span>
              </div>
            </div>

            {/* Admin Notes */}
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
                      <button onClick={() => removeNote(n.id)} className="shrink-0 text-[10px]" style={{ color: '#FF2D95' }}>
                        <Trash2 size={12} />
                      </button>
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
          </div>
          );
        })()}
      </div>
    </AdminShell>
  );
}

function ActionBtn({ label, icon, color, onClick }: { label: string; icon: React.ReactNode; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 rounded-[9px] border px-2.5 py-1.5 text-[11.5px] font-semibold" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.1)', color }}>
      {icon} {label}
    </button>
  );
}
