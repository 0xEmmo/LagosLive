import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import {
  getHostVerificationByUserId,
  hostCanResubmit,
  submitHostVerification,
  type HostVerificationSubmitInput,
} from '@/lib/host-verification';
import { claimNotification, recordNotificationOutcome } from '@/lib/notify';
import type { ServiceSupabase } from '@/lib/supabase/server';

const BUSINESS_TYPES = ['sole_proprietor', 'registered_company', 'partnership'] as const;
const ID_TYPES = ['national_id', 'driver_license', 'passport', 'business_registration'] as const;

function parseInput(
  body: Record<string, unknown>
): { ok: true; input: Omit<HostVerificationSubmitInput, 'userId'> } | { ok: false; error: string } {
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const maybeStr = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);

  const businessType = str(body.businessType) as HostVerificationSubmitInput['businessType'];
  const idType = str(body.idType) as HostVerificationSubmitInput['idType'];

  if (!BUSINESS_TYPES.includes(businessType)) return { ok: false, error: 'Invalid business type.' };
  if (!ID_TYPES.includes(idType)) return { ok: false, error: 'Invalid ID type.' };
  if (!str(body.businessName).trim()) return { ok: false, error: 'Add a business name.' };
  if (!str(body.legalName).trim()) return { ok: false, error: 'Add your legal name.' };
  if (!str(body.idNumber).trim()) return { ok: false, error: 'Add your ID number.' };
  if (!str(body.bankName).trim()) return { ok: false, error: 'Add a bank name.' };
  if (!str(body.accountHolder).trim()) return { ok: false, error: 'Add the account holder name.' };
  if (!/^[0-9]{4}$/.test(str(body.accountLast4))) return { ok: false, error: 'Account last 4 must be 4 digits.' };

  return {
    ok: true,
    input: {
      businessName: str(body.businessName),
      businessType,
      cacNumber: maybeStr(body.cacNumber),
      legalName: str(body.legalName),
      dob: maybeStr(body.dob),
      idType,
      idNumber: str(body.idNumber),
      idDocumentPath: maybeStr(body.idDocumentPath),
      idSelfiePath: maybeStr(body.idSelfiePath),
      businessDocumentPath: maybeStr(body.businessDocumentPath),
      bankName: str(body.bankName),
      accountHolder: str(body.accountHolder),
      accountLast4: str(body.accountLast4),
    },
  };
}

function bestEffortNotify(service: ServiceSupabase, userId: string, email: string, refId: string) {
  void (async () => {
    try {
      const claimed = await claimNotification(service, {
        userId,
        email: email || `host:${userId}`,
        type: 'host_verification_submitted',
        refId,
      });
      if (claimed) {
        await recordNotificationOutcome(service, {
          email: email || `host:${userId}`,
          type: 'host_verification_submitted',
          refId,
          status: 'failed',
        });
      }
    } catch (err) {
      console.warn('[host-verification] resubmit notify failed', { userId, error: err instanceof Error ? err.message : String(err) });
    }
  })();
}

// Resubmit path for a rejected / resubmit_requested host. Same payload as the
// submit route, but gated on hostCanResubmit and requires an existing row, so
// the host can fix the review notes and push it back into review.
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });

    const parsed = parseInput(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

    const service: ServiceSupabase = createServiceSupabase();
    const existing = await getHostVerificationByUserId(service, user.id);
    if (!existing) return NextResponse.json({ error: 'No verification on file to resubmit.' }, { status: 400 });

    const gate = await hostCanResubmit(service, user.id, existing, false);
    if (!gate.ok) {
      if (gate.reason === 'already_verified') return NextResponse.json({ error: 'Your host account is already verified.' }, { status: 400 });
      if (gate.reason === 'already_pending') return NextResponse.json({ error: 'Your verification is already under review.' }, { status: 400 });
      return NextResponse.json({ error: 'You cannot resubmit right now.' }, { status: 400 });
    }

    const result = await submitHostVerification(service, { ...parsed.input, userId: user.id });
    if (!result.ok || !result.row) {
      return NextResponse.json({ error: result.error ?? 'Something went wrong while resubmitting your details.' }, { status: 400 });
    }

    try {
      const { error: profileError } = await service
        .from('profiles')
        .update({ host_verification_status: 'pending' })
        .eq('id', user.id);
      if (profileError) {
        console.warn('[host-verification] resubmit profile sync failed', { userId: user.id, error: profileError.message });
      }
    } catch (err) {
      console.warn('[host-verification] resubmit profile sync failed', { userId: user.id, error: err instanceof Error ? err.message : String(err) });
    }

    const { data: profile } = await service.from('profiles').select('email').eq('id', user.id).maybeSingle();
    bestEffortNotify(service, user.id, typeof profile?.email === 'string' ? profile.email : '', `submitted:${result.row.submittedAt}`);

    return NextResponse.json({ ok: true, row: result.row });
  } catch (err) {
    console.error('[host-verification] resubmit error', err);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}