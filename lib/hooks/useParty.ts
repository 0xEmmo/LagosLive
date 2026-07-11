'use client';

import { useEffect, useState } from 'react';
import { fetchPartyById } from '@/lib/queries';
import { useLagosLiveStore } from '@/lib/store';
import type { Party } from '@/lib/types';

export function useParty(id: number) {
  const userLocation = useLagosLiveStore((s) => s.userLocation);
  const [party, setParty] = useState<Party | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPartyById(id, userLocation)
      .then((data) => {
        if (!cancelled) setParty(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, userLocation]);

  return { party, loading };
}
