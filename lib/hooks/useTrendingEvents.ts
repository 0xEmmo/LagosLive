'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchTrendingParties, type TrendingEventEntry } from '@/lib/queries';
import { useLagosLiveStore } from '@/lib/store';

// Lightweight homepage loader for the admin-curated "Trending now" strip.
// Unlike useParties it never pulls the whole inventory client-side — it asks
// only for the ≤6 curated events, ordered by their curated position. Absent
// rows (missing migration) or a transient error resolve to an empty list;
// the trending section then renders its discovery CTA instead of breaking.
export function useTrendingEvents() {
  const userLocation = useLagosLiveStore((s) => s.userLocation);
  const [entries, setEntries] = useState<TrendingEventEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchTrendingParties(userLocation)
      .then((data) => {
        if (!cancelled) setEntries(data);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userLocation, attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  return { entries, loading, retry };
}
