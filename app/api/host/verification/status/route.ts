import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { getHostVerificationByUserId, documentSlots, signDocumentPreviewUrls } from '@/lib/host-verification';
import { isHostVerificationStatus } from '@/lib/host-verification-types';

// Host-facing read of the 3-step verification: the full host_verifications row
// plus profiles.host_verification_status (the column every other gate reads).
// Also returns short-lived signed URLs for any already-uploaded documents so
// the wizard can preview them on resubmission (private bucket, server-signed).
export async function GET() {
  try {
    // TEMPORARY DEBUG — remove after debugging (batch: host verification failure).
    console.error('[HOST VERIFICATION DEBUG]', { step: 'request_received' });
    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
    console.error('[HOST VERIFICATION DEBUG]', { step: 'authenticated_user', userId: user.id });

    const service = createServiceSupabase();
    console.error('[HOST VERIFICATION DEBUG]', { step: 'service_client_created' });
    const row = await getHostVerificationByUserId(service, user.id).catch((err) => {
      console.warn('[host-verification] status read failed', { userId: user.id, error: err?.message ?? String(err) });
      return null;
    });
    console.error('[HOST VERIFICATION DEBUG]', { step: 'verification_query', userId: user.id, rowFound: Boolean(row) });

    const { data: profile, error: profileError } = await service
      .from('profiles')
      .select('host_verification_status')
      .eq('id', user.id)
      .maybeSingle();
    console.error('[HOST VERIFICATION DEBUG]', {
      step: 'profile_query',
      userId: user.id,
      profileError: profileError?.message,
      profileErrorCode: profileError?.code,
      profileErrorDetails: profileError?.details,
      profileErrorHint: profileError?.hint,
    });

    const rawStatus = typeof profile?.host_verification_status === 'string' ? profile.host_verification_status : 'unverified';
    const profileStatus = isHostVerificationStatus(rawStatus) ? rawStatus : 'unverified';
    console.error('[HOST VERIFICATION DEBUG]', { step: 'data_transformed', userId: user.id, profileStatus });

    const signed = row ? await signDocumentPreviewUrls(service, row.id, documentSlots(row)) : [];
    const previews: Record<string, string | null> = {};
    for (const slot of signed) previews[slot.column] = slot.url;

    console.error('[HOST VERIFICATION DEBUG]', { step: 'response_returned', userId: user.id, signedPreviews: signed.length });
    return NextResponse.json({ ok: true, row, profileStatus, previews });
  } catch (err) {
    // TEMPORARY DEBUG — remove after debugging (batch: host verification failure).
    const e = err as { message?: string; code?: string; details?: string; hint?: string } | null;
    console.error('[HOST VERIFICATION DEBUG]', {
      step: 'handler_caught_error',
      error: e?.message ?? String(err),
      code: e?.code,
      details: e?.details,
      hint: e?.hint,
    });
    console.error('[host-verification] status error', err);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}