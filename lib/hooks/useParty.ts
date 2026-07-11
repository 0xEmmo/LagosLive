'use client';

import { useEffect, useState } from 'react';
import { fetchPartyById } from '@/lib/queries';
import type { Party } from '@/lib/types';

export function useParty(id: number) {
  const [party, setParty] = useState<Party | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPartyById(id)
      .then((data) => {
        if (!cancelled) setParty(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return { party, loading };
}
