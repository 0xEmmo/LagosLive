import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { ArrowRight, Building2, CheckCircle2, Clock, Lock, XCircle } from 'lucide-react';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { listPendingHostVerifications, listHostVerificationsByStatus, type HostVerificationRow } from '@/lib/host-verification';
import { HOST_VERIFICATION_STATUS_LABEL, HOST_VERIFICATION_STATUS_COLOR } from '@/lib/host-verification-types';
import AdminShell from '@/components/admin-shell';
import { PageHeader, Badge, EmptyBlock } from '@/components/ui/dashboard-ui';

export const dynamic = 'force-dynamic';

export default async function AdminHostVerificationQueuePage() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: canView } = await supabase.rpc('user_has_permission', {
    p_user_id: user.id,
    p_permission_name: 'hosts.view',
  });
  if (canView !== true) {
    return <HostVerificationNoAccess />;
  }

  const service = createServiceSupabase();
  const [pending, verified, rejected] = await Promise.all([
    listPendingHostVerifications(service),
    listHostVerificationsByStatus(service, 'verified'),
    listHostVerificationsByStatus(service, 'rejected'),
  ]);

  return (
    <AdminShell>
      <div className="mx-auto max-w-[980px] p-5">
        <PageHeader title="Host Verification" subtitle="Review submitted KYC applications" />

        <div className="mb-6 grid grid-cols-3 gap-3">
          <QueueStat label="Pending" value={String(pending.length)} icon={<Clock size={15} strokeWidth={2} color="#FFD600" />} />
          <QueueStat label="Verified" value={String(verified.length)} icon={<CheckCircle2 size={15} strokeWidth={2} color="#00F5D4" />} />
          <QueueStat label="Rejected" value={String(rejected.length)} icon={<XCircle size={15} strokeWidth={2} color="#FF2D95" />} />
        </div>

        <div className="mb-6 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.9px]" style={{ color: '#6B6C80' }}>
            <Clock size={14} color="#FFD600" /> Pending review
          </div>
          {pending.length === 0 ? (
            <EmptyBlock title="No pending host verifications." subtitle="New KYC submissions will appear here for review." />
          ) : (
            <div className="flex flex-col gap-3">
              {pending.map((row) => (
                <QueueRow key={row.id} row={row} accent="#FFD600" />
              ))}
            </div>
          )}
        </div>

        <div className="mb-6 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.9px]" style={{ color: '#6B6C80' }}>
            <CheckCircle2 size={14} color="#00F5D4" /> Verified
          </div>
          {verified.length === 0 ? (
            <EmptyBlock title="No verified hosts yet." subtitle="Approved hosts appear here." />
          ) : (
            <ClosedQueueList rows={verified} accent="#00F5D4" />
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.9px]" style={{ color: '#6B6C80' }}>
            <XCircle size={14} color="#FF2D95" /> Rejected
          </div>
          {rejected.length === 0 ? (
            <EmptyBlock title="No rejected submissions." subtitle="Rejected hosts appear here." />
          ) : (
            <ClosedQueueList rows={rejected} accent="#FF2D95" />
          )}
        </div>
      </div>
    </AdminShell>
  );
}

function QueueStat({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.9px]" style={{ color: '#6B6C80' }}>{label}</span>
        {icon}
      </div>
      <div className="font-display truncate text-[20px] leading-tight" style={{ color: '#FFFFFF' }}>{value}</div>
    </div>
  );
}

function QueueRow({ row, accent }: { row: HostVerificationRow; accent: string }) {
  const statusColor = HOST_VERIFICATION_STATUS_COLOR[row.status];
  return (
    <Link
      key={row.id}
      href={`/admin/host-verification/${row.id}`}
      className="group flex items-center justify-between gap-4 rounded-2xl px-5 py-4 transition-colors hover:bg-white/[0.04]"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <div className="flex min-w-0 items-center gap-4">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `${accent}14`, border: `1px solid ${accent}40` }}
        >
          <Building2 size={18} color={accent} />
        </div>
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-bold" style={{ color: '#FFFFFF' }}>{row.businessName}</div>
          <div className="mt-0.5 truncate text-[12px]" style={{ color: '#A7A8B5' }}>
            {row.legalName} · Submitted {new Date(row.submittedAt).toLocaleDateString()}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <Badge
          label={HOST_VERIFICATION_STATUS_LABEL[row.status]}
          bg={statusColor.bg}
          color={statusColor.color}
        />
        <ArrowRight size={16} color="#6B6C80" className="transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

function ClosedQueueList({ rows, accent }: { rows: HostVerificationRow[]; accent: string }) {
  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => {
        const statusColor = HOST_VERIFICATION_STATUS_COLOR[row.status];
        return (
          <Link
            key={row.id}
            href={`/admin/host-verification/${row.id}`}
            className="group flex items-center justify-between gap-4 rounded-2xl px-5 py-4 transition-colors hover:bg-white/[0.04]"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <div className="flex min-w-0 items-center gap-4">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                style={{ background: `${accent}14`, border: `1px solid ${accent}40` }}
              >
                <Building2 size={18} color={accent} />
              </div>
              <div className="min-w-0">
                <div className="truncate text-[13.5px] font-bold" style={{ color: '#FFFFFF' }}>{row.businessName}</div>
                <div className="mt-0.5 truncate text-[12px]" style={{ color: '#A7A8B5' }}>
                  {row.legalName}
                  {row.reviewedAt ? ` · Reviewed ${new Date(row.reviewedAt).toLocaleDateString()}` : ''}
                </div>
                {row.reviewReason && (
                  <div className="mt-0.5 truncate text-[11.5px]" style={{ color: '#6B6C80' }}>
                    <span style={{ color: accent }}>Reason:</span> {row.reviewReason}
                  </div>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <Badge
                label={HOST_VERIFICATION_STATUS_LABEL[row.status]}
                bg={statusColor.bg}
                color={statusColor.color}
              />
              <ArrowRight size={16} color="#6B6C80" className="transition-transform group-hover:translate-x-0.5" />
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function HostVerificationNoAccess() {
  return (
    <AdminShell>
      <div className="mx-auto flex max-w-[520px] flex-col items-center gap-4 p-10 text-center">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{ background: 'rgba(255,138,0,0.1)', border: '1px solid rgba(255,138,0,0.25)' }}
        >
          <Lock size={24} color="#FF8A00" />
        </div>
        <div>
          <div className="font-heading text-[18px] font-bold" style={{ color: '#FFFFFF' }}>Access denied</div>
          <p className="mt-2 text-[13px] leading-relaxed" style={{ color: '#A7A8B5' }}>
            Host verification reviews require the hosts.view permission. Ask an admin to grant you access.
          </p>
        </div>
      </div>
    </AdminShell>
  );
}