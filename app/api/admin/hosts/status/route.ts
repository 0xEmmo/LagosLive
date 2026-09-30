import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

const ALLOWED = new Set(['active', 'suspended']);

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { user_id?: unknown; account_status?: unknown };
    const targetUserId = typeof body.user_id === 'string' ? body.user_id : '';
    const accountStatus = typeof body.account_status === 'string' ? body.account_status : '';
    if (!targetUserId) return NextResponse.json({ error: 'Missing target user.' }, { status: 400 });
    if (!ALLOWED.has(accountStatus)) return NextResponse.json({ error: 'Invalid account status.' }, { status: 400 });

    const auth = createServerSupabase();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

    const { data: canSuspend, error: permissionError } = await auth.rpc('user_has_permission', {
      p_user_id: user.id,
      p_permission_name: 'hosts.suspend',
    });
    if (permissionError || canSuspend !== true) {
      return NextResponse.json({ error: 'You do not have permission to change host account status.' }, { status: 403 });
    }

    const service = createServiceSupabase();
    const { data: target, error: targetError } = await service
      .from('profiles')
      .select('id, name, role, account_status')
      .eq('id', targetUserId)
      .maybeSingle();
    if (targetError || !target) return NextResponse.json({ error: 'Host account not found.' }, { status: 404 });
    if (target.role === 'super_admin') {
      return NextResponse.json({ error: 'The platform owner account cannot be changed.' }, { status: 403 });
    }
    if (target.account_status === accountStatus) {
      return NextResponse.json({ ok: true, account_status: accountStatus });
    }

    const { error: updateError } = await service
      .from('profiles')
      .update({ account_status: accountStatus })
      .eq('id', targetUserId);
    if (updateError) {
      console.error('[admin host status] update failed', updateError);
      return NextResponse.json({ error: 'Could not update the host account status.' }, { status: 500 });
    }

    const { error: auditError } = await service.rpc('write_audit_log', {
      p_action: accountStatus === 'active' ? 'host_reinstate' : 'host_suspend',
      p_target_type: 'profile',
      p_target_id: targetUserId,
      p_details: { previous_status: target.account_status, account_status: accountStatus },
    } as never);
    if (auditError) console.warn('[admin host status] audit failed', auditError);

    return NextResponse.json({ ok: true, account_status: accountStatus });
  } catch (error) {
    console.error('[admin host status] unexpected error', error);
    return NextResponse.json({ error: 'Could not update the host account status.' }, { status: 500 });
  }
}
