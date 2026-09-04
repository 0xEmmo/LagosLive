'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

// Adds live updates to an orders list. Because realtime payloads are raw rows
// (no joined event/ticket info) and our list views render joined data, we
// avoid brittle row-merging and instead re-run the fetcher after any change.
// The re-fetch is debounced so a burst of inserts coalesces into one query.
export function useRealtimeOrders<T>(fetcher: () => Promise<T[]>, opts?: { enabled?: boolean }) {
  const [data, setData] = useState<T[] | null>(null);  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastLiveAt, setLastLiveAt] = useState<Date | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const enabled = opts?.enabled !== false;

  const doFetch = useCallback(async () => {
    try {
      const result = await fetcherRef.current();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load orders.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    doFetch();
    const timer: { current: ReturnType<typeof setTimeout> | null } = { current: null };
    const channel = supabase
      .channel('orders-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          setLastLiveAt(new Date());
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            doFetch();
          }, 600);
        }
      )
      .subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [enabled, doFetch]);

  const refresh = useCallback(() => {
    setLoading(true);
    return doFetch();
  }, [doFetch]);

  return { data, setData, loading, error, lastLiveAt, refresh };
}
