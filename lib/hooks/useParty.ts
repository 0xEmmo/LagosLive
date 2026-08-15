'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchPartyById } from '@/lib/queries';
import { useLagosLiveStore } from '@/lib/store';
import type { Party } from '@/lib/types';

export function useParty(id: number) {
  const userLocation = useLagosLiveStore((s) => s.userLocation);
  const [party, setParty] = useState<Party | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchPartyById(id, userLocation)
      .then((data) => {
        if (!cancelled) setParty(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load this event.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, userLocation, attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  return { party, loading, error, retry };
}
