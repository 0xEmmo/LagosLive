import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

// Notification preferences (Phase 5). GET returns the authenticated user's row
// or the defaults when none exists yet (the crons treat a missing row exactly
// like all-true, so nothing needs to exist upfront). PUT upserts the row back
// through the service client, keeping writes behind a shape-validating server
// route. RLS separately mirrors this: users can only read/touch their own row.

const DEFAULTS = {
  email_enabled: true,
  reminders_enabled: true,
  event_changes_enabled: true,
  saved_updates_enabled: true,
};

type PrefKey = keyof typeof DEFAULTS;

const TOGGLE_KEYS = Object.keys(DEFAULTS) as PrefKey[];

export async function GET() {
  try {
    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: row } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    return NextResponse.json({
      preferences: row
        ? {
            email_enabled: row.email_enabled,
            reminders_enabled: row.reminders_enabled,
            event_changes_enabled: row.event_changes_enabled,
            saved_updates_enabled: row.saved_updates_enabled,
          }
        : DEFAULTS,
    });
  } catch (err) {
    console.error('[notifications/preferences] GET failed', err);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const patch: Partial<typeof DEFAULTS> = {};
    for (const key of TOGGLE_KEYS) {
      if (typeof body[key] !== 'boolean') {
        return NextResponse.json({ error: `Invalid value for ${key}` }, { status: 400 });
      }
      patch[key] = body[key] as boolean;
    }

    const service = createServiceSupabase();
    const { error } = await service
      .from('notification_preferences')
      .upsert(
        {
          user_id: user.id,
          email_enabled: patch.email_enabled ?? true,
          reminders_enabled: patch.reminders_enabled ?? true,
          event_changes_enabled: patch.event_changes_enabled ?? true,
          saved_updates_enabled: patch.saved_updates_enabled ?? true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

    if (error) {
      console.error('[notifications/preferences] upsert failed', error);
      return NextResponse.json({ error: 'Could not save preferences' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[notifications/preferences] PUT failed', err);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}