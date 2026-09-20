import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { getHostVerificationByUserId, documentSlots, signDocumentPreviewUrls } from '@/lib/host-verification';
import { isHostVerificationStatus } from '@/lib/host-verification-types';

// Host-facing read of the 5-step verification: the full host_verifications row
// plus profiles.host_verification_status (the column every other gate reads).
// Also returns short-lived signed URLs for any already-uploaded documents so
// the wizard can preview them on resubmission (private bucket, server-signed).
export async function GET() {
  try {
    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

    const service = createServiceSupabase();
    const row = await getHostVerificationByUserId(service, user.id).catch((err) => {
      console.warn('[host-verification] status read failed', { userId: user.id, error: err?.message ?? String(err) });
      return null;
    });

    const { data: profile } = await service
      .from('profiles')
      .select('host_verification_status')
      .eq('id', user.id)
      .maybeSingle();

    const rawStatus = typeof profile?.host_verification_status === 'string' ? profile.host_verification_status : 'unverified';
    const profileStatus = isHostVerificationStatus(rawStatus) ? rawStatus : 'unverified';

    const signed = row ? await signDocumentPreviewUrls(service, row.id, documentSlots(row)) : [];
    const previews: Record<string, string | null> = {};
    for (const slot of signed) previews[slot.column] = slot.url;

    return NextResponse.json({ ok: true, row, profileStatus, previews });
  } catch (err) {
    console.error('[host-verification] status error', err);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}