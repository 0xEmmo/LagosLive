import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';
import { isAnalyticsEventName, normalizeAnalyticsPath, type AnalyticsAudience, type AnalyticsDevice } from '@/lib/analytics';

export const dynamic = 'force-dynamic';

const ID_RE = /^[a-z0-9_-]{16,96}$/i;
const DEVICE_TYPES = new Set<AnalyticsDevice>(['mobile', 'tablet', 'desktop', 'unknown']);
const AUDIENCES = new Set<AnalyticsAudience>(['guest', 'signed_in']);

function validId(value: unknown): value is string {
  return typeof value === 'string' && ID_RE.test(value);
}

function validPartyId(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 2147483647 ? value : null;
}

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (contentLength > 10000) return new NextResponse(null, { status: 413 });

    const body = await request.json() as Record<string, unknown>;
    const visitorId = body.visitorId;
    const sessionId = body.sessionId;
    const eventName = body.eventName;
    const path = normalizeAnalyticsPath(body.path);
    const durationMs = typeof body.durationMs === 'number' && Number.isFinite(body.durationMs)
      ? Math.max(0, Math.min(86400000, Math.round(body.durationMs)))
      : 0;
    const deviceType = DEVICE_TYPES.has(body.deviceType as AnalyticsDevice) ? body.deviceType as AnalyticsDevice : 'unknown';
    const audience = AUDIENCES.has(body.audience as AnalyticsAudience) ? body.audience as AnalyticsAudience : 'guest';
    const referrerOrigin = typeof body.referrerOrigin === 'string' && /^https?:\/\//i.test(body.referrerOrigin)
      ? body.referrerOrigin.slice(0, 160)
      : null;

    if (!validId(visitorId) || !validId(sessionId) || !isAnalyticsEventName(eventName)) {
      return new NextResponse(null, { status: 204 });
    }

    const service = createServiceSupabase();
    const { error } = await service.from('analytics_events').insert({
      visitor_id: visitorId,
      session_id: sessionId,
      event_name: eventName,
      path,
      party_id: validPartyId(body.partyId),
      duration_ms: durationMs,
      device_type: deviceType,
      audience,
      referrer_origin: referrerOrigin,
    });

    if (error) {
      console.warn('[analytics] event not recorded:', error.message);
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    // Analytics must never make the public website fail when the optional
    // table or service key has not been deployed yet.
    console.warn('[analytics] ingestion skipped:', error instanceof Error ? error.message : error);
    return new NextResponse(null, { status: 204 });
  }
}
