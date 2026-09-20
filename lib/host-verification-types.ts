// Client-safe shared types for the real Host Verification KYC flow (Batch 32).
// This file is deliberately UI-safe: it must never pull in 'server-only' or the
// service client, because host verification pages on BOTH sides of the fence
// (host wizard + admin review) import these labels, color maps and type guards.
//
// The single source of truth for a row's lifecycle value is the DB CHECK on
// public.host_verifications.status; these mirrors must stay exactly in step.
// There are exactly five values a row can ever hold — everything else in the
// app (profiles.host_verification_status, badge gates, payout gating, the
// host_verified flag, event moderation) is derived and kept in sync by the
// trigger created in migration 00032.

export type HostVerificationStatus =
  | 'unverified'
  | 'pending'
  | 'verified'
  | 'rejected'
  | 'resubmit_requested';

export const HOST_VERIFICATION_STATUSES: readonly HostVerificationStatus[] = [
  'unverified',
  'pending',
  'verified',
  'rejected',
  'resubmit_requested',
];

export function isHostVerificationStatus(value: string): value is HostVerificationStatus {
  return (HOST_VERIFICATION_STATUSES as readonly string[]).includes(value);
}

export const HOST_VERIFICATION_STATUS_LABEL: Record<HostVerificationStatus, string> = {
  unverified: 'Not submitted',
  pending: 'Pending review',
  verified: 'Verified',
  rejected: 'Rejected',
  resubmit_requested: 'Resubmission requested',
};

// Badge/marker styling used by both the host wizard and the admin review queue.
export const HOST_VERIFICATION_STATUS_COLOR: Record<
  HostVerificationStatus,
  { bg: string; color: string; border: string }
> = {
  unverified: { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' },
  pending: { bg: '#fef3c7', color: '#92400e', border: '#f59e0b' },
  verified: { bg: '#dcfce7', color: '#166534', border: '#22c55e' },
  rejected: { bg: '#fee2e2', color: '#991b1b', border: '#ef4444' },
  resubmit_requested: { bg: '#e0e7ff', color: '#3730a3', border: '#6366f1' },
};

// Distribution targets a host must hit before they can request a payout. These
// read as "verified AND banking details complete"; see lib/host-verification.ts
// for the role-gating rules that must accompany it.
export const HOST_VERIFICATION_PAYOUT_GATE: Record<
  'ok' | 'pending' | 'missing',
  string
> = {
  ok: 'Payouts are enabled for this account.',
  pending: 'Payouts unlock once this verification is approved.',
  missing: 'Add banking details to request payouts.',
};

// Step 1 — Host Information. Business type is deliberately just Individual |
// Company (no CAC requirement for a company host) and the years-in-business
// options mirror the simple bands the quote "1-2 years / 2-5 years / 5+ years."
export const HOST_BUSINESS_TYPES = ['individual', 'company'] as const;
export type HostBusinessType = (typeof HOST_BUSINESS_TYPES)[number];

export const HOST_BUSINESS_TYPE_LABEL: Record<HostBusinessType, string> = {
  individual: 'Individual',
  company: 'Company',
};

export const HOST_YEARS_IN_BUSINESS = ['1-2 years', '2-5 years', '5+ years'] as const;
export type HostYearsInBusiness = (typeof HOST_YEARS_IN_BUSINESS)[number];

export function isHostYearsInBusiness(value: string): value is HostYearsInBusiness {
  return (HOST_YEARS_IN_BUSINESS as readonly string[]).includes(value);
}
