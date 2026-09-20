'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  BadgeCheck,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Fingerprint,
  Landmark,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import HostDashboardNav from '@/components/HostDashboardNav';
import { useLagosLiveStore } from '@/lib/store';
import { useHostVerification } from '@/lib/hooks/useHostVerification';
import {
  HOST_VERIFICATION_STATUS_LABEL,
  HOST_VERIFICATION_STATUS_COLOR,
  HOST_VERIFICATION_PAYOUT_GATE,
  HOST_BUSINESS_TYPES,
  HOST_BUSINESS_TYPE_LABEL,
  HOST_YEARS_IN_BUSINESS,
  type HostBusinessType,
  type HostYearsInBusiness,
} from '@/lib/host-verification-types';
import { NIGERIAN_BANK_NAMES } from '@/lib/nigerian-bank-names';
import type { HostVerificationRow } from '@/lib/host-verification';

type DocField = 'nin-document';

const NIN_DOC_SPEC = {
  field: 'nin-document' as DocField,
  label: 'NIN Document',
  hint: 'Optional supporting document. A scan or photo of your NIN slip helps staff confirm your number.',
  column: 'id_document_url',
};

const STEP_LABELS = ['Host Info', 'Identity', 'Payout & Review'];

interface WizardForm {
  businessName: string;
  businessType: HostBusinessType;
  yearsInBusiness: HostYearsInBusiness;
  websiteSocial: string;
  address: string;
  legalName: string;
  nin: string;
  idDocumentPath: string | null;
  bankName: string;
  accountHolder: string;
  accountNumber: string;
}

function emptyForm(): WizardForm {
  return {
    businessName: '',
    businessType: 'individual',
    yearsInBusiness: '1-2 years',
    websiteSocial: '',
    address: '',
    legalName: '',
    nin: '',
    idDocumentPath: null,
    bankName: '',
    accountHolder: '',
    accountNumber: '',
  };
}

function legacyBusinessType(status: string): HostBusinessType {
  if (status === 'individual' || status === 'company') return status as HostBusinessType;
  return status === 'registered_company' || status === 'partnership' ? 'company' : 'individual';
}

function formToPayload(form: WizardForm) {
  return {
    businessName: form.businessName,
    businessType: form.businessType,
    yearsInBusiness: form.yearsInBusiness,
    websiteSocial: form.websiteSocial.trim() ? form.websiteSocial : null,
    address: form.address,
    legalName: form.legalName,
    nin: form.nin,
    idDocumentPath: form.idDocumentPath,
    bankName: form.bankName,
    accountHolder: form.accountHolder,
    accountNumber: form.accountNumber,
  };
}

function validateStep(step: number, form: WizardForm): string | null {
  if (step === 0) {
    if (!form.businessName.trim()) return 'Add a business name.';
    if (!form.address.trim()) return 'Add your address.';
    return null;
  }
  if (step === 1) {
    if (!form.legalName.trim()) return 'Add your legal name.';
    if (!/^[0-9]{11}$/.test(form.nin.trim())) return 'NIN must be an 11-digit number.';
    return null;
  }
  if (step === 2) {
    if (!form.bankName.trim()) return 'Add your bank name.';
    if (!form.accountHolder.trim()) return 'Add the account holder name.';
    if (!/^[0-9]{10}$/.test(form.accountNumber.trim())) return 'Account number must be 10 digits.';
    return null;
  }
  return null;
}

function validateAll(form: WizardForm): string | null {
  for (const step of [0, 1, 2]) {
    const err = validateStep(step, form);
    if (err) return err;
  }
  return null;
}

function maskId(value: string): string {
  return value.length <= 4 ? '••••••••' + value : '••••••••' + value.slice(-4);
}

