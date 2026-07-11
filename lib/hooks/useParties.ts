'use client';

import { useEffect, useState } from 'react';
import { fetchParties } from '@/lib/queries';
import { useLagosLiveStore } from '@/lib/store';
import type { Party } from '@/lib/types';

export function useParties() {
  const userLocation = useLagosLiveStore((s) => s.userLocation);
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchParties(userLocation)
      .then((data) => {
        if (!cancelled) setParties(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userLocation]);

  return { parties, loading };
}
