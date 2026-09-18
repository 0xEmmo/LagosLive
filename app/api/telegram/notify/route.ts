import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { sendEventTelegramNotification } from '@/lib/telegram';
import type { TelegramEventType } from '@/lib/telegram-client';

const VALID_TYPES: TelegramEventType[] = ['event_created', 'event_approved', 'event_published'];

// Fires the Telegram ops notification for an event lifecycle transition. Only
// ever called AFTER the underlying status change has succeeded in the database
// (host submit / admin approve); the server re-reads the event, verifies it is
// actually in the reported state, and claims the transition against
// notification_sends so exactly one message is ever posted per transition.
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { event_id?: unknown; type?: unknown };
    const eventId = Number(body.event_id);
    const type = typeof body.type === 'string' ? body.type : '';

    if (!Number.isFinite(eventId) || eventId <= 0) {
      return NextResponse.json({ error: 'Invalid event.' }, { status: 400 });
    }
    if (!VALID_TYPES.includes(type as TelegramEventType)) {
      return NextResponse.json({ error: 'Invalid notification type.' }, { status: 400 });
    }

    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

    const result = await sendEventTelegramNotification(eventId, type as TelegramEventType, user.id);
    return NextResponse.json({ ok: result.sent, reason: result.reason ?? null });
  } catch (err) {
    console.error('[telegram:notify] notification error', err);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}