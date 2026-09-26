-- ===========================================================================
-- 00038 — PART 3b: verified bank details.
--
-- Part 3 left `payouts.bank_last4` NULL and flagged the gap: the host used to
-- type it into the payout request, so where the money went depended on a
-- value supplied by the person being paid. Rejecting it was better than
-- trusting it, but it left nowhere for a legitimate destination to live.
--
-- This migration gives it one, with the property that matters: a payout
-- destination is chosen by a verification step, never by whoever is being
-- paid.
--
-- THE ACCOUNT NUMBER IS NEVER STORED.
--
-- Moving money to a NUBAN account needs exactly one thing: Paystack's
-- `recipient_code`, an opaque token created once from the account number. The
-- account number is an input to that call and an output of nothing. Keeping it
-- would mean a database breach exposes every host's live bank credentials —
-- numbers that, unlike a token, can be used to move money. So the number is
-- used once in the API route, never reaches the database, and only the token
-- and the last four digits (for display) are persisted.
--
-- The consequence is deliberate: changing banks means registering a new
-- account rather than editing one. That is a feature — there is no state in
-- which a payout's destination can be edited after the fact.
-- ===========================================================================

create table if not exists public.host_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  bank_code text not null,
  bank_name text not null,
  -- The name exactly as the bank holds it, as returned by Paystack when the
  -- recipient was created. Never the name the host typed: if the two differ,
  -- the account does not belong to the person claiming it.
  account_name text not null,
  account_number_last4 text not null check (account_number_last4 ~ '^[0-9]{4}$'),
  -- Opaque Paystack token. This is the only thing a transfer needs, and it is
  -- the reason the account number is not kept.
  recipient_code text not null,
  verification_status text not null default 'verified'
    check (verification_status in ('verified', 'rejected')),
  verified_at timestamptz not null default now(),
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one live account per host. This is not a convenience: at transfer
-- time the code must never have to guess which of a host's accounts to use.
create unique index if not exists host_bank_accounts_one_live_per_user
  on public.host_bank_accounts (user_id)
  where removed_at is null;

comment on table public.host_bank_accounts is
  'A host''s verified payout destination. Holds a Paystack recipient_code, never the account number.';

alter table public.host_bank_accounts enable row level security;

-- No grants at all. Reading the recipient_code is reserved to the service role,
-- and the host reads their accounts through my_bank_accounts() below, which does
-- not return the code. Giving authenticated a plain SELECT would hand every host
-- a live token for their own account, for no benefit — the UI only needs the
-- bank, the name and the last four digits.
revoke all on public.host_bank_accounts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- register_bank_account — service role only, after Paystack has verified
-- ---------------------------------------------------------------------------
-- Called by the API route once Paystack has accepted the NUBAN and returned the
-- account name it holds. Because the caller is the service role, this cannot be
-- reached from the browser at all: there is no path by which a client can
-- invent a recipient_code or claim a verified account.
--
-- p_account_name and p_last4 are passed by the route from Paystack's response,
-- not from the request body, so they reflect the bank's view of the account.
create or replace function public.register_bank_account(
  p_user_id uuid,
  p_bank_code text,
  p_bank_name text,
  p_account_name text,
  p_account_number_last4 text,
  p_recipient_code text
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_recipient_code is null or length(btrim(p_recipient_code)) < 8 then
    raise exception 'A Paystack recipient code is required' using errcode = '22023';
  end if;
  if p_account_name is null or length(btrim(p_account_name)) < 2 then
    raise exception 'A verified account name is required' using errcode = '22023';
  end if;
  if p_account_number_last4 !~ '^[0-9]{4}$' then
    raise exception 'The last four digits of the account number are required' using errcode = '22023';
  end if;

  -- Replacing rather than updating: a host switching banks registers a new
  -- account. The old row is retained, not deleted, because a payout may still
  -- reference it.
  update public.host_bank_accounts
     set removed_at = now(), updated_at = now()
   where user_id = p_user_id and removed_at is null;

  insert into public.host_bank_accounts (
    user_id, bank_code, bank_name, account_name, account_number_last4, recipient_code
  )
  values (
    p_user_id, p_bank_code, p_bank_name, btrim(p_account_name),
    p_account_number_last4, p_recipient_code
  )
  returning id into v_id;

  perform public.write_audit_log(
    'bank_account_registered', 'bank_account', v_id::text,
    jsonb_build_object('bank_code', p_bank_code, 'bank_name', p_bank_name, 'last4', p_account_number_last4)
  );

  return v_id;
end;
$$;

revoke execute on function public.register_bank_account(uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.register_bank_account(uuid, text, text, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- my_bank_accounts — the host's own view, without the token
-- ---------------------------------------------------------------------------
create or replace function public.my_bank_accounts()
returns table (
  id uuid,
  bank_code text,
  bank_name text,
  account_name text,
  account_number_last4 text,
  verification_status text,
  verified_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer set search_path = public
as $$
  select a.id, a.bank_code, a.bank_name, a.account_name,
         a.account_number_last4, a.verification_status, a.verified_at, a.created_at
    from public.host_bank_accounts a
   where a.user_id = (select auth.uid())
     and a.removed_at is null;
$$;

revoke execute on function public.my_bank_accounts() from public, anon;
grant execute on function public.my_bank_accounts() to authenticated;

-- ---------------------------------------------------------------------------
-- remove_bank_account — own account only, and never one a live payout uses
-- ---------------------------------------------------------------------------
create or replace function public.remove_bank_account(p_bank_account_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.host_bank_accounts
     where id = p_bank_account_id
       and user_id = (select auth.uid())
       and removed_at is null
  ) then
    raise exception 'Bank account not found' using errcode = 'P0002';
  end if;

  -- A payout that has not been rejected still points at this account, and
  -- finance may be mid-transfer on it. Retiring it now would leave a payout
  -- with no reachable destination.
  if exists (
    select 1 from public.payouts p
     where p.bank_account_id = p_bank_account_id
       and p.status in ('pending', 'processing', 'approved')
  ) then
    raise exception
      'This bank account is being used by a payout that has not been paid yet'
      using errcode = '23514';
  end if;

  update public.host_bank_accounts
     set removed_at = now(), updated_at = now()
   where id = p_bank_account_id and user_id = (select auth.uid());

  perform public.write_audit_log(
    'bank_account_removed', 'bank_account', p_bank_account_id::text, '{}'::jsonb
  );
end;
$$;

revoke execute on function public.remove_bank_account(uuid) from public, anon;
grant execute on function public.remove_bank_account(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Payouts record which account they are paying
-- ---------------------------------------------------------------------------
-- ON DELETE RESTRICT rather than SET NULL: the destination of money already sent
-- is part of the audit trail, and a payout that has been paid must never lose
-- the record of where it went.
alter table public.payouts
  add column if not exists bank_account_id uuid references public.host_bank_accounts(id);

create index if not exists payouts_bank_account_id_idx
  on public.payouts (bank_account_id);

-- ---------------------------------------------------------------------------
-- request_payout now requires a verified destination
-- ---------------------------------------------------------------------------
-- Same signature as 00037, so this is a straight replacement. The addition is
-- that a host with no verified bank account cannot request a payout at all, and
-- bank_last4 is copied from the verified record instead of the browser.
create or replace function public.request_payout()
returns bigint
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_profile public.profiles;
  v_bank public.host_bank_accounts;
  v_revenue integer;
  v_fee integer;
  v_amount integer;
  v_payout_id bigint;
  v_period_start date;
  v_period_end date;
  v_min constant integer := 1000; -- ₦1,000
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  if v_profile.role not in ('organizer', 'finance', 'support', 'admin', 'super_admin') then
    raise exception 'Only event hosts can request payouts' using errcode = '42501';
  end if;
  if coalesce(v_profile.host_verification_status, 'unverified') <> 'verified' then
    raise exception 'Verify your host account before requesting payouts' using errcode = '42501';
  end if;
  if v_profile.account_status <> 'active' then
    raise exception 'Your account must be active to request payouts' using errcode = '42501';
  end if;

  -- No verified destination, no payout. This is the step that removes "an admin
  -- remembers which account to use" from the process.
  select * into v_bank
    from public.host_bank_accounts
   where user_id = v_uid and removed_at is null
   order by created_at desc
   limit 1;
  if not found then
    raise exception 'Add a verified bank account before requesting payouts' using errcode = '23514';
  end if;

  select coalesce(sum(o.total), 0)::integer,
         min(o.created_at)::date,
         max(o.created_at)::date
    into v_revenue, v_period_start, v_period_end
    from public.orders o
    join public.parties p on p.id = o.party_id
   where p.created_by = v_uid
     and o.payment_status = 'confirmed'
     and coalesce(o.refund_status, 'none') <> 'refunded'
     and not exists (
       select 1 from public.payout_items pi
        where pi.order_id = o.id and not pi.released
     );

  if coalesce(v_revenue, 0) < v_min then
    raise exception 'Payout amount is below the minimum' using errcode = 'P0001';
  end if;

  v_fee := round(v_revenue * 0.15);
  v_amount := v_revenue - v_fee;

  insert into public.payouts (
    organizer_id, bank_account_id, period_start, period_end, revenue, platform_fee,
    amount, status, bank_last4
  )
  values (
    v_uid, v_bank.id, coalesce(v_period_start, current_date), coalesce(v_period_end, current_date),
    v_revenue, v_fee, v_amount, 'pending', v_bank.account_number_last4
  )
  returning id into v_payout_id;

  begin
    insert into public.payout_items (payout_id, order_id, amount)
    select v_payout_id, o.id, o.total
      from public.orders o
      join public.parties p on p.id = o.party_id
     where p.created_by = v_uid
       and o.payment_status = 'confirmed'
       and coalesce(o.refund_status, 'none') <> 'refunded'
       and not exists (
         select 1 from public.payout_items pi
          where pi.order_id = o.id and not pi.released
       );
  exception
    when unique_violation then
      raise exception
        'A payout for this revenue is already being processed'
        using errcode = '23505';
  end;

  perform public.write_audit_log(
    'payout_requested', 'payout', v_payout_id::text,
    jsonb_build_object(
      'revenue', v_revenue, 'platform_fee', v_fee, 'amount', v_amount,
      'bank_account_id', v_bank.id, 'bank_last4', v_bank.account_number_last4
    )
  );

  return v_payout_id;
end;
$$;

-- The frozen-columns guard now also covers the destination, so even a service
-- role bug cannot repoint a payout at a different account after the fact.
create or replace function public.guard_payout_money_columns()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() not in ('anon', 'authenticated') then
    return new;
  end if;

  if new.organizer_id is distinct from old.organizer_id
     or new.bank_account_id is distinct from old.bank_account_id
     or new.revenue is distinct from old.revenue
     or new.platform_fee is distinct from old.platform_fee
     or new.amount is distinct from old.amount
     or new.period_start is distinct from old.period_start
     or new.period_end is distinct from old.period_end
     or new.bank_last4 is distinct from old.bank_last4
     or new.paid_at is distinct from old.paid_at
     or new.created_at is distinct from old.created_at
     or new.transfer_code is distinct from old.transfer_code
     or new.transfer_reference is distinct from old.transfer_reference
  then
    raise exception
      'Payout amounts, period and beneficiary are computed by the server and cannot be edited.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;
