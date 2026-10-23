import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import type { Tables } from '@/lib/supabase/database.types';
import type { AnalyticsSummary } from '@/lib/analytics';

export const dynamic = 'force-dynamic';

type AnalyticsRow = Pick<
  Tables<'analytics_events'>,
  'event_name' | 'path' | 'visitor_id' | 'session_id' | 'duration_ms' | 'created_at' | 'device_type' | 'audience'
>;

const PAGE_SIZE = 1000;
const ADMIN_ROLES = new Set(['admin', 'super_admin']);

function dateKey(value: string): string {
  return new Date(value).toISOString().slice(0, 10);
}

function labelForDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString('en-NG', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

async function loadEvents(service: ReturnType<typeof createServiceSupabase>, from: string | null): Promise<AnalyticsRow[]> {
  const events: AnalyticsRow[] = [];
  for (let offset = 0; offset < 50000; offset += PAGE_SIZE) {
    let query = service
      .from('analytics_events')
      .select('event_name, path, visitor_id, session_id, duration_ms, created_at, device_type, audience')
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (from) query = query.gte('created_at', from);
    const { data, error } = await query;
    if (error) throw error;
    const batch = (data ?? []) as AnalyticsRow[];
    events.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return events;
}

function emptyDaily(days: number): Array<{ label: string; pageViews: number; visitors: number }> {
  const count = days > 0 ? days : 30;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(today.getTime() - (count - index - 1) * 86400000);
    const key = day.toISOString().slice(0, 10);
    return { label: labelForDate(key), pageViews: 0, visitors: 0 };
  });
}

export async function GET(request: Request) {
  try {
    const auth = createServerSupabase();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

    // This dashboard is intentionally role-only: hosts, organizers, finance,
    // support, marketing and analyst roles must not see platform-wide traffic.
    const { data: profile, error: profileError } = await auth
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError || !profile || !ADMIN_ROLES.has(profile.role)) {
      return NextResponse.json({ error: 'Only admins can view platform analytics.' }, { status: 403 });
    }

    const rawDays = Number(new URL(request.url).searchParams.get('days') ?? 30);
    const days = [0, 7, 30, 90].includes(rawDays) ? rawDays : 30;
    const from = days > 0 ? new Date(Date.now() - days * 86400000).toISOString() : null;
    const events = await loadEvents(createServiceSupabase(), from);
    const pageViews = events.filter((event) => event.event_name === 'page_view');
    const sessions = new Set(pageViews.map((event) => event.session_id));
    const visitors = new Set(pageViews.map((event) => event.visitor_id));

    const sessionDurations = new Map<string, number>();
    for (const event of events) {
      if (event.event_name !== 'page_exit' || event.duration_ms <= 0) continue;
      sessionDurations.set(event.session_id, (sessionDurations.get(event.session_id) ?? 0) + event.duration_ms);
    }
    const durationValues = [...sessionDurations.values()];
    const totalTimeMs = durationValues.reduce((sum, value) => sum + value, 0);
    const averageSessionSeconds = durationValues.length > 0
      ? Math.round(totalTimeMs / durationValues.length / 1000)
      : 0;

    const pageCountBySession = new Map<string, number>();
    for (const event of pageViews) {
      pageCountBySession.set(event.session_id, (pageCountBySession.get(event.session_id) ?? 0) + 1);
    }
    const bouncedSessions = [...pageCountBySession.values()].filter((count) => count === 1).length;

    const daily = emptyDaily(days);
    const dailyByKey = new Map<string, { label: string; pageViews: number; visitors: number; visitorIds: Set<string> }>();
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const dailyCount = days > 0 ? days : 30;
    for (let index = 0; index < dailyCount; index += 1) {
      const day = new Date(today.getTime() - (dailyCount - index - 1) * 86400000);
      const key = day.toISOString().slice(0, 10);
      dailyByKey.set(key, { label: labelForDate(key), pageViews: 0, visitors: 0, visitorIds: new Set() });
    }
    for (const event of pageViews) {
      const bucket = dailyByKey.get(dateKey(event.created_at));
      if (!bucket) continue;
      bucket.pageViews += 1;
      bucket.visitorIds.add(event.visitor_id);
    }
    for (const bucket of dailyByKey.values()) {
      daily.find((item) => item.label === bucket.label)!.pageViews = bucket.pageViews;
      daily.find((item) => item.label === bucket.label)!.visitors = bucket.visitorIds.size;
    }

    const pageCounts = new Map<string, number>();
    for (const event of pageViews) pageCounts.set(event.path, (pageCounts.get(event.path) ?? 0) + 1);
    const deviceCounts = new Map<string, number>();
    for (const event of pageViews) {
      const label = event.device_type;
      deviceCounts.set(label, (deviceCounts.get(label) ?? 0) + 1);
    }
    const interactionCounts = new Map<string, number>();
    for (const event of events) {
      if (event.event_name === 'page_view' || event.event_name === 'page_exit' || event.event_name === 'session_started') continue;
      interactionCounts.set(event.event_name, (interactionCounts.get(event.event_name) ?? 0) + 1);
    }

    const summary: AnalyticsSummary = {
      rangeDays: days,
      from,
      to: new Date().toISOString(),
      pageViews: pageViews.length,
      uniqueVisitors: visitors.size,
      sessions: sessions.size,
      averageSessionSeconds,
      totalTimeSeconds: Math.round(totalTimeMs / 1000),
      bounceRate: sessions.size > 0 ? Number(((bouncedSessions / sessions.size) * 100).toFixed(1)) : 0,
      guestPageViews: pageViews.filter((event) => event.audience === 'guest').length,
      signedInPageViews: pageViews.filter((event) => event.audience === 'signed_in').length,
      funnel: {
        buyTicketClicks: events.filter((event) => event.event_name === 'buy_ticket_clicked').length,
        checkoutStarts: events.filter((event) => event.event_name === 'checkout_started').length,
        purchases: events.filter((event) => event.event_name === 'purchase_completed').length,
      },
      daily,
      topPages: [...pageCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([label, value]) => ({ label, value })),
      devices: [...deviceCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([label, value]) => ({ label, value })),
      interactions: [...interactionCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([label, value]) => ({ label, value })),
    };

    return NextResponse.json({ analytics: summary });
  } catch (error) {
    console.error('[admin analytics] failed:', error);
    return NextResponse.json({ error: 'Could not load web analytics.' }, { status: 500 });
  }
}
