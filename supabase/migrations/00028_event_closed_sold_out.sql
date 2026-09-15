-- ---------------------------------------------------------------------------
-- Host-controlled event availability (Batch 28).
--
-- Two new nullable sentinel columns on parties, following the same pattern as
-- cancelled_at (migration 00018):
--   * parties.sold_out_at — host-declared sold out, even when inventory remains.
--   * parties.closed_at   — permanently closed; still discoverable, but no new
--                           orders can ever be created against it.
--
-- status stays 'approved' in both cases, so the existing RLS read policy, the
-- public feed queries and the review-flow trigger keep working unchanged.
-- Genuine exhaustion (spots_left reaching 0) already enforces itself, so the
-- DB only needs to block orders on top of these host-controlled flags.
-- ---------------------------------------------------------------------------

alter table public.parties
  add column if not exists sold_out_at timestamptz,
  add column if not exists closed_at timestamptz;

create index if not exists parties_sold_out_at_idx
  on public.parties (sold_out_at)
  where sold_out_at is not null;

create index if not exists parties_closed_at_idx
  on public.parties (closed_at)
  where closed_at is not null;

-- ---------------------------------------------------------------------------
-- Guard the new columns in the review-flow trigger. Staff with
-- events.approve/reject/cancel, service_role and app.bypass_event_review
-- already return early; this extension lets the host (created_by) and
-- events.edit holders flip availability, and blocks everyone else — including
-- owners trying to create an already-closed event on INSERT.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_event_review_flow()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_bypass boolean;
begin
  v_bypass := coalesce(nullif(current_setting('app.bypass_event_review', true), ''), '') = 'on';

  if v_bypass or auth.role() = 'service_role'
     or public.user_has_permission((select auth.uid()), 'events.approve')
     or public.user_has_permission((select auth.uid()), 'events.reject')
     or public.user_has_permission((select auth.uid()), 'events.cancel') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.sold_out_at is not null or new.closed_at is not null then
      raise exception 'A new event cannot start sold out or closed';
    end if;
  end if;

  if new.status is distinct from old.status then
    if new.status in ('approved', 'rejected', 'suspended') then
      raise exception 'Only staff with event moderation permission can approve, reject or suspend an event';
    end if;
    if new.status in ('draft', 'pending') and old.created_by <> (select auth.uid()) then
      raise exception 'Only the host of this event can submit or withdraw it';
    end if;
  end if;

  if new.review_reason is distinct from old.review_reason then
    raise exception 'Review notes are written by staff';
  end if;

  if new.sold_out_at is distinct from old.sold_out_at
     or new.closed_at is distinct from old.closed_at then
    if old.created_by <> (select auth.uid())
       and not public.user_has_permission((select auth.uid()), 'events.edit') then
      raise exception 'Only the host of this event can mark it sold out, reopen it, or close it';
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- The authoritative purchase gate. Runs before every orders INSERT (the one
-- place order rows are ever created) and locks the party row so a host flipping
-- sold_out_at/closed_at can never race an in-flight checkout. Capacity itself
-- is still enforced atomically by orders_decrement_spots, so this trigger only
-- checks the availability flags (the decrement trigger runs first and any
-- check against spots_left here would reject the final qualifying order).
-- ---------------------------------------------------------------------------
create or replace function public.enforce_order_availability()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_party public.parties%rowtype;
begin
  select * into v_party
  from public.parties
  where id = new.party_id
  for update;

  if v_party.status <> 'approved' then
    raise exception 'This event is not open for bookings yet' using errcode = 'P0001';
  end if;

  if v_party.cancelled_at is not null then
    raise exception 'This event has been cancelled' using errcode = 'P0001';
  end if;

  if v_party.closed_at is not null then
    raise exception 'This event has been closed and is no longer taking orders' using errcode = 'P0001';
  end if;

  if v_party.sold_out_at is not null then
    raise exception 'This event is sold out' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_orders_enforce_availability on public.orders;
create trigger trg_orders_enforce_availability
  before insert on public.orders
  for each row execute function public.enforce_order_availability();