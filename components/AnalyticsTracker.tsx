'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useLagosLiveStore } from '@/lib/store';
import { normalizeAnalyticsPath, type AnalyticsAudience, type AnalyticsEventName } from '@/lib/analytics';

const VISITOR_KEY = 'lagos-live-analytics-visitor';
const SESSION_KEY = 'lagos-live-analytics-session';
const SESSION_TTL_MS = 30 * 60 * 1000;

type Identity = {
  visitorId: string;
  sessionId: string;
  newSession: boolean;
};

type TrackOptions = {
  path?: string;
  partyId?: number | null;
  durationMs?: number;
  audience?: AnalyticsAudience;
};

function randomId(prefix: string): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${random}`;
}

function validStoredId(value: string | null): string | null {
  return value && /^[a-z0-9_-]{16,96}$/i.test(value) ? value : null;
}

function getIdentity(): Identity {
  const now = Date.now();
  let visitorId: string | null = null;
  let storedSession: { id?: string; lastActivityAt?: number } | null = null;

  try {
    visitorId = validStoredId(window.localStorage.getItem(VISITOR_KEY));
    if (!visitorId) {
      visitorId = randomId('visitor');
      window.localStorage.setItem(VISITOR_KEY, visitorId);
    }
    const rawSession = window.localStorage.getItem(SESSION_KEY);
    if (rawSession) storedSession = JSON.parse(rawSession) as { id?: string; lastActivityAt?: number };
  } catch {
    // Private browsing or blocked storage: keep this visit in memory only.
  }

  const hasCurrentSession = Boolean(
    storedSession?.id &&
    validStoredId(storedSession.id) &&
    typeof storedSession.lastActivityAt === 'number' &&
    now - storedSession.lastActivityAt < SESSION_TTL_MS
  );
  const sessionId = hasCurrentSession ? storedSession!.id! : randomId('session');

  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify({ id: sessionId, lastActivityAt: now }));
  } catch {
    // The generated IDs still work for the current page when storage is unavailable.
  }

  return { visitorId: visitorId ?? randomId('visitor'), sessionId, newSession: !hasCurrentSession };
}

function deviceType(): 'mobile' | 'tablet' | 'desktop' | 'unknown' {
  if (typeof navigator === 'undefined') return 'unknown';
  const userAgent = navigator.userAgent.toLowerCase();
  if (/ipad|tablet|playbook|silk/.test(userAgent)) return 'tablet';
  if (/mobi|iphone|ipod|android/.test(userAgent)) return 'mobile';
  return 'desktop';
}

function referrerOrigin(): string | null {
  if (typeof document === 'undefined' || !document.referrer) return null;
  try {
    return new URL(document.referrer).origin.slice(0, 160);
  } catch {
    return null;
  }
}

function postEvent(eventName: AnalyticsEventName, options: TrackOptions = {}, identity?: Identity) {
  if (typeof window === 'undefined') return;
  const currentIdentity = identity ?? getIdentity();
  const payload = {
    visitorId: currentIdentity.visitorId,
    sessionId: currentIdentity.sessionId,
    eventName,
    path: normalizeAnalyticsPath(options.path ?? window.location.pathname),
    partyId: Number.isInteger(options.partyId) ? options.partyId : null,
    durationMs: Number.isFinite(options.durationMs) ? Math.max(0, Math.min(86400000, Math.round(options.durationMs!))) : 0,
    audience: options.audience ?? 'guest',
    deviceType: deviceType(),
    referrerOrigin: referrerOrigin(),
  };
  const body = JSON.stringify(payload);
  const blob = new Blob([body], { type: 'application/json' });

  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/analytics', blob);
      return;
    }
  } catch {
    // Fall through to keepalive fetch.
  }
  void fetch('/api/analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

export function trackAnalyticsEvent(eventName: AnalyticsEventName, options: TrackOptions = {}) {
  if (typeof window === 'undefined') return;
  const identity = getIdentity();
  if (identity.newSession && eventName !== 'session_started') {
    postEvent('session_started', options, identity);
  }
  postEvent(eventName, options, identity);
}

function shouldTrackPath(pathname: string): boolean {
  return !['/admin', '/host', '/profile', '/support/ticket'].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export default function AnalyticsTracker() {
  const pathname = usePathname() || '/';
  const audience: AnalyticsAudience = useLagosLiveStore((state) => state.user ? 'signed_in' : 'guest');
  const authLoading = useLagosLiveStore((state) => state.authLoading);
  const audienceRef = useRef<AnalyticsAudience>(audience);
  const activePageRef = useRef<{ path: string; startedAt: number } | null>(null);

  useEffect(() => {
    audienceRef.current = audience;
  }, [audience]);

  useEffect(() => {
    if (authLoading || !shouldTrackPath(pathname)) return;
    const path = normalizeAnalyticsPath(pathname);
    const previous = activePageRef.current;
    if (previous && previous.path !== path) {
      trackAnalyticsEvent('page_exit', {
        path: previous.path,
        durationMs: performance.now() - previous.startedAt,
        audience: audienceRef.current,
      });
    }
    trackAnalyticsEvent('page_view', { path, audience: audienceRef.current });
    activePageRef.current = { path, startedAt: performance.now() };
  }, [authLoading, pathname]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const element = target?.closest<HTMLElement>('[data-analytics-event]');
      if (!element) return;
      const eventName = element.dataset.analyticsEvent;
      if (!eventName) return;
      trackAnalyticsEvent(eventName as AnalyticsEventName, {
        partyId: element.dataset.analyticsPartyId ? Number(element.dataset.analyticsPartyId) : null,
        audience: audienceRef.current,
      });
    };
    document.addEventListener('click', handleClick, { capture: true });
    return () => document.removeEventListener('click', handleClick, { capture: true });
  }, []);

  useEffect(() => {
    const handlePageHide = () => {
      const active = activePageRef.current;
      if (!active) return;
      trackAnalyticsEvent('page_exit', {
        path: active.path,
        durationMs: performance.now() - active.startedAt,
        audience: audienceRef.current,
      });
      activePageRef.current = null;
    };
    window.addEventListener('pagehide', handlePageHide);
    return () => window.removeEventListener('pagehide', handlePageHide);
  }, []);

  return null;
}
