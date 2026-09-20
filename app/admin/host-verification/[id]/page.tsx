import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, Banknote, Building2, FileImage, IdCard, Lock, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { getHostVerificationDetail, signDocumentPreviewUrls, documentSlots, VERIFICATION_DOCUMENT_SPECS } from '@/lib/host-verification';
import type { HostVerificationRow } from '@/lib/host-verification';
import { HOST_VERIFICATION_STATUS_LABEL, HOST_VERIFICATION_STATUS_COLOR, HOST_BUSINESS_TYPE_LABEL } from '@/lib/host-verification-types';
import AdminShell from '@/components/admin-shell';
import { PageHeader, Badge, EmptyBlock } from '@/components/ui/dashboard-ui';
import ReviewForm from './review-form';

export const dynamic = 'force-dynamic';

export default async function AdminHostVerificationDetailPage({ params }: { params: { id: string } }) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: canView }, { data: canVerify }] = await Promise.all([
    supabase.rpc('user_has_permission', { p_user_id: user.id, p_permission_name: 'hosts.view' }),
    supabase.rpc('user_has_permission', { p_user_id: user.id, p_permission_name: 'hosts.verify' }),
  ]);
  if (canView !== true) {
    return <HostVerificationNoAccess />;
  }

  const service = createServiceSupabase();
  let row: HostVerificationRow | null = null;
  let previewUrls: { column: string; url: string | null }[] = [];
  try {
    row = await getHostVerificationDetail(service, params.id);
    if (row) {
      previewUrls = await signDocumentPreviewUrls(service, params.id, documentSlots(row));
    }
  } catch {
    row = null;
  }

  if (!row) {
    return (
      <AdminShell>
        <div className="mx-auto max-w-[980px] p-5">
          <BackLink />
          <EmptyBlock title="Verification not found" subtitle="This submission may have been deleted." />
        </div>
      </AdminShell>
    );
  }

  const statusColor = HOST_VERIFICATION_STATUS_COLOR[row.status];
  const urlByColumn = new Map(previewUrls.map((u) => [u.column, u.url]));

  return (
    <AdminShell>
      <div className="mx-auto max-w-[980px] p-5">
        <BackLink />

        <PageHeader
          title={row.businessName}
          subtitle={`${row.legalName} · Submitted ${new Date(row.submittedAt).toLocaleString()}`}
          right={<Badge label={HOST_VERIFICATION_STATUS_LABEL[row.status]} bg={statusColor.bg} color={statusColor.color} />}
        />

        {row.reviewReason && (
          <div
            className="mb-5 rounded-xl px-4 py-3 text-[12.5px]"
            style={{ background: 'rgba(255,138,0,0.08)', border: '1px solid rgba(255,138,0,0.25)', color: '#FFB26B' }}
          >
            Review note: {row.reviewReason}
          </div>
        )}

        <div className="flex flex-col gap-5">
          <Section title="Business" icon={<Building2 />}>
            <Field label="Business name" value={row.businessName} />
            <Field label="Business type" value={HOST_BUSINESS_TYPE_LABEL[row.businessType as keyof typeof HOST_BUSINESS_TYPE_LABEL] ?? row.businessType} />
            <Field label="Years in business" value={row.yearsInBusiness || '—'} />
            <Field
              label="Website / social"
              value={
                row.websiteSocial ? (
                  <a href={row.websiteSocial} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: '#FF2D95' }}>
                    {row.websiteSocial}
                  </a>
                ) : (
                  '—'
                )
              }
            />
            <Field label="Address" value={row.address || '—'} />
          </Section>

          <Section title="Identity" icon={<IdCard />}>
            <Field label="Legal name" value={row.legalName} />
            <Field label="NIN" value={row.nin || '—'} />
          </Section>

          <Section title="Payout account" icon={<Banknote />}>
            <Field label="Bank" value={row.bankName} />
            <Field label="Account holder" value={row.accountHolder} />
            <Field label="Account number" value={row.accountNumber || row.accountLast4 || '—'} />
          </Section>

          {/* Documents */}
          <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="mb-4 flex items-center gap-2 text-[12px] font-bold" style={{ color: '#FFFFFF' }}>
              <FileImage size={15} color="#FF2D95" /> Documents
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              {VERIFICATION_DOCUMENT_SPECS.map((spec) => {
                const url = urlByColumn.get(spec.column) ?? null;
                return (
                  <div key={spec.column} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="mb-2 text-[12px] font-semibold" style={{ color: '#FFFFFF' }}>{spec.label}</div>
                    {url ? (
                      <a href={url} target="_blank" rel="noopener noreferrer" className="group block">
                        <img
                          src={url}
                          alt={spec.label}
                          className="max-h-[180px] w-full rounded-lg border object-contain transition-opacity group-hover:opacity-80"
                          style={{ borderColor: 'rgba(255,255,255,0.08)' }}
                        />
                        <span className="mt-2 block text-[11.5px] font-semibold hover:underline" style={{ color: '#FF2D95' }}>
                          Open full size →
                        </span>
                      </a>
                    ) : (
                      <div className="flex h-[120px] items-center justify-center rounded-lg text-[12px]" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', color: '#6B6C80' }}>
                        Not provided
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Review actions */}
          <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="mb-4 flex items-center gap-2 text-[12px] font-bold" style={{ color: '#FFFFFF' }}>
              <ShieldCheck size={15} color="#FF8A00" /> Review decision
            </div>
            <ReviewForm userId={row.userId} businessName={row.businessName} status={row.status} canVerify={canVerify === true} />
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

function BackLink() {
  return (
    <Link href="/admin/host-verification" className="mb-4 flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: '#A7A8B5' }}>
      <ArrowLeft size={14} /> Back to host verifications
    </Link>
  );
}

function HostVerificationNoAccess() {
  return (
    <AdminShell>
      <div className="mx-auto flex max-w-[520px] flex-col items-center gap-4 p-10 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: 'rgba(255,138,0,0.1)', border: '1px solid rgba(255,138,0,0.25)' }}>
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

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="mb-4 flex items-center gap-2 text-[12px] font-bold" style={{ color: '#FFFFFF' }}>
        <span style={{ color: '#FF2D95' }}>{icon}</span> {title}
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.9px]" style={{ color: '#6B6C80' }}>{label}</span>
      <span className="text-[13px]" style={{ color: '#D5D6E0' }}>{value}</span>
    </div>
  );
}