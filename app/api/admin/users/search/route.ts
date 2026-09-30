import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    const supabase = createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });

    const email = new URL(request.url).searchParams.get('email')?.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, name, role')
      .ilike('email', email)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ error: 'No LagosLive account was found with that email.' }, { status: 404 });

    return NextResponse.json({ user: data });
  } catch {
    return NextResponse.json({ error: 'Could not search for that account.' }, { status: 500 });
  }
}