export default function HostVerificationPage() {
  const router = useRouter();
  const user = useLagosLiveStore((s) => s.user);
  const authLoading = useLagosLiveStore((s) => s.authLoading);
  const refreshUser = useLagosLiveStore((s) => s.refreshUser);
  const showToast = useLagosLiveStore((s) => s.showToast);
  const { row, status, loading, error, refresh, previews } = useHostVerification();

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<WizardForm>(emptyForm);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const prefillDone = useRef(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login?next=%2Fhost%2Fverification');
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!row || prefillDone.current) return;
    if (status === 'rejected' || status === 'resubmit_requested') {
      setForm({
        businessName: row.businessName ?? '',
        businessType: legacyBusinessType(row.businessType),
        yearsInBusiness:
          row.yearsInBusiness && (HOST_YEARS_IN_BUSINESS as readonly string[]).includes(row.yearsInBusiness)
            ? (row.yearsInBusiness as HostYearsInBusiness)
            : '1-2 years',
        websiteSocial: row.websiteSocial ?? '',
        address: row.address ?? '',
        legalName: row.legalName ?? '',
        nin: row.nin ?? '',
        idDocumentPath: row.idDocumentUrl,
        bankName: row.bankName ?? '',
        accountHolder: row.accountHolder ?? '',
        accountNumber: row.accountNumber ?? row.accountLast4 ?? '',
      });
      prefillDone.current = true;
    }
  }, [row, status]);

  if (authLoading || !user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 size={26} strokeWidth={2} color="#FF9B3E" className="animate-spin" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto animate-fade-in pb-24">
        <HostDashboardNav title="Host Verification" />
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 size={22} strokeWidth={2} color="#FF9B3E" className="animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-[520px] animate-fade-in pb-24">
        <HostDashboardNav title="Host Verification" />
        <div className="flex flex-col items-center gap-3 rounded-2xl p-8 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,138,0,0.25)' }}>
          <AlertTriangle size={26} strokeWidth={1.5} color="#FF8A00" />
          <div className="text-sm" style={{ color: '#A7A8B5' }}>Couldn&apos;t load your verification status.</div>
          <button
            onClick={() => void refresh()}
            className="flex items-center gap-2 rounded-[10px] px-4 py-2 text-[13px] font-semibold"
            style={{ background: 'rgba(255,138,0,0.12)', border: '1px solid rgba(255,138,0,0.3)', color: '#FF8A00' }}
          >
            <RefreshCw size={13} strokeWidth={2.5} /> Retry
          </button>
        </div>
      </div>
    );
  }

  const statusColor = HOST_VERIFICATION_STATUS_COLOR[status];
  const showWizard = status === 'unverified' || status === 'rejected' || status === 'resubmit_requested';

  const openFilePicker = () => {
    setUploadError(null);
    if (fileInput.current) {
      fileInput.current.value = '';
      fileInput.current.click();
    }
  };

  const handleFileChosen = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      if (!['image/jpeg', 'image/png'].includes(file.type)) throw new Error('Upload a JPG or PNG image.');
      if (file.size > 5 * 1024 * 1024) throw new Error('Keep documents under 5MB.');

      const res = await fetch('/api/host/verification/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: NIN_DOC_SPEC.field, fileName: file.name, contentType: file.type }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; url?: string; path?: string; error?: string } | null;
      if (!res.ok || !json?.ok || !json.url || !json.path) throw new Error(json?.error ?? 'Could not prepare the upload.');
      const uploadUrl = json.url;
      const uploadPath = json.path;

      const up = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!up.ok && up.status !== 201 && up.status !== 200) throw new Error('Upload failed. Try again.');

      setForm((f) => ({ ...f, idDocumentPath: uploadPath }));
      setLocalPreview(URL.createObjectURL(file));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed. Try again.');
    } finally {
      setUploading(false);
    }
  };

  const removeDocument = () => {
    setForm((f) => ({ ...f, idDocumentPath: null }));
    setLocalPreview(null);
  };

  const ninPreview = localPreview ?? previews[NIN_DOC_SPEC.column] ?? null;

  const goNext = () => {
    const err = validateStep(step, form);
    if (err) {
      setStepError(err);
      return;
    }
    setStepError(null);
    setSubmitError(null);
    setStep((s) => Math.min(s + 1, STEP_LABELS.length - 1));
  };

  const goBack = () => {
    setStepError(null);
    setSubmitError(null);
    setStep((s) => Math.max(s - 1, 0));
  };

  const handleSubmit = async () => {
    if (submitting) return;
    const err = validateAll(form);
    if (err) {
      setSubmitError(err);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const endpoint =
        status === 'rejected' || status === 'resubmit_requested'
          ? '/api/host/verification/resubmit'
          : '/api/host/verification/submit';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formToPayload(form)),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? 'Could not submit your details.');
      showToast('Verification submitted', 'Our team will review your details shortly.');
      await Promise.all([refresh(), refreshUser()]);
      setStep(0);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-[520px] animate-fade-in pb-24 md:max-w-[900px]">
      <HostDashboardNav title="Host Verification" />

      <div className="flex flex-col gap-4 p-5">
        {/* Status hero */}
        <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl" style={{ background: statusColor.bg, border: `1px solid ${statusColor.border}` }}>
              {status === 'verified' ? (
                <CheckCircle2 size={18} strokeWidth={2.2} color={statusColor.color} />
              ) : status === 'pending' ? (
                <Clock size={18} strokeWidth={2.2} color={statusColor.color} />
              ) : (
                <ShieldCheck size={18} strokeWidth={2.2} color={statusColor.color} />
              )}
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[15px] font-bold" style={{ color: '#FFFFFF' }}>{HOST_VERIFICATION_STATUS_LABEL[status]}</span>
                <span className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.5px]" style={{ background: statusColor.bg, color: statusColor.color, border: `1px solid ${statusColor.border}` }}>
                  {status}
                </span>
              </div>
              <div className="mt-0.5 text-[12px]" style={{ color: '#A7A8B5' }}>
                {status === 'verified'
                  ? 'Your account is a trusted Lagos Live host and payouts are enabled.'
                  : status === 'pending'
                  ? 'We\u2019ll get back to you once your details are reviewed.'
                  : 'Complete a few details so we can verify who runs your events.'}
              </div>
            </div>
          </div>

          {(status === 'rejected' || status === 'resubmit_requested') && row?.reviewReason && (
            <div className="mt-4 rounded-xl border p-3.5 text-[12.5px] leading-[1.6]" style={{ background: 'rgba(255,138,0,0.06)', borderColor: 'rgba(255,138,0,0.2)', color: '#A7A8B5' }}>
              <span style={{ color: '#FF8A00', fontWeight: 700 }}>Why:</span> {row.reviewReason}
            </div>
          )}

          {status === 'rejected' && (
            <div className="mt-4 rounded-xl p-3.5 text-[12.5px] leading-[1.6]" style={{ background: 'rgba(255,45,149,0.06)', border: '1px solid rgba(255,45,149,0.18)', color: '#A7A8B5' }}>
              Update the details below and resubmit. Your previous submission has been kept so you can edit in place.
            </div>
          )}
        </div>

        {status === 'verified' && <VerifiedPanel row={row} onPayouts={() => router.push('/host/payouts')} />}
        {status === 'pending' && <PendingPanel row={row} />}

        {showWizard && (
          <div className="flex flex-col gap-4">
            <StepBar step={step} />

            {step === 0 && <HostInfoStep form={form} setForm={setForm} />}
            {step === 1 && (
              <IdentityStep
                form={form}
                setForm={setForm}
                preview={ninPreview}
                uploading={uploading}
                uploadError={uploadError}
                onPick={openFilePicker}
                onRemove={removeDocument}
              />
            )}
            {step === 2 && <PayoutReviewStep form={form} setForm={setForm} />}

            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png"
              className="hidden"
              onChange={(e) => void handleFileChosen(e.target.files?.[0] ?? null)}
            />

            {stepError && (
              <div className="rounded-xl px-4 py-3 text-[12px]" style={{ background: 'rgba(255,138,0,0.08)', border: '1px solid rgba(255,138,0,0.25)', color: '#FF8A00' }}>
                {stepError}
              </div>
            )}
            {submitError && (
              <div className="rounded-xl px-4 py-3 text-[12px]" style={{ background: 'rgba(255,45,149,0.1)', border: '1px solid rgba(255,45,149,0.25)', color: '#FF2D95' }}>
                {submitError}
              </div>
            )}

            <div className="flex items-center gap-2.5">
              {step > 0 && (
                <button
                  onClick={goBack}
                  disabled={submitting}
                  className="flex items-center gap-1.5 rounded-xl px-4 py-3 text-[13px] font-bold transition-all disabled:opacity-50"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#A7A8B5' }}
                >
                  <ChevronLeft size={15} strokeWidth={2.5} /> Back
                </button>
              )}
              {step < 2 ? (
                <button
                  onClick={goNext}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-3 text-[13px] font-bold transition-all active:scale-[0.99]"
                  style={{ background: 'linear-gradient(135deg, #FF9B3E, #FF6A00)', color: '#FFFFFF', boxShadow: '0 6px 24px rgba(255,106,0,0.25)' }}
                >
                  Continue <ChevronRight size={15} strokeWidth={2.5} />
                </button>
              ) : (
                <button
                  onClick={() => void handleSubmit()}
                  disabled={submitting}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-3 text-[13px] font-bold transition-all active:scale-[0.99] disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #FF2D95, #8A2BE2)', color: '#FFFFFF', boxShadow: '0 6px 24px rgba(255,45,149,0.3)' }}
                >
                  {submitting ? (
                    <>
                      <Loader2 size={15} className="animate-spin" /> Submitting...
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={15} /> {status === 'rejected' || status === 'resubmit_requested' ? 'Resubmit for review' : 'Submit for verification'}
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StepBar({ step }: { step: number }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex items-center">
        {STEP_LABELS.map((label, i) => (
          <div key={label} className="flex items-center">
            <div
              className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
              style={
                i <= step
                  ? { background: 'linear-gradient(135deg, #FF9B3E, #FF6A00)', color: '#FFFFFF' }
                  : { background: 'rgba(255,255,255,0.06)', color: '#6B6C80' }
              }
            >
              {i < step ? '✓' : i + 1}
            </div>
            <span
              className={`${i === STEP_LABELS.length - 1 ? '' : 'mr-2'} hidden text-[11px] font-semibold sm:inline`}
              style={{ color: i === step ? '#FFFFFF' : '#6B6C80' }}
            >
              {label}
            </span>
            {i < STEP_LABELS.length - 1 && (
              <span className="mx-2 hidden h-px w-8 sm:block" style={{ background: i < step ? '#FF9B3E' : 'rgba(255,255,255,0.1)' }} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function VerifiedPanel({ row, onPayouts }: { row: HostVerificationRow | null; onPayouts: () => void }) {
  return (
    <div className="rounded-2xl p-5" style={{ background: 'rgba(0,245,212,0.05)', border: '1px solid rgba(0,245,212,0.18)' }}>
      <div className="flex items-center gap-2 text-[15px] font-bold" style={{ color: '#00F5D4' }}>
        <BadgeCheck size={18} strokeWidth={2.2} /> Verified Host
      </div>
      {row?.businessName && (
        <div className="mt-1 text-[12px]" style={{ color: '#A7A8B5' }}>{row.businessName}</div>
      )}
      <div className="mt-3 rounded-xl p-3.5 text-[12.5px] leading-[1.6]" style={{ background: 'rgba(0,245,212,0.06)', border: '1px solid rgba(0,245,212,0.16)', color: '#A7A8B5' }}>
        Your events carry the <span style={{ color: '#00F5D4', fontWeight: 700 }}>✓ Verified Host</span> badge so buyers know you&apos;re a real operator.
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl p-3.5" style={{ background: 'rgba(0,245,212,0.06)', border: '1px solid rgba(0,245,212,0.16)' }}>
        <div className="text-[12.5px]" style={{ color: '#D5D6E0' }}>
          <span className="font-bold" style={{ color: '#00F5D4' }}>Payouts enabled.</span> {HOST_VERIFICATION_PAYOUT_GATE.ok}
        </div>
        <button
          onClick={onPayouts}
          className="shrink-0 rounded-[10px] px-3.5 py-2 text-[11.5px] font-bold"
          style={{ background: 'rgba(0,245,212,0.12)', border: '1px solid rgba(0,245,212,0.35)', color: '#00F5D4' }}
        >
          <Landmark size={12} strokeWidth={2.2} className="mr-1 inline" /> View payouts
        </button>
      </div>
    </div>
  );
}

function PendingPanel({ row }: { row: HostVerificationRow | null }) {
  return (
    <div className="rounded-2xl p-5" style={{ background: 'rgba(176,106,255,0.06)', border: '1px solid rgba(176,106,255,0.18)' }}>
      <div className="flex items-center gap-2 text-[15px] font-bold" style={{ color: '#B06AFF' }}>
        <Clock size={18} strokeWidth={2.2} /> Verification Under Review
      </div>
      <div className="mt-2 text-[12.5px] leading-[1.7]" style={{ color: '#A7A8B5' }}>
        We&apos;ve received your details and they&apos;re now queued for review. Once approved, your events surface as verified and payouts unlock — you&apos;ll get an email from us, usually within 1–2 business days.
      </div>
      {row && (
        <div className="mt-3 rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.9px]" style={{ color: '#6B6C80' }}>Submitted details</div>
          <SummaryGrid
            rows={[
              { label: 'Business', value: row.businessName || '—' },
              { label: 'Legal name', value: row.legalName || '—' },
              { label: 'Bank', value: row.bankName || '—' },
              { label: 'NIN', value: maskId(row.nin || '') },
              { label: 'Account', value: maskId(row.accountNumber ?? row.accountLast4 ?? '') },
            ]}
          />
        </div>
      )}
    </div>
  );
}

function SummaryGrid({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-3 text-[12px]">
          <span style={{ color: '#6B6C80' }}>{r.label}</span>
          <span className="min-w-0 truncate font-semibold" style={{ color: '#FFFFFF' }}>{r.value || '—'}</span>
        </div>
      ))}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  optional,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  optional?: boolean;
  inputMode?: 'numeric' | 'text' | 'url';
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.9px]" style={{ color: '#6B6C80' }}>
        {label} {optional && <span className="ml-1 uppercase" style={{ color: '#4A4B5C' }}>(optional)</span>}
      </label>
      <div className="flex items-center gap-2 rounded-xl px-3.5 py-2.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <input
          type={type}
          inputMode={inputMode}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent text-[13px] outline-none"
          style={{ color: '#FFFFFF' }}
        />
      </div>
    </div>
  );
}

function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  render,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  render: (v: T) => string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = opt === value;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className="rounded-[10px] px-3.5 py-2 text-[12px] font-semibold transition-all"
            style={
              active
                ? { background: 'rgba(255,154,62,0.12)', border: '1px solid rgba(255,154,62,0.45)', color: '#FFFFFF' }
                : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#A7A8B5' }
            }
          >
            {render(opt)}
          </button>
        );
      })}
    </div>
  );
}

function StepCard({ icon, title, hint, children }: { icon?: React.ReactNode; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="mb-4 flex items-center gap-2.5">
        {icon && <span className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: 'rgba(255,154,62,0.1)' }}>{icon}</span>}
        <div>
          <div className="text-[14px] font-bold" style={{ color: '#FFFFFF' }}>{title}</div>
          {hint && <div className="text-[11.5px]" style={{ color: '#6B6C80' }}>{hint}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}

function HostInfoStep({ form, setForm }: { form: WizardForm; setForm: (updater: (f: WizardForm) => WizardForm) => void }) {
  return (
    <StepCard icon={<Building2 size={15} strokeWidth={2.2} color="#FF9B3E" />} title="Tell us about your business" hint="Step 1 of 3">
      <div className="flex flex-col gap-3.5">
        <Field label="Business name" value={form.businessName} onChange={(v) => setForm((f) => ({ ...f, businessName: v }))} placeholder="e.g. Waka Waka Events" />
        <div>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.9px]" style={{ color: '#6B6C80' }}>Business type</label>
          <ChipGroup
            options={HOST_BUSINESS_TYPES}
            value={form.businessType}
            onChange={(v) => setForm((f) => ({ ...f, businessType: v }))}
            render={(v) => HOST_BUSINESS_TYPE_LABEL[v]}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.9px]" style={{ color: '#6B6C80' }}>Years in business</label>
          <ChipGroup
            options={HOST_YEARS_IN_BUSINESS}
            value={form.yearsInBusiness}
            onChange={(v) => setForm((f) => ({ ...f, yearsInBusiness: v }))}
            render={(v) => v}
          />
        </div>
        <Field label="Website or social media" value={form.websiteSocial} onChange={(v) => setForm((f) => ({ ...f, websiteSocial: v }))} placeholder="e.g. instagram.com/wakawaka" optional inputMode="url" />
        <Field label="Address" value={form.address} onChange={(v) => setForm((f) => ({ ...f, address: v }))} placeholder="Where your events run from" />
      </div>
    </StepCard>
  );
}

function IdentityStep({
  form,
  setForm,
  preview,
  uploading,
  uploadError,
  onPick,
  onRemove,
}: {
  form: WizardForm;
  setForm: (updater: (f: WizardForm) => WizardForm) => void;
  preview: string | null;
  uploading: boolean;
  uploadError: string | null;
  onPick: () => void;
  onRemove: () => void;
}) {
  return (
    <StepCard icon={<Fingerprint size={15} strokeWidth={2.2} color="#FF9B3E" />} title="Who runs your events?" hint="Step 2 of 3">
      <div className="flex flex-col gap-3.5">
        <Field label="Legal name" value={form.legalName} onChange={(v) => setForm((f) => ({ ...f, legalName: v }))} placeholder="As it appears on your NIN" />
        <Field label="NIN" value={form.nin} onChange={(v) => setForm((f) => ({ ...f, nin: v.replace(/[^0-9]/g, '').slice(0, 11) }))} placeholder="11-digit NIN" inputMode="numeric" />

        <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[13px] font-bold" style={{ color: '#FFFFFF' }}>{NIN_DOC_SPEC.label}</div>
              <div className="mt-0.5 text-[11.5px] leading-[1.5]" style={{ color: '#6B6C80' }}>{NIN_DOC_SPEC.hint}</div>
            </div>
            {preview ? (
              <img src={preview} alt={NIN_DOC_SPEC.label} className="h-14 w-14 flex-shrink-0 rounded-xl object-cover" style={{ border: '1px solid rgba(0,245,212,0.3)' }} />
            ) : (
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <FileText size={18} strokeWidth={2} color="#6B6C80" />
              </div>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={onPick}
              disabled={uploading}
              className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[12px] font-bold transition-all disabled:opacity-50"
              style={
                preview
                  ? { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#FFFFFF' }
                  : { background: 'linear-gradient(135deg, #FF9B3E, #FF6A00)', color: '#FFFFFF' }
              }
            >
              {uploading ? <Loader2 size={13} strokeWidth={2.5} className="animate-spin" /> : <Upload size={13} strokeWidth={2.5} />}
              {uploading ? 'Uploading...' : preview ? 'Replace' : 'Upload'}
            </button>
            {preview && (
              <button
                onClick={onRemove}
                className="flex items-center gap-1 rounded-xl px-3 py-2 text-[12px] font-semibold"
                style={{ background: 'rgba(255,255,255,0.04)', color: '#A7A8B5' }}
              >
                <X size={13} strokeWidth={2.5} /> Remove
              </button>
            )}
            <span className="text-[10.5px]" style={{ color: '#6B6C80' }}>JPG / PNG · max 5MB</span>
          </div>
          {uploadError && (
            <div className="mt-3 rounded-xl px-4 py-3 text-[12px]" style={{ background: 'rgba(255,138,0,0.08)', border: '1px solid rgba(255,138,0,0.25)', color: '#FF8A00' }}>
              {uploadError}
            </div>
          )}
        </div>
      </div>
    </StepCard>
  );
}

function PayoutReviewStep({ form, setForm }: { form: WizardForm; setForm: (updater: (f: WizardForm) => WizardForm) => void }) {
  return (
    <StepCard icon={<Landmark size={15} strokeWidth={2.2} color="#FF9B3E" />} title="Where should we send payouts?" hint="Step 3 of 3">
      <div className="mb-3 rounded-xl p-3.5 text-[11.5px] leading-[1.6]" style={{ background: 'rgba(255,255,255,0.03)', color: '#6B6C80' }}>
        This is the account your earnings are settled to. Only your bank and the last 4 digits are ever shown publicly.
      </div>
      <div className="flex flex-col gap-3.5">
        <div>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.9px]" style={{ color: '#6B6C80' }}>Bank name</label>
          <div className="rounded-xl px-3.5 py-2.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <select
              value={form.bankName}
              onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))}
              className="w-full bg-transparent text-[13px] outline-none"
              style={{ color: form.bankName ? '#FFFFFF' : '#6B6C80' }}
            >
              <option value="" disabled style={{ color: '#6B6C80', background: '#14141D' }}>Select your bank</option>
              {NIGERIAN_BANK_NAMES.map((name) => (
                <option key={name} value={name} style={{ color: '#FFFFFF', background: '#14141D' }}>{name}</option>
              ))}
            </select>
          </div>
        </div>
        <Field label="Account number" value={form.accountNumber} onChange={(v) => setForm((f) => ({ ...f, accountNumber: v.replace(/[^0-9]/g, '').slice(0, 10) }))} placeholder="10-digit account number" inputMode="numeric" />
        <Field label="Account holder" value={form.accountHolder} onChange={(v) => setForm((f) => ({ ...f, accountHolder: v }))} placeholder="Name on the account" />
      </div>

      <div className="mt-4 rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="mb-3 text-[13px] font-bold" style={{ color: '#FFFFFF' }}>Review and submit</div>

        <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.9px]" style={{ color: '#6B6C80' }}>Host info</div>
        <div className="mb-3 flex flex-col gap-2 rounded-xl p-3.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <SummaryGrid
            rows={[
              { label: 'Business', value: form.businessName || '—' },
              { label: 'Type', value: HOST_BUSINESS_TYPE_LABEL[form.businessType] },
              { label: 'Active', value: `${form.yearsInBusiness} in business` },
              ...(form.websiteSocial.trim() ? [{ label: 'Website / IG', value: form.websiteSocial.trim() }] : []),
              { label: 'Address', value: form.address || '—' },
            ]}
          />
        </div>

        <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.9px]" style={{ color: '#6B6C80' }}>Identity</div>
        <div className="mb-3 flex flex-col gap-2 rounded-xl p-3.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <SummaryGrid
            rows={[
              { label: 'Legal name', value: form.legalName || '—' },
              { label: 'NIN', value: form.nin ? maskId(form.nin) : '—' },
            ]}
          />
        </div>

        <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.9px]" style={{ color: '#6B6C80' }}>Payout</div>
        <div className="flex flex-col gap-2 rounded-xl p-3.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <SummaryGrid
            rows={[
              { label: 'Bank', value: form.bankName || '—' },
              { label: 'Account', value: form.accountNumber ? `••••••${form.accountNumber.slice(-4)}` : '—' },
            ]}
          />
        </div>
      </div>

      <div className="mt-3 rounded-xl p-3.5 text-[11.5px] leading-[1.6]" style={{ background: 'rgba(255,255,255,0.03)', color: '#6B6C80' }}>
        By submitting you confirm these are your real business details. Our team may reach out if anything needs clarification — and payouts stay locked until your verification is approved.
      </div>
    </StepCard>
  );
}