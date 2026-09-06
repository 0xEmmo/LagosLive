'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronUp, ChevronDown, X, RefreshCw, Sparkles } from 'lucide-react';
import AdminShell from '@/components/admin-shell';
import { PageHeader, LoadingBlock, ErrorBlock, usePermissionGuard } from '@/components/ui/dashboard-ui';
import { fetchTrendingCatalogue, saveTrendingSelection, fetchAdminEvents, type TrendingAdminJoined } from '@/lib/admin-queries';
import { useLagosLiveStore } from '@/lib/store';

const MAX_TRENDING = 6;

interface Selection {
  eventId: number;
  position: number;
  title: string;
  date: string;
  location: string;
}

export default function AdminTrendingPage() {
  const { ready } = usePermissionGuard('events.edit');
  const showToast = useLagosLiveStore((s) => s.showToast);
  const [catalogue, setCatalogue] = useState<TrendingAdminJoined[]>([]);
  const [catalogueStatus, setCatalogueStatus] = useState<'loading' | 'error' | 'ok'>('loading');
  const [catalogueAttempt, setCatalogueAttempt] = useState(0);
  const [candidates, setCandidates] = useState<{ id: number; title: string; date: string; location: string }[]>([]);
  const [candidatesStatus, setCandidatesStatus] = useState<'loading' | 'error' | 'ok'>('loading');
  const [candidatesAttempt, setCandidatesAttempt] = useState(0);
  const [query, setQuery] = useState('');

  // The editor's working list, ordered by position. Persisted on demand.
  const [selection, setSelection] = useState<Selection[]>([]);

  const loadCatalogue = async () => {
    setCatalogueStatus('loading');
    try {
      const data = await fetchTrendingCatalogue();
      setCatalogue(data);
      setCatalogueStatus('ok');
      setSelection(
        data
          .filter((c) => c.parties)
          .map((c) => ({
            eventId: c.event_id,
            position: c.position,
            title: c.parties?.title ?? '',
            date: c.parties?.date ?? '',
            location: c.parties?.location ?? '',
          }))
          .sort((a, b) => a.position - b.position)
      );
    } catch {
      setCatalogueStatus('error');
    }
  };

  useEffect(() => {
    if (!ready) return;
    loadCatalogue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, catalogueAttempt]);

  useEffect(() => {
    if (!ready) return;
    setCandidatesStatus('loading');
    fetchAdminEvents({ status: 'approved' })
      .then((rows) => {
        const now = Date.now();
        setCandidates(
          rows
            .filter((r) => r.starts_at && new Date(r.starts_at).getTime() >= now && r.status === 'approved')
            .map((r) => ({ id: r.id, title: r.title, date: r.date, location: r.location }))
        );
        setCandidatesStatus('ok');
      })
      .catch(() => setCandidatesStatus('error'));
  }, [ready, candidatesAttempt]);

  const inSelection = useMemo(() => new Set(selection.map((s) => s.eventId)), [selection]);

  const eligible = useMemo(() => {
    if (!query.trim()) return candidates;
    const q = query.toLowerCase();
    return candidates.filter((c) => c.title.toLowerCase().includes(q) || c.location.toLowerCase().includes(q));
  }, [candidates, query]);

  if (!ready) return null;

  const addEvent = (c: { id: number; title: string; date: string; location: string }) => {
    if (selection.length >= MAX_TRENDING) {
      showToast('Limit reached', `You can curate up to ${MAX_TRENDING} trending events. Remove one first.`);
      return;
    }
    showToast('Added', `“${c.title}” added to Trending.`);
    setSelection((s) => [...s, { eventId: c.id, position: s.length + 1, title: c.title, date: c.date, location: c.location }]);
  };

  const removeEvent = (eventId: number) => {
    setSelection((s) => s.filter((e) => e.eventId !== eventId).map((e, i) => ({ ...e, position: i + 1 })));
  };

  const move = (index: number, dir: -1 | 1) => {
    setSelection((s) => {
      const next = [...s];
      const target = index + dir;
      if (target < 0 || target >= next.length) return s;
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((e, i) => ({ ...e, position: i + 1 }));
    });
  };

  const save = async () => {
    try {
      await saveTrendingSelection(selection.map(({ eventId, position }) => ({ eventId, position })));
      showToast('Saved', `Trending updated with ${selection.length} event${selection.length === 1 ? '' : 's'}.`);
      await loadCatalogue();
    } catch (e) {
      showToast('Error', e instanceof Error ? e.message : 'Could not save the Trending list.');
    }
  };

  return (
    <AdminShell>
      <PageHeader
        title="Trending on Homepage"
        subtitle={`Hand-pick up to ${MAX_TRENDING} upcoming events that lead the homepage “Trending now” section. Only approved, upcoming events you select are shown — events that go past, are suspended or deleted automatically drop off.`}
      />

      {/* Working list */}
      <div className="mb-5 rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="mb-3 flex items-center justify-between">
          <div className="font-heading text-[13px] font-bold uppercase tracking-[1px]" style={{ color: '#FFFFFF' }}>
            Curated selection
          </div>
          <div
            className="rounded-full px-2.5 py-1 text-[11px] font-bold"
            style={{ background: 'rgba(255,45,149,0.12)', border: '1px solid rgba(255,45,149,0.3)', color: '#FF2D95' }}
          >
            {selection.length} / {MAX_TRENDING}
          </div>
        </div>

        {catalogueStatus === 'loading' && <LoadingBlock />}
        {catalogueStatus === 'error' && <ErrorBlock onRetry={() => setCatalogueAttempt((a) => a + 1)} />}
        {catalogueStatus === 'ok' && selection.length === 0 && (
          <div className="rounded-2xl px-5 py-10 text-center text-sm" style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)', color: '#A7A8B5' }}>
            No events on Trending yet. Add up to {MAX_TRENDING} from the picker below, then hit Save.
          </div>
        )}

        {selection.length > 0 && (
          <div className="flex flex-col gap-2">
            {selection.map((s, i) => (
              <div
                key={s.eventId}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <div
                  className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                  style={{ background: 'rgba(255,45,149,0.14)', color: '#FF2D95' }}
                >
                  {s.position}
                </div>
                <div className="min-w-0 flex-1">
                  <Link href={`/party/${s.eventId}`} className="block truncate text-[13px] font-semibold hover:underline" style={{ color: '#FFFFFF' }}>
                    {s.title}
                  </Link>
                  <div className="truncate text-[11px]" style={{ color: '#6B6C80' }}>{s.date} · {s.location}</div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1">
                  <button
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    className="flex h-7 w-7 items-center justify-center rounded-[8px] disabled:opacity-30"
                    style={{ background: 'rgba(255,255,255,0.05)', color: '#A7A8B5' }}
                  >
                    <ChevronUp size={14} strokeWidth={2.2} />
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={i === selection.length - 1}
                    className="flex h-7 w-7 items-center justify-center rounded-[8px] disabled:opacity-30"
                    style={{ background: 'rgba(255,255,255,0.05)', color: '#A7A8B5' }}
                  >
                    <ChevronDown size={14} strokeWidth={2.2} />
                  </button>
                  <button
                    onClick={() => removeEvent(s.eventId)}
                    className="flex h-7 w-7 items-center justify-center rounded-[8px]"
                    style={{ background: 'rgba(255,90,46,0.08)', color: '#FF5A2E' }}
                  >
                    <X size={14} strokeWidth={2.2} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {selection.length > 0 && (
          <div className="mt-4 flex justify-end">
            <button
              onClick={save}
              className="flex items-center gap-1.5 rounded-[10px] px-5 py-2.5 text-[12.5px] font-bold text-white"
              style={{ background: 'linear-gradient(135deg,#FF2D95,#8A2BE2)' }}
            >
              <RefreshCw size={13} strokeWidth={2.5} />
              Save selection
            </button>
          </div>
        )}
      </div>

      {/* Picker */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <Sparkles size={15} strokeWidth={2} style={{ color: '#FF2D95' }} />
          <div className="font-heading text-[13px] font-bold uppercase tracking-[1px]" style={{ color: '#FFFFFF' }}>
            Add events
          </div>
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search approved, upcoming events to feature…"
          className="mb-3 w-full rounded-[10px] px-3.5 py-2.5 text-[13px] outline-none"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFFFFF' }}
        />

        {candidatesStatus === 'loading' && <LoadingBlock />}
        {candidatesStatus === 'error' && <ErrorBlock onRetry={() => setCandidatesAttempt((a) => a + 1)} />}
        {candidatesStatus === 'ok' && eligible.length === 0 && (
          <div className="rounded-2xl px-5 py-10 text-sm" style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)', color: '#A7A8B5' }}>
            No matching upcoming, approved events found.
          </div>
        )}
        {candidatesStatus === 'ok' && (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {eligible.map((c) => {
              const chosen = inSelection.has(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => !chosen && addEvent(c)}
                  disabled={chosen}
                  className="flex items-center justify-between gap-2 rounded-xl px-3.5 py-3 text-left transition-all duration-150"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: chosen ? '1px solid rgba(62,207,142,0.4)' : '1px solid rgba(255,255,255,0.08)',
                    opacity: chosen ? 0.6 : 1,
                    cursor: chosen ? 'default' : 'pointer',
                  }}
                >
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-semibold" style={{ color: '#FFFFFF' }}>{c.title}</div>
                    <div className="truncate text-[11px]" style={{ color: '#6B6C80' }}>{c.date} · {c.location}</div>
                  </div>
                  {chosen ? (
                    <span className="flex-shrink-0 text-[10px] font-bold uppercase tracking-[0.5px]" style={{ color: '#3ECF8E' }}>
                      Added
                    </span>
                  ) : (
                    <span className="flex-shrink-0 text-[20px] leading-none" style={{ color: '#FF2D95' }}>+</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <p className="mt-5 text-[12px]" style={{ color: '#6B6C80' }}>
        Only published, upcoming, non-cancelled events ever appear on the homepage, even if selected. No placeholders are shown on the live site.
      </p>
    </AdminShell>
  );
}
