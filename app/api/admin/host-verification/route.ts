import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { sendHostVerificationEmail } from '@/lib/resend';
import { sendHostVerificationTelegramNotification } from '@/lib/telegram';
import type { Database } from '@/lib/supabase/database.types';

type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];

// Admin review decisions on host verification. 'verified' and 'rejected' are
// resolved through the DB function set_host_verification_status() — the ONLY
// path staff may use for those transitions — so it writes the verification row,
// audits, and keeps profiles.host_verification_status in sync in one atomic
// call. 'suspend' is a separate account-level decision that does not touch the
// verification row. Every decision is emailed to the host (best-effort) and
// reported to the Telegram ops channel.
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

    // TEMPORARY DEBUG — remove after debugging (batch: host verification failure).
    console.error('[HOST VERIFICATION DEBUG]', {
      step: 'request_received',
      decision,
      bodyKeys: Object.keys(body),
      targetUserId,
    });

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

    // Only staff with host verification permission may resolve a request.
    const { data: canVerify } = await supabase.rpc('user_has_permission', {
      p_user_id: user.id,
      p_permission_name: 'hosts.verify',
    });
    if (canVerify !== true) {
      return NextResponse.json({ error: 'Only staff with host verification access can resolve these requests.' }, { status: 403 });
    }
    // TEMPORARY DEBUG — remove after debugging (batch: host verification failure).
    console.error('[HOST VERIFICATION DEBUG]', { step: 'admin_authorized', adminUserId: user.id, canVerify });

    const service = createServiceSupabase();
    const { data: target, error: targetError } = await service
      .from('profiles')
      .select('id, name, email, account_status, host_verification_status, host_verification_reason')
      .eq('id', targetUserId)
      .maybeSingle();
    if (targetError || !target) return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    // TEMPORARY DEBUG — remove after debugging (batch: host verification failure).
    console.error('[HOST VERIFICATION DEBUG]', {
      step: 'target_loaded',
      hostId: target.id,
      currentStatus: target.host_verification_status,
      accountStatus: target.account_status,
      action: decision,
    });

    let emailDecision: 'approved' | 'rejected' | 'suspended' | null = null;

    // Verify / reject go through the DB function (set_host_verification_status),
    // which needs the caller's uid, so it must use the user-scoped client.
    if (decision === 'verify' || decision === 'reject') {
      // TEMPORARY DEBUG — remove after debugging (batch: host verification failure).
      console.error('[HOST VERIFICATION DEBUG]', {
        step: 'before_update',
        hostId: target.id,
        action: decision,
        currentStatus: target.host_verification_status,
        targetStatus: decision === 'verify' ? 'verified' : 'rejected',
      });
      const { error } = await supabase.rpc('set_host_verification_status', {
        p_user_id: target.id,
        p_status: decision === 'verify' ? 'verified' : 'rejected',
        p_reason: decision === 'reject' ? reason : null,
      });
      if (error) {
        // TEMPORARY DEBUG — remove after debugging (batch: host verification failure).
        console.error('[HOST VERIFICATION DEBUG]', {
          step: 'database_update_failed',
          hostId: target.id,
          action: decision,
          error: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        });
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      // TEMPORARY DEBUG — remove after debugging (batch: host verification failure).
      console.error('[HOST VERIFICATION DEBUG]', { step: 'database_update_succeeded', hostId: target.id, action: decision });

      // Verify also re-activates the account (the DB function deliberately does
      // not touch account_status — that is an account-level field, not a
      // verification one).
      if (decision === 'verify') {
        const { error: activateError } = await service
          .from('profiles')
          .update({ account_status: 'active' })
          .eq('id', target.id);
        if (activateError) {
          console.warn('[admin host-verification] account reactivation failed', { userId: target.id, error: activateError.message });
        }
      }

      emailDecision = decision === 'verify' ? 'approved' : 'rejected';
    } else {
      // Suspend is an account-level decision: it does not change the
      // verification row or status, only blocks the account (and records why).
      const patch: ProfileUpdate = {
        account_status: 'suspended',
        host_verification_reason: reason,
        host_verification_reviewed_at: new Date().toISOString(),
        host_verification_reviewed_by: user.id,
      };

      const { error: updateError } = await service.from('profiles').update(patch).eq('id', target.id);
      if (updateError) {
        return NextResponse.json({ error: 'Could not update the user.' }, { status: 500 });
      }

      await service.rpc('write_audit_log', {
        p_action: 'host_suspended',
        p_target_type: 'profile',
        p_target_id: target.id,
        p_details: {
          decision,
          reason: reason || null,
          previous_status: target.host_verification_status,
          account_status: target.account_status,
        },
      } as never);

      emailDecision = 'suspended';
    }

    if (emailDecision && notify && target.email) {
      await sendHostVerificationEmail({
        to: target.email,
        hostName: target.name,
        decision: emailDecision,
        reason: reason || undefined,
      });
    }

    // Ops-channel visibility for verification transitions only (a suspend is an
    // account action, not a verification event).
    if (decision === 'verify' || decision === 'reject') {
      const { data: actor } = await service.from('profiles').select('name').eq('id', user.id).maybeSingle();
      void sendHostVerificationTelegramNotification(
        target.id,
        decision === 'verify' ? 'host_verification_approved' : 'host_verification_rejected',
        { actorName: actor?.name ?? null }
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}