import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

const CATEGORIES = ['general', 'payments', 'event', 'account', 'refund', 'technical'] as const;
type Category = (typeof CATEGORIES)[number];

// Public "Report an issue" endpoint. Guests can submit without an account, which
// the support_tickets RLS policy does not allow on its own, so this route uses
// the service client to record the ticket. When the reporter is signed in we
// attach their user id; otherwise their contact details are kept in the body so
// staff can still follow up.
export async function POST(request: Request) {
  try {
    const raw = (await request.json()) as Record<string, unknown>;
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    const email = typeof raw.email === 'string' ? raw.email.trim() : '';
    const reference = typeof raw.reference === 'string' ? raw.reference.trim() : '';
    const subject = typeof raw.subject === 'string' ? raw.subject.trim() : '';
    const message = typeof raw.message === 'string' ? raw.message.trim() : '';
    const category = typeof raw.category === 'string' ? (raw.category as Category) : 'event';

    if (!name) return NextResponse.json({ error: 'Please enter your name.' }, { status: 400 });
    if (name.length > 120) return NextResponse.json({ error: 'Name is too long.' }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }
    if (!subject) return NextResponse.json({ error: 'Please add a short subject.' }, { status: 400 });
    if (subject.length > 200) return NextResponse.json({ error: 'Subject is too long.' }, { status: 400 });
    if (!message) return NextResponse.json({ error: 'Please describe the issue.' }, { status: 400 });
    if (message.length > 5000) return NextResponse.json({ error: 'Message is too long.' }, { status: 400 });
    if (reference.length > 120) return NextResponse.json({ error: 'Reference is too long.' }, { status: 400 });
    if (!CATEGORIES.includes(category)) {
      return NextResponse.json({ error: 'Choose a valid category.' }, { status: 400 });
    }

    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const bodyLines = [
      `Reported by: ${name} <${email}>`,
      `Order reference: ${reference || '—'}`,
      '',
      message,
    ];

    const service = createServiceSupabase();
    const { data, error } = await service
      .from('support_tickets')
      .insert({
        author_id: user?.id ?? null,
        subject,
        body: bodyLines.join('\n'),
        category,
        priority: 'normal',
      })
      .select('id')
      .single();

    if (error) {
      return NextResponse.json({ error: 'Could not submit your report. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, ticketId: data.id });
  } catch {
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
