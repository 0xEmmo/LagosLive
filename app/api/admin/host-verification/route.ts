import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { sendHostVerificationEmail } from '@/lib/resend';
import type { Database } from '@/lib/supabase/database.types';

type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];

// Admin review decisions on host verification. Only admin/super_admin may
// resolve a request; finance/support review read-only. Every decision is
// audited and (best-effort) emailed to the host.
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      user_id?: unknown;
      decision?: unknown;
      reason?: unknown;
      notify?: unknown;
    };
    const targetUserId = typeof body.user_id === 'string' ? body.user_id : '';
    const decision = typeof body.decision === 'string' ? body.decision : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const notify = body.notify !== false;

    if (!targetUserId) return NextResponse.json({ error: 'Missing target user.' }, { status: 400 });
    if (!['verify', 'reject', 'suspend'].includes(decision)) {
      return NextResponse.json({ error: 'Invalid decision.' }, { status: 400 });
    }
    if (decision !== 'verify' && !reason) {
      return NextResponse.json({ error: 'A reason is required for this decision.' }, { status: 400 });
    }

    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

    const service = createServiceSupabase();
    const { data: actor } = await service
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (!['admin', 'super_admin'].includes(actor?.role ?? '')) {
      return NextResponse.json({ error: 'Only admins can resolve verification requests.' }, { status: 403 });
    }

    const { data: target, error: targetError } = await service
      .from('profiles')
      .select('id, name, email, account_status, host_verification_status, host_verification_reason')
      .eq('id', targetUserId)
      .maybeSingle();
    if (targetError || !target) return NextResponse.json({ error: 'User not found.' }, { status: 404 });

    const now = new Date().toISOString();
    const patch: ProfileUpdate = {
      host_verification_reviewed_at: now,
      host_verification_reviewed_by: user.id,
    };

    let action = '';
    let emailDecision: 'approved' | 'rejected' | 'suspended' | null = null;

    if (decision === 'verify') {
      patch.host_verification_status = 'verified';
      patch.host_verification_reason = reason || null;
      patch.account_status = 'active';
      action = 'host_verification_approved';
      emailDecision = 'approved';
    } else if (decision === 'reject') {
      patch.host_verification_status = 'rejected';
      patch.host_verification_reason = reason;
      action = 'host_verification_rejected';
      emailDecision = 'rejected';
    } else {
      patch.account_status = 'suspended';
      patch.host_verification_reason = reason;
      action = 'host_suspended';
      emailDecision = 'suspended';
    }

    const { error: updateError } = await service
      .from('profiles')
      .update(patch)
      .eq('id', target.id);
    if (updateError) {
      return NextResponse.json({ error: 'Could not update the user.' }, { status: 500 });
    }

    await service.rpc('write_audit_log', {
      p_action: action,
      p_target_type: 'profile',
      p_target_id: target.id,
      p_details: {
        decision,
        reason: reason || null,
        previous_status: target.host_verification_status,
        account_status: target.account_status,
      },
    } as never);

    if (emailDecision && notify && target.email) {
      await sendHostVerificationEmail({
        to: target.email,
        hostName: target.name,
        decision: emailDecision,
        reason: reason || undefined,
      });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}