-- Admin event rejection: enforce a minimum reason length on the server
-- so validation matches the UI dialog (min 5 trimmed characters).

create or replace function public.set_event_review_status(
  p_party_id bigint,
  p_status text,
  p_reason text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_party public.parties%rowtype;
  v_is_staff boolean;
  v_action text;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  select role into v_role from public.profiles where id = v_actor;
  if v_role is null then
    raise exception 'Profile not found';
  end if;
  select * into v_party from public.parties where id = p_party_id;
  if v_party.id is null then
    raise exception 'Event not found';
  end if;

  -- Staff = anyone holding platform-wide event moderation permissions.
  v_is_staff :=
    public.user_has_permission(v_actor, 'events.approve')
    or public.user_has_permission(v_actor, 'events.reject')
    or public.user_has_permission(v_actor, 'events.cancel');

  if p_status not in ('draft', 'pending', 'approved', 'rejected', 'suspended') then
    raise exception 'Invalid status';
  end if;

  -- Staff-only terminal states.
  if p_status in ('approved', 'rejected', 'suspended') and not v_is_staff then
    raise exception 'Forbidden';
  end if;

  -- Rejections / suspensions need a reason (shown to the host + staff note).
  if p_status in ('rejected', 'suspended') and coalesce(p_reason, '') = '' then
    raise exception 'A reason is required';
  end if;

  -- Rejections / suspensions need a reason long enough to be useful.
  if p_status in ('rejected', 'suspended') and char_length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Reason must be at least 5 characters';
  end if;

  -- Host submission rules.
  if p_status = 'pending' then
    if not v_is_staff and v_party.created_by <> v_actor then
      raise exception 'Only the host can submit their own event';
    end if;
    if not v_is_staff and v_party.status not in ('draft', 'rejected') then
      raise exception 'Only a draft or rejected event can be submitted for review';
    end if;
  end if;

  -- Host withdrawal rules.
  if p_status = 'draft' then
    if not v_is_staff and v_party.created_by <> v_actor then
      raise exception 'Only the host can withdraw their own event';
    end if;
    if not v_is_staff and v_party.status <> 'pending' then
      raise exception 'Only a pending event can be withdrawn to draft';
    end if;
  end if;

  perform set_config('app.bypass_event_review', 'on', true);
  update public.parties
    set status = p_status,
        review_reason = case
          when p_status in ('rejected', 'suspended') then coalesce(p_reason, null)
          else null
        end
    where id = p_party_id;
  perform set_config('app.bypass_event_review', 'off', true);

  -- The reason doubles as a staff-visible note scoped to this event.
  if p_reason is not null and p_reason <> '' then
    insert into public.admin_notes (author_id, target_type, target_id, body)
    values (v_actor, 'party', p_party_id::text, p_reason);
  end if;

  v_action := case p_status
    when 'draft' then 'event_withdrawn'
    when 'pending' then 'event_submitted'
    when 'approved' then 'event_approved'
    when 'rejected' then 'event_rejected'
    else 'event_disabled'
  end;

  perform public.write_audit_log(
    v_action,
    'event',
    p_party_id::text,
    jsonb_build_object('previous_status', v_party.status, 'status', p_status, 'reason', p_reason)
  );
end;
$$;