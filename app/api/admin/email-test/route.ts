import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { sendProviderTestEmail } from '@/lib/resend';

export const dynamic = 'force-dynamic';

const ADMIN_ROLES = new Set(['admin', 'super_admin']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Admin-only diagnostic: sends one fixed test message through Resend first. */
export async function POST(request: Request) {
  try {
    const auth = createServerSupabase();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

    const { data: profile } = await auth
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (!profile || !ADMIN_ROLES.has(profile.role)) {
      return NextResponse.json({ error: 'Only admins can run the email provider test.' }, { status: 403 });
    }

    const body = await request.json() as { to?: unknown; simulateResendFailure?: unknown };
    const to = typeof body.to === 'string' ? body.to.trim().toLowerCase() : '';
    if (!EMAIL_RE.test(to) || to.length > 254) {
      return NextResponse.json({ error: 'Enter a valid test recipient email.' }, { status: 400 });
    }

    const simulateResendFailure = body.simulateResendFailure === true;
    const sent = await sendProviderTestEmail(to, { simulateResendFailure });
    return NextResponse.json(
      { ok: sent, simulatedResendFailure: simulateResendFailure, message: sent ? 'Test email accepted by the provider path.' : 'Both email providers failed.' },
      { status: sent ? 200 : 502 }
    );
  } catch (error) {
    console.error('[email-test] failed:', error);
    return NextResponse.json({ error: 'Email provider test failed.' }, { status: 500 });
  }
}
