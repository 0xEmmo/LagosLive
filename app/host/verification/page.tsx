'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  BadgeCheck,
  Building2,
  Camera,
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
} from '@/lib/host-verification-types';
import type { HostVerificationRow } from '@/lib/host-verification';

type BusinessType = 'sole_proprietor' | 'registered_company' | 'partnership';
type IdType = 'national_id' | 'driver_license' | 'passport' | 'business_registration';
type DocField = 'id-document' | 'id-selfie' | 'business-document';

const BUSINESS_TYPE_LABEL: Record<BusinessType, string> = {
  sole_proprietor: 'Sole proprietor',
  registered_company: 'Registered company',
  partnership: 'Partnership',
};

const ID_TYPE_LABEL: Record<IdType, string> = {
  national_id: 'National ID',
  driver_license: "Driver's license",
  passport: 'Passport',
  business_registration: 'Business registration',
};

const DOCUMENT_SPECS: { field: DocField; label: string; hint: string; column: string }[] = [
  {
    field: 'id-document',
    label: 'Government-issued ID',
    hint: 'National ID, driver\u2019s license or passport (photo of the front).',
    column: 'id_document_url',
  },
  {
    field: 'id-selfie',
    label: 'Selfie holding your ID',
    hint: 'A clear face + document shot so staff can match you to your identity.',
    column: 'id_selfie_url',
  },
  {
    field: 'business-document',
    label: 'Business document',
    hint: 'CAC certificate, business registration or a recent utility bill.',
    column: 'business_document_url',
  },
];

const STEP_LABELS = ['Business', 'Identity', 'Documents', 'Bank', 'Review'];

const DOC_FIELD_TO_FORM_KEY: Record<DocField, keyof WizardForm> = {
  'id-document': 'idDocumentPath',
  'id-selfie': 'idSelfiePath',
  'business-document': 'businessDocumentPath',
};

const DOC_FIELD_TO_COLUMN: Record<DocField, string> = {
  'id-document': 'id_document_url',
  'id-selfie': 'id_selfie_url',
  'business-document': 'business_document_url',
};

interface WizardForm {
  businessName: string;
  businessType: BusinessType;
  cacNumber: string;
  legalName: string;
  dob: string;
  idType: IdType;
  idNumber: string;
  idDocumentPath: string | null;
  idSelfiePath: string | null;
  businessDocumentPath: string | null;
  bankName: string;
  accountHolder: string;
  accountLast4: string;
}

function emptyForm(): WizardForm {
  return {
    businessName: '',
    businessType: 'sole_proprietor',
    cacNumber: '',
    legalName: '',
    dob: '',
    idType: 'national_id',
    idNumber: '',
    idDocumentPath: null,
    idSelfiePath: null,
    businessDocumentPath: null,
    bankName: '',
    accountHolder: '',
    accountLast4: '',
  };
}

function formToPayload(form: WizardForm) {
  return {
    businessName: form.businessName,
    businessType: form.businessType,
    cacNumber: form.cacNumber.trim() ? form.cacNumber : null,
    legalName: form.legalName,
    dob: form.dob || null,
    idType: form.idType,
    idNumber: form.idNumber,
    idDocumentPath: form.idDocumentPath,
    idSelfiePath: form.idSelfiePath,
    businessDocumentPath: form.businessDocumentPath,
    bankName: form.bankName,
    accountHolder: form.accountHolder,
    accountLast4: form.accountLast4,
  };
}

function validateStep(step: number, form: WizardForm): string | null {
  if (step === 0) {
    if (!form.businessName.trim()) return 'Add a business name.';
    return null;
  }
  if (step === 1) {
    if (!form.legalName.trim()) return 'Add your legal name.';
    if (!form.idNumber.trim()) return 'Add your ID number.';
    return null;
  }
  if (step === 2) {
    if (!form.idDocumentPath) return 'Upload your government-issued ID to continue.';
    if (!form.idSelfiePath) return 'Upload your selfie holding your ID to continue.';
    return null;
  }
  if (step === 3) {
    if (!form.bankName.trim()) return 'Add your bank name.';
    if (!form.accountHolder.trim()) return 'Add the account holder name.';
    if (!/^[0-9]{4}$/.test(form.accountLast4)) return 'Account last 4 must be 4 digits.';
    return null;
  }
  return null;
}

function validateAll(form: WizardForm): string | null {
  for (const step of [0, 1, 2, 3]) {
    const err = validateStep(step, form);
    if (err) return err;
  }
  return null;
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
  const [localPreviews, setLocalPreviews] = useState<Record<string, string | null>>({});
  const [uploadingField, setUploadingField] = useState<DocField | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const prefillDone = useRef(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [pendingField, setPendingField] = useState<DocField | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login?next=%2Fhost%2Fverification');
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!row || prefillDone.current) return;
    if (status === 'rejected' || status === 'resubmit_requested') {
      setForm({
        businessName: row.businessName ?? '',
        businessType: row.businessType,
        cacNumber: row.cacNumber ?? '',
        legalName: row.legalName ?? '',
        dob: row.dob ?? '',
        idType: row.idType,
        idNumber: row.idNumber ?? '',
        idDocumentPath: row.idDocumentUrl,
        idSelfiePath: row.idSelfieUrl,
        businessDocumentPath: row.businessDocumentUrl,
        bankName: row.bankName ?? '',
        accountHolder: row.accountHolder ?? '',
        accountLast4: row.accountLast4 ?? '',
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

  const openFilePicker = (field: DocField) => {
    setPendingField(field);
    setUploadError(null);
    if (fileInput.current) {
      fileInput.current.value = '';
      fileInput.current.click();
    }
  };

  const handleFileChosen = async (file: File | null) => {
    const field = pendingField;
    if (!field || !file) {
      if (field) setPendingField(null);
      return;
    }
    setPendingField(null);
    setUploadingField(field);
    setUploadError(null);
    try {
      if (!file.type.startsWith('image/')) throw new Error('Upload an image file (JPG, PNG or WebP).');
      if (file.size > 5 * 1024 * 1024) throw new Error('Keep each document under 5MB.');

      const res = await fetch('/api/host/verification/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field, fileName: file.name, contentType: file.type }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; url?: string; path?: string; error?: string } | null;
      if (!res.ok || !json?.ok || !json.url || !json.path) throw new Error(json?.error ?? 'Could not prepare the upload.');

      const up = await fetch(json.url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!up.ok && up.status !== 201 && up.status !== 200) throw new Error('Upload failed. Try again.');

      const formKey = DOC_FIELD_TO_FORM_KEY[field];
      setForm((f) => ({ ...f, [formKey]: json.path }));
      setLocalPreviews((p) => ({ ...p, [field]: URL.createObjectURL(file) }));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed. Try again.');
    } finally {
      setUploadingField(null);
    }
  };

  const removeDocument = (field: DocField) => {
    const formKey = DOC_FIELD_TO_FORM_KEY[field];
    setForm((f) => ({ ...f, [formKey]: null }));
    setLocalPreviews((p) => {
      const next = { ...p };
      delete next[field];
      return next;
    });
  };

  const previewFor = (field: DocField): string | null => {
    const local = localPreviews[field];
    if (local) return local;
    return previews[DOC_FIELD_TO_COLUMN[field]] ?? null;
  };

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
                  ? 'Your account is a trusted Lagos Live host.'
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

            {step === 0 && (
              <BusinessStep form={form} setForm={setForm} />
            )}
            {step === 1 && (
              <IdentityStep form={form} setForm={setForm} />
            )}
            {step === 2 && (
              <DocumentsStep
                form={form}
                previewFor={previewFor}
                uploadingField={uploadingField}
                uploadError={uploadError}
                onPick={openFilePicker}
                onRemove={removeDocument}
              />
            )}
            {step === 3 && (
              <BankStep form={form} setForm={setForm} />
            )}
            {step === 4 && (
              <ReviewStep form={form} previewFor={previewFor} />
            )}

            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
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
              {step < 4 ? (
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
                      <ShieldCheck size={15} /> {status === 'rejected' || status === 'resubmit_requested' ? 'Resubmit for review' : 'Submit for review'}
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
        <Clock size={18} strokeWidth={2.2} /> Under review
      </div>
      <div className="mt-2 text-[12.5px] leading-[1.7]" style={{ color: '#A7A8B5' }}>
        We&apos;re reviewing <span style={{ color: '#FFFFFF', fontWeight: 600 }}>{row?.businessName ?? 'your details'}</span>. You&apos;ll get an update by email once your verification is resolved.
      </div>
      {row && (
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl p-3.5 text-[11.5px]" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <div style={{ color: '#6B6C80' }}>Legal name</div>
          <div style={{ color: '#FFFFFF' }}>{row.legalName || '—'}</div>
          <div style={{ color: '#6B6C80' }}>Bank</div>
          <div style={{ color: '#FFFFFF' }}>{row.bankName} · {row.accountLast4}</div>
        </div>
      )}
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  optional?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.9px]" style={{ color: '#6B6C80' }}>
        {label} {optional && <span className="ml-1 uppercase" style={{ color: '#4A4B5C' }}>(optional)</span>}
      </label>
      <div className="flex items-center gap-2 rounded-xl px-3.5 py-2.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <input
          type={type}
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

function BusinessStep({ form, setForm }: { form: WizardForm; setForm: (updater: (f: WizardForm) => WizardForm) => void }) {
  return (
    <StepCard icon={<Building2 size={15} strokeWidth={2.2} color="#FF9B3E" />} title="Tell us about your business" hint="Step 1 of 5">
      <div className="flex flex-col gap-3.5">
        <Field label="Business name" value={form.businessName} onChange={(v) => setForm((f) => ({ ...f, businessName: v }))} placeholder="e.g. Waka Waka Events" />
        <div>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.9px]" style={{ color: '#6B6C80' }}>Business type</label>
          <ChipGroup
            options={['sole_proprietor', 'registered_company', 'partnership'] as const}
            value={form.businessType}
            onChange={(v) => setForm((f) => ({ ...f, businessType: v }))}
            render={(v) => BUSINESS_TYPE_LABEL[v]}
          />
        </div>
        <Field label="CAC registration number" value={form.cacNumber} onChange={(v) => setForm((f) => ({ ...f, cacNumber: v }))} placeholder="Optional" optional />
      </div>
    </StepCard>
  );
}

function IdentityStep({ form, setForm }: { form: WizardForm; setForm: (updater: (f: WizardForm) => WizardForm) => void }) {
  return (
    <StepCard icon={<Fingerprint size={15} strokeWidth={2.2} color="#FF9B3E" />} title="Your identity" hint="Step 2 of 5">
      <div className="flex flex-col gap-3.5">
        <Field label="Legal name" value={form.legalName} onChange={(v) => setForm((f) => ({ ...f, legalName: v }))} placeholder="As it appears on your ID" />
        <Field label="Date of birth" value={form.dob} onChange={(v) => setForm((f) => ({ ...f, dob: v }))} type="date" optional />
        <div>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.9px]" style={{ color: '#6B6C80' }}>ID type</label>
          <ChipGroup
            options={['national_id', 'driver_license', 'passport', 'business_registration'] as const}
            value={form.idType}
            onChange={(v) => setForm((f) => ({ ...f, idType: v }))}
            render={(v) => ID_TYPE_LABEL[v]}
          />
        </div>
        <Field label="ID number" value={form.idNumber} onChange={(v) => setForm((f) => ({ ...f, idNumber: v }))} placeholder="NIN, driver\u2019s license or passport #" />
      </div>
    </StepCard>
  );
}

function DocumentsStep({
  previewFor,
  uploadingField,
  uploadError,
  onPick,
  onRemove,
}: {
  form: WizardForm;
  previewFor: (field: DocField) => string | null;
  uploadingField: DocField | null;
  uploadError: string | null;
  onPick: (field: DocField) => void;
  onRemove: (field: DocField) => void;
}) {
  return (
    <StepCard icon={<Camera size={15} strokeWidth={2.2} color="#FF9B3E" />} title="Upload your documents" hint="Step 3 of 5">
      <div className="flex flex-col gap-3">
        {DOCUMENT_SPECS.map((spec) => {
          const preview = previewFor(spec.field);
          const uploading = uploadingField === spec.field;
          return (
            <div key={spec.field} className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[13px] font-bold" style={{ color: '#FFFFFF' }}>{spec.label}</div>
                  <div className="mt-0.5 text-[11.5px] leading-[1.5]" style={{ color: '#6B6C80' }}>{spec.hint}</div>
                </div>
                {preview ? (
                  <img src={preview} alt={spec.label} className="h-14 w-14 flex-shrink-0 rounded-xl object-cover" style={{ border: '1px solid rgba(0,245,212,0.3)' }} />
                ) : (
                  <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <FileText size={18} strokeWidth={2} color="#6B6C80" />
                  </div>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => onPick(spec.field)}
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
                    onClick={() => onRemove(spec.field)}
                    className="flex items-center gap-1 rounded-xl px-3 py-2 text-[12px] font-semibold"
                    style={{ background: 'rgba(255,255,255,0.04)', color: '#A7A8B5' }}
                  >
                    <X size={13} strokeWidth={2.5} /> Remove
                  </button>
                )}
                <span className="text-[10.5px]" style={{ color: '#6B6C80' }}>JPG, PNG or WebP · max 5MB</span>
              </div>
            </div>
          );
        })}
        {uploadError && (
          <div className="rounded-xl px-4 py-3 text-[12px]" style={{ background: 'rgba(255,138,0,0.08)', border: '1px solid rgba(255,138,0,0.25)', color: '#FF8A00' }}>
            {uploadError}
          </div>
        )}
      </div>
    </StepCard>
  );
}

function BankStep({ form, setForm }: { form: WizardForm; setForm: (updater: (f: WizardForm) => WizardForm) => void }) {
  return (
    <StepCard icon={<Landmark size={15} strokeWidth={2.2} color="#FF9B3E" />} title="Banking details" hint="Step 4 of 5">
      <div className="mb-3 rounded-xl p-3.5 text-[11.5px] leading-[1.6]" style={{ background: 'rgba(255,255,255,0.03)', color: '#6B6C80' }}>
        This is the account payouts are settled to. We only keep the last 4 digits — your full account number is never stored.
      </div>
      <div className="flex flex-col gap-3.5">
        <Field label="Bank name" value={form.bankName} onChange={(v) => setForm((f) => ({ ...f, bankName: v }))} placeholder="e.g. GTBank" />
        <Field label="Account holder" value={form.accountHolder} onChange={(v) => setForm((f) => ({ ...f, accountHolder: v }))} placeholder="Name on the account" />
        <Field label="Last 4 digits of account" value={form.accountLast4} onChange={(v) => setForm((f) => ({ ...f, accountLast4: v.replace(/[^0-9]/g, '').slice(0, 4) }))} placeholder="1234" />
      </div>
    </StepCard>
  );
}

function ReviewStep({ form, previewFor }: { form: WizardForm; previewFor: (field: DocField) => string | null }) {
  const rows: { label: string; value: string }[] = [
    { label: 'Business', value: form.businessName },
    { label: 'Business type', value: BUSINESS_TYPE_LABEL[form.businessType] },
    ...(form.cacNumber ? [{ label: 'CAC number', value: form.cacNumber }] : []),
    { label: 'Legal name', value: form.legalName },
    { label: 'ID type', value: ID_TYPE_LABEL[form.idType] },
    { label: 'ID number', value: form.idNumber },
    { label: 'Bank', value: form.bankName },
    { label: 'Account holder', value: form.accountHolder },
    { label: 'Account', value: `•••• ${form.accountLast4}` },
  ];

  return (
    <StepCard icon={<ShieldCheck size={15} strokeWidth={2.2} color="#FF9B3E" />} title="Review and submit" hint="Step 5 of 5">
      <div className="flex flex-col gap-2 rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)' }}>
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3 text-[12px]">
            <span style={{ color: '#6B6C80' }}>{r.label}</span>
            <span className="min-w-0 truncate font-semibold" style={{ color: '#FFFFFF' }}>{r.value || '—'}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {DOCUMENT_SPECS.map((spec) => {
          const preview = previewFor(spec.field);
          return (
            <div key={spec.field} className="flex items-center justify-between gap-3 rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="text-[12px]" style={{ color: '#A7A8B5' }}>
                <span className="font-semibold" style={{ color: '#FFFFFF' }}>{spec.label}</span>
                <span style={{ color: preview ? '#00F5D4' : '#FF8A00' }}> · {preview ? 'Added' : 'Missing'}</span>
              </div>
              {preview && <img src={preview} alt={spec.label} className="h-10 w-10 rounded-lg object-cover" style={{ border: '1px solid rgba(0,245,212,0.3)' }} />}
            </div>
          );
        })}
      </div>

      <div className="mt-3 rounded-xl p-3.5 text-[11.5px] leading-[1.6]" style={{ background: 'rgba(255,255,255,0.03)', color: '#6B6C80' }}>
        By submitting you confirm this is your real business information. Our team may reach out if anything needs clarification.
      </div>
    </StepCard>
  );
}