'use client';

import { useEffect, useState } from 'react';
import { fetchParties } from '@/lib/queries';
import type { Party } from '@/lib/types';

export function useParties() {
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchParties()
      .then((data) => {
        if (!cancelled) setParties(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { parties, loading };
}
