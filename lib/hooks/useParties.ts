'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchParties } from '@/lib/queries';
import { useLagosLiveStore } from '@/lib/store';
import type { Party } from '@/lib/types';

// Shared loader for the party list. Exposes `error` and `retry` so pages can
// surface a real error state (instead of silently rendering "0 events") when
// the Supabase fetch fails — e.g. a bad env URL or a network blip.
export function useParties() {
  const userLocation = useLagosLiveStore((s) => s.userLocation);
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchParties(userLocation)
      .then((data) => {
        if (!cancelled) setParties(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load events.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userLocation, attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  return { parties, loading, error, retry };
}
