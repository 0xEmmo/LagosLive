import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import {
  getHostVerificationByUserId,
  hostCanResubmit,
  submitHostVerification,
  type HostVerificationSubmitInput,
} from '@/lib/host-verification';
import { claimNotification, recordNotificationOutcome } from '@/lib/notify';
import { HOST_BUSINESS_TYPES, isHostYearsInBusiness } from '@/lib/host-verification-types';
import { sendHostVerificationTelegramNotification } from '@/lib/telegram';
import type { ServiceSupabase } from '@/lib/supabase/server';

function parseInput(
  body: Record<string, unknown>
): { ok: true; input: Omit<HostVerificationSubmitInput, 'userId'> } | { ok: false; error: string } {
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const maybeStr = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);

  const businessType = str(body.businessType) as HostVerificationSubmitInput['businessType'];
  const yearsInBusiness = str(body.yearsInBusiness) as HostVerificationSubmitInput['yearsInBusiness'];

  if (!(HOST_BUSINESS_TYPES as readonly string[]).includes(businessType)) return { ok: false, error: 'Invalid business type.' };
  if (!isHostYearsInBusiness(yearsInBusiness)) return { ok: false, error: 'Invalid years-in-business option.' };
  if (!str(body.businessName).trim()) return { ok: false, error: 'Add a business name.' };
  if (!str(body.address).trim()) return { ok: false, error: 'Add your address.' };
  if (!str(body.legalName).trim()) return { ok: false, error: 'Add your legal name.' };
  if (!/^[0-9]{11}$/.test(str(body.nin).trim())) return { ok: false, error: 'NIN must be an 11-digit number.' };
  if (!str(body.bankName).trim()) return { ok: false, error: 'Add a bank name.' };
  if (!str(body.accountHolder).trim()) return { ok: false, error: 'Add the account holder name.' };
  if (!/^[0-9]{10}$/.test(str(body.accountNumber).trim())) return { ok: false, error: 'Enter the full 10-digit account number.' };

  return {
    ok: true,
    input: {
      businessName: str(body.businessName),
      businessType,
      yearsInBusiness,
      websiteSocial: maybeStr(body.websiteSocial),
      address: str(body.address),
      legalName: str(body.legalName),
      nin: str(body.nin),
      idDocumentPath: maybeStr(body.idDocumentPath),
      bankName: str(body.bankName),
      accountHolder: str(body.accountHolder),
      accountNumber: str(body.accountNumber),
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
      console.warn('[host-verification] submit notify failed', { userId, error: err instanceof Error ? err.message : String(err) });
    }
  })();
}

// Host (re)submits their 3-step KYC. Writes through the server lib (which
// enforces the flow: hosts may only land on 'pending'), keeps the legacy
// profiles status in sync, and best-effort claims the submission in the send
// log so the ops team sees it exactly once (Telegram + email digest).
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
    const gate = await hostCanResubmit(service, user.id, existing, false);
    if (!gate.ok) {
      if (gate.reason === 'already_verified') return NextResponse.json({ error: 'Your host account is already verified.' }, { status: 400 });
      if (gate.reason === 'already_pending') return NextResponse.json({ error: 'Your verification is already under review.' }, { status: 400 });
      return NextResponse.json({ error: 'You cannot submit right now.' }, { status: 400 });
    }

    const result = await submitHostVerification(service, { ...parsed.input, userId: user.id });
    if (!result.ok || !result.row) {
      return NextResponse.json({ error: result.error ?? 'Something went wrong while submitting your details.' }, { status: 400 });
    }

    try {
      const { error: profileError } = await service
        .from('profiles')
        .update({ host_verification_status: 'pending' })
        .eq('id', user.id);
      if (profileError) {
        console.warn('[host-verification] profile status sync failed', { userId: user.id, error: profileError.message });
      }
    } catch (err) {
      console.warn('[host-verification] profile status sync failed', { userId: user.id, error: err instanceof Error ? err.message : String(err) });
    }

    const { data: profile } = await service.from('profiles').select('email').eq('id', user.id).maybeSingle();
    bestEffortNotify(service, user.id, typeof profile?.email === 'string' ? profile.email : '', `submitted:${result.row.submittedAt}`);
    void sendHostVerificationTelegramNotification(user.id, 'host_verification_submitted');

    return NextResponse.json({ ok: true, row: result.row });
  } catch (err) {
    console.error('[host-verification] submit error', err);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}