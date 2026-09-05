import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

// Hosts request verification by giving their business details. It flips the
// profile into 'pending' for an admin to manually review — deliberately no KYC
// uploads, just enough for a human to confirm the operator is real.
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { business_name?: unknown; website?: unknown };
    const businessName = typeof body.business_name === 'string' ? body.business_name.trim() : '';
    const website = typeof body.website === 'string' ? body.website.trim() : '';

    if (!businessName) {
      return NextResponse.json({ error: 'Add a business name so we know who operates your events.' }, { status: 400 });
    }
    if (businessName.length > 120) {
      return NextResponse.json({ error: 'Business name is too long.' }, { status: 400 });
    }
    if (website && !/^https?:\/\/./.test(website) && !website.includes('.')) {
      return NextResponse.json({ error: 'Enter a valid website or social link.' }, { status: 400 });
    }

    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

    const service = createServiceSupabase();
    const { data: profile } = await service
      .from('profiles')
      .select('account_status, host_verification_status')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile) return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });
    if (profile.account_status !== 'active') {
      return NextResponse.json({ error: 'Your account is not active. Contact support if this is a mistake.' }, { status: 403 });
    }
    if (profile.host_verification_status === 'verified') {
      return NextResponse.json({ error: 'Your host account is already verified.' }, { status: 400 });
    }
    if (profile.host_verification_status === 'pending') {
      return NextResponse.json({ error: 'Your verification is already under review.' }, { status: 400 });
    }

    const now = new Date().toISOString();
    await service
      .from('profiles')
      .update({
        host_verification_status: 'pending',
        host_verification_requested_at: now,
        host_verification_reviewed_at: null,
        host_verification_reviewed_by: null,
        host_verification_reason: null,
        business_name: businessName,
        website: website || null,
      })
      .eq('id', user.id);

    await service.rpc('write_audit_log', {
      p_action: 'host_verification_requested',
      p_target_type: 'profile',
      p_target_id: user.id,
      p_details: { business_name: businessName, website: website || null },
    } as never);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}