'use client';

import { useCallback, useEffect, useState } from 'react';
import type { HostVerificationRow } from '@/lib/host-verification';
import { isHostVerificationStatus, type HostVerificationStatus } from '@/lib/host-verification-types';

export interface HostVerificationStatusResponse {
  row: HostVerificationRow | null;
  profileStatus: HostVerificationStatus;
  previews: Record<string, string | null>;
}

/**
 * Host-facing KYC read-model hook. Loads the host's verification row plus
 * profiles.host_verification_status from GET /api/host/verification/status, so
 * the UI always renders against the same server contract the review queue uses.
 */
export function useHostVerification() {
  const [row, setRow] = useState<HostVerificationRow | null>(null);
  const [status, setStatus] = useState<HostVerificationStatus>('unverified');
  const [previews, setPreviews] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/host/verification/status', { cache: 'no-store' });
      const json = (await res.json().catch(() => null)) as (HostVerificationStatusResponse & { error?: string }) | null;
      if (!res.ok) throw new Error(json?.error ?? 'Could not load your verification status.');
      setRow(json?.row ?? null);
      setStatus(isHostVerificationStatus(json?.profileStatus ?? '') ? json!.profileStatus : 'unverified');
      setPreviews(json?.previews ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { row, status, loading, error, refresh, previews };
}