'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchPartyById } from '@/lib/queries';
import { useLagosLiveStore } from '@/lib/store';
import type { Party } from '@/lib/types';

export function useParty(id: number, seed?: Party) {
  const userLocation = useLagosLiveStore((s) => s.userLocation);
  const [party, setParty] = useState<Party | undefined>(seed);
  const [loading, setLoading] = useState(seed ? false : true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const mountedRef = useRef(false);
  const partyRef = useRef<Party | undefined>(seed);

  useEffect(() => {
    partyRef.current = party;
  }, [party]);

  useEffect(() => {
    const firstRun = !mountedRef.current;
    mountedRef.current = true;
    let cancelled = false;

    // Server-seeded events render instantly; the client refresh (which pins
    // distance to the viewer's real location) runs in the background so the
    // page never flashes a skeleton when the canonical <PartyDetailClient> is
    // already showing data. Without a seed the first load still spins.
    if (!firstRun) setLoading(true);
    fetchPartyById(id, userLocation)
      .then((data) => {
        if (!cancelled) {
          setParty(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        if (partyRef.current) {
          // Keep the seeded/server copy; fail silently on a background refresh.
          setError(null);
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load this event.');
        }
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