import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';

// Guest checkout promo validation: given a code, return its discount percent
// when the code is currently redeemable. Codes are validated AGAIN server-side
// in /api/paystack/initialize — this endpoint only lets the checkout UI show
// the discounted total before payment, so an invalid code never blocks the
// authoritative path. Scans are rate-limited per IP like ticket lookup.

const LIMIT = 20;
const WINDOW_MS = 60 * 60 * 1000;
const hits = new Map<string, number[]>();

function allow(clientIp: string): boolean {
  const now = Date.now();
  const list = (hits.get(clientIp) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= LIMIT) {
    hits.set(clientIp, list);
    return false;
  }
  list.push(now);
  hits.set(clientIp, list);
  return true;
}

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,23}$/;

export async function POST(request: Request) {
  try {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';
    if (!allow(ip)) {
      return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 });
    }

    const body = (await request.json()) as { code?: unknown };
    const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
    if (!CODE_PATTERN.test(code)) {
      return NextResponse.json({ error: 'That promo code is not valid.', valid: false });
    }

    const service = createServiceSupabase();
    const { data: promo } = await service
      .from('promos')
      .select('code, discount_percent, active, uses, max_uses, starts_at, ends_at')
      .eq('code', code)
      .maybeSingle();

    if (!promo) {
      return NextResponse.json({ error: 'That promo code is not valid.', valid: false });
    }
    if (!promo.active) {
      return NextResponse.json({ error: 'That promo code is paused right now.', valid: false });
    }
    const now = Date.now();
    if (promo.starts_at && new Date(promo.starts_at).getTime() > now) {
      return NextResponse.json({ error: 'That promo code has not started yet.', valid: false });
    }
    if (promo.ends_at && new Date(promo.ends_at).getTime() < now) {
      return NextResponse.json({ error: 'That promo code has expired.', valid: false });
    }
    if (promo.max_uses !== null && promo.uses >= promo.max_uses) {
      return NextResponse.json({ error: 'That promo code has reached its redemption limit.', valid: false });
    }

    return NextResponse.json({ valid: true, code: promo.code, discountPercent: promo.discount_percent });
  } catch {
    return NextResponse.json({ error: 'Promo code could not be checked right now.', valid: false }, { status: 500 });
  }
}