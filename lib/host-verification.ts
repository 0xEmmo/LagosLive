// Server-only data access for the real Host Verification KYC flow (Batch 32).
//
// This sits on top of two read models that must always agree:
//
//   * public.host_verifications — the NEW document/bank/identity KYC row (five
//     wizard steps). It is the canonical home of the reviewer-facing payload.
//   * public.profiles.host_verification_status — the LEGACY column the rest of
//     the app already reads (event badges, payout gating, host_verified). A
//     trigger (set_host_verification_status) keeps the two in sync so every
//     existing gate/read path stays truthful without a second read model.
//
// Document refs live in the PRIVATE `host-verifications` Storage bucket under
// {user_id}/{documentPath}; the browser only ever holds signed URLs (upload and
// preview via server-signed URLs), never the object path.

import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { createServiceSupabase, type ServiceSupabase } from '@/lib/supabase/server';
import type { HostVerificationStatus } from '@/lib/host-verification-types';
import { claimNotification, recordNotificationOutcome } from '@/lib/notify';

// The single status a host row can be in. Mirrors the DB CHECK exactly.
export type HostKycStatus = 'unverified' | 'pending' | 'verified' | 'rejected' | 'resubmit_requested';

export interface HostVerificationRow {
  id: string;
  userId: string;
  status: HostKycStatus;

  // -- Step 1: business -----------------------------------------------------
  businessName: string;
  businessType: 'sole_proprietor' | 'registered_company' | 'partnership';
  cacNumber: string | null;

  // -- Step 2: personal / identity -------------------------------------------
  legalName: string;
  dob: string | null;
  idType: 'national_id' | 'driver_license' | 'passport' | 'business_registration';
  idNumber: string;
  idDocumentUrl: string | null;
  idSelfieUrl: string | null;

  // -- Step 3: business documents --------------------------------------------
  businessDocumentUrl: string | null;

  // -- Step 4: bank -----------------------------------------------------------
  bankName: string;
  accountHolder: string;
  accountLast4: string;

  // -- Step 5: phone OTP ------------------------------------------------------
  phoneVerified: boolean;
  phoneLast4: string | null;
  otpExpiresAt: string | null;

  submittedAt: string;
  resubmittedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewReason: string | null;
  createdAt: string;
  updatedAt: string;
}

function toRow(row: Database['public']['Tables']['host_verifications']['Row']): HostVerificationRow {
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status as HostKycStatus,
    businessName: row.business_name,
    businessType: row.business_type as HostVerificationRow['businessType'],
    cacNumber: row.cac_number,
    legalName: row.legal_name,
    dob: row.dob,
    idType: row.id_type as HostVerificationRow['idType'],
    idNumber: row.id_number,
    idDocumentUrl: row.id_document_url,
    idSelfieUrl: row.id_selfie_url,
    businessDocumentUrl: row.business_document_url,
    bankName: row.bank_name,
    accountHolder: row.account_holder,
    accountLast4: row.account_last4,
    phoneVerified: row.phone_verified ?? false,
    phoneLast4: row.phone_last4,
    otpExpiresAt: row.otp_expires_at,
    submittedAt: row.submitted_at,
    resubmittedAt: row.resubmitted_at,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
    reviewReason: row.review_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// The storage paths a host may upload to. Paths are intentionally whitelisted —
// a document type must exist before the client can ask for a signed upload URL,
// so a host can never mint a URL for an arbitrary object path.
export const VERIFICATION_DOCUMENT_FIELDS = [
  'id-document',
  'id-selfie',
  'business-document',
] as const;
export type VerificationDocumentField = (typeof VERIFICATION_DOCUMENT_FIELDS)[number];

export interface VerificationDocumentSpec {
  field: VerificationDocumentField;
  label: string;
  hint: string;
  column: 'id_document_url' | 'id_selfie_url' | 'business_document_url';
}

export const VERIFICATION_DOCUMENT_SPECS: VerificationDocumentSpec[] = [
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

function columnForField(field: VerificationDocumentField): string {
  const spec = VERIFICATION_DOCUMENT_SPECS.find((s) => s.field === field);
  return spec ? spec.column : 'id_document_url';
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  if (!digits) return '';
  // 0803 123 4567 -> +2348031234567 (also handles +2340000... input verbatim).
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('0')) return `+234${digits.slice(1)}`;
  return `+234${digits}`;
}

// ---------------------------------------------------------------------------
// Row helpers
// ---------------------------------------------------------------------------

export async function getHostVerificationByUserId(
  service: ServiceSupabase,
  userId: string
): Promise<HostVerificationRow | null> {
  const { data, error } = await service
    .from('host_verifications')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ? toRow(data) : null;
}

// Resolves whether this host may (re)submit. Staff are never gated: they always
// see the full detail page regardless of their own verification state.
export async function hostCanResubmit(
  service: ServiceSupabase,
  userId: string,
  row: HostVerificationRow | null,
  staff: boolean
): Promise<{ ok: boolean; reason?: string }> {
  if (staff) return { ok: true };
  if (!row) return { ok: true };
  if (row.status === 'verified') return { ok: false, reason: 'already_verified' };
  if (row.status === 'pending') return { ok: false, reason: 'already_pending' };
  return { ok: true }; // rejected/resubmit_requested/unverified -> resubmit.
}

// Staff-only: every pending submission, oldest first, for the moderation queue.
export async function listPendingHostVerifications(
  service: ServiceSupabase
): Promise<HostVerificationRow[]> {
  const { data, error } = await service
    .from('host_verifications')
    .select('*')
    .eq('status', 'pending')
    .order('submitted_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toRow);
}

// Staff-only: the full detail for one verification (documents included) so the
// review page can render image previews via server-signed URLs.
export async function getHostVerificationDetail(
  service: ServiceSupabase,
  verificationId: string
): Promise<HostVerificationRow | null> {
  const { data, error } = await service
    .from('host_verifications')
    .select('*')
    .eq('id', verificationId)
    .maybeSingle();
  if (error) throw error;
  return data ? toRow(data) : null;
}

// ---------------------------------------------------------------------------
// Signed URL helpers — private bucket, server-only signing.
// ---------------------------------------------------------------------------

const DOCUMENT_BUCKET = 'host-verifications';

export interface DocumentSlot {
  column: string;
  objectPath: string | null;
}

// Builds {column, objectPath} for every document field so the server can gather
// ids + object paths in one query and generate all preview signed URLs at once.
export function documentSlots(row: HostVerificationRow): DocumentSlot[] {
  return [
    { column: 'id_document_url', objectPath: row.idDocumentUrl },
    { column: 'id_selfie_url', objectPath: row.idSelfieUrl },
    { column: 'business_document_url', objectPath: row.businessDocumentUrl },
  ];
}

export interface SignedDocumentUrl {
  column: string;
  url: string | null;
}

// Generates short-lived read URLs for all non-null document paths. Private
// buckets are never client-readable, so every preview is a signed URL the
// server created — never the raw object path.
export async function signDocumentPreviewUrls(
  service: ServiceSupabase,
  verificationId: string,
  rows: { column: string; objectPath: string | null }[],
  seconds = 60 * 5
): Promise<SignedDocumentUrl[]> {
  const out: SignedDocumentUrl[] = [];
  for (const slot of rows) {
    if (!slot.objectPath) {
      out.push({ column: slot.column, url: null });
      continue;
    }
    const { data, error } = await service.storage
      .from(DOCUMENT_BUCKET)
      .createSignedUrl(slot.objectPath, seconds);
    if (error) {
      console.warn('[host-verification] signed preview failed', { verificationId, column: slot.column, error: error.message });
      out.push({ column: slot.column, url: null });
      continue;
    }
    out.push({ column: slot.column, url: data?.signedUrl ?? null });
  }
  return out;
}

// Generates a one-shot upload URL the browser POSTs files to (the only thing a
// host ever receives from the server for their own folder in the bucket).
export async function createSignedUploadUrl(
  service: ServiceSupabase,
  userId: string,
  field: VerificationDocumentField,
  fileName: string,
  contentType: string
): Promise<{ ok: boolean; url?: string; path?: string; error?: string }> {
  if (!VERIFICATION_DOCUMENT_FIELDS.includes(field)) {
    return { ok: false, error: 'Invalid document field.' };
  }
  if (!/^[a-zA-Z0-9._-]{1,120}$/.test(fileName)) {
    return { ok: false, error: 'Invalid file name.' };
  }
  const objectPath = `${userId}/${field}${fileExtension(fileName)}`;
  const { data, error } = await service.storage.from(DOCUMENT_BUCKET).createSignedUploadUrl(objectPath, { upsert: true });
  if (error) {
    console.warn('[host-verification] signed upload failed', { userId, field, error: error.message });
    return { ok: false, error: 'Could not prepare an upload.' };
  }
  return { ok: true, url: data?.signedUrl, path: objectPath };
}

function fileExtension(fileName: string): string {
  const match = fileName.match(/\.([a-zA-Z0-9]+)$/);
  if (!match) return '';
  return `.${match[1].toLowerCase()}`;
}

// ---------------------------------------------------------------------------
// Submit / resubmit — host-facing. Writer is the authenticated host itself;
// RLS on the table already scopes every write to user_id = auth.uid(), and the
// DB trigger pages the status flow (hosts only ever go ->pending; staff move
// verified/rejected/resubmit_requested via set_host_verification_status).
// ---------------------------------------------------------------------------

export interface HostVerificationSubmitInput {
  userId: string;

  // Step 1: business.
  businessName: string;
  businessType: 'sole_proprietor' | 'registered_company' | 'partnership';
  cacNumber?: string | null;

  // Step 2: personal / identity.
  legalName: string;
  dob?: string | null;
  idType: 'national_id' | 'driver_license' | 'passport' | 'business_registration';
  idNumber: string;

  // Step 3: uploaded document refs (object paths returned by createSignedUploadUrl).
  idDocumentPath?: string | null;
  idSelfiePath?: string | null;
  businessDocumentPath?: string | null;

  // Step 4: bank.
  bankName: string;
  accountHolder: string;
  accountLast4: string;
}

// Hosts call this to (re)submit their KYC. The row is upserted (a host owns
// exactly one row); status is set to 'pending' only when coming from
// unverified/rejected/resubmit_requested — enforced by the DB trigger as well.
export async function submitHostVerification(
  service: ServiceSupabase,
  input: HostVerificationSubmitInput
): Promise<{ ok: boolean; row?: HostVerificationRow; error?: string }> {
  if (!input.businessName.trim()) return { ok: false, error: 'Add a business name.' };
  if (!input.legalName.trim()) return { ok: false, error: 'Add your legal name.' };
  if (!input.idNumber.trim()) return { ok: false, error: 'Add your ID number.' };
  if (!input.bankName.trim()) return { ok: false, error: 'Add a bank name.' };
  if (!input.accountHolder.trim()) return { ok: false, error: 'Add the account holder name.' };
  if (!/^[0-9]{4}$/.test(input.accountLast4)) return { ok: false, error: 'Account last 4 must be 4 digits.' };

  const now = new Date().toISOString();
  const existing = await getHostVerificationByUserId(service, input.userId);
  const status = 'pending';
  const resubmitted = Boolean(existing && existing.status !== 'pending');

  const payload: Database['public']['Tables']['host_verifications']['Insert'] = {
    user_id: input.userId,
    status,
    business_name: input.businessName.trim(),
    business_type: input.businessType,
    cac_number: input.cacNumber?.trim() || null,
    legal_name: input.legalName.trim(),
    dob: input.dob || null,
    id_type: input.idType,
    id_number: input.idNumber.trim(),
    id_document_url: input.idDocumentPath || null,
    id_selfie_url: input.idSelfiePath || null,
    business_document_url: input.businessDocumentPath || null,
    bank_name: input.bankName.trim(),
    account_holder: input.accountHolder.trim(),
    account_last4: input.accountLast4,
    ...(resubmitted ? { resubmitted_at: now } : {}),
  };

  const { error } = existing
    ? await service.from('host_verifications').update(payload).eq('user_id', input.userId)
    : await service.from('host_verifications').insert(payload);
  if (error) {
    console.warn('[host-verification] submit failed', { userId: input.userId, error: error.message });
    return { ok: false, error: 'Something went wrong while submitting your details.' };
  }

  const row = await getHostVerificationByUserId(service, input.userId);
  if (!row) return { ok: false, error: 'Your submission saved but could not be re-read.' };
  return { ok: true, row };
}
