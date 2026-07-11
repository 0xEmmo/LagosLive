-- Real start/end timestamps (replacing the free-text date/time strings as the
-- source of truth for filtering and for computing "1 hour before" reminders),
-- inventory enforcement on orders, and organizer-owned parties.

-- ---------------------------------------------------------------------------
-- starts_at / ends_at: backfilled 1:1 from the existing date/time display
-- strings for the 22 seeded rows. These land in the past relative to "now"
-- (the seed was authored for a specific week that has since passed) — that's
-- expected and correct: reminders on these legacy rows simply won't fire.
-- Any party submitted from here on has a real, current starts_at.
-- ---------------------------------------------------------------------------
alter table public.parties add column starts_at timestamptz;
alter table public.parties add column ends_at timestamptz;

update public.parties set
  starts_at = case id
    when 1 then '2026-07-05 22:00:00+01'::timestamptz
    when 2 then '2026-07-04 20:00:00+01'::timestamptz
    when 3 then '2026-07-05 16:00:00+01'::timestamptz
    when 4 then '2026-07-06 19:00:00+01'::timestamptz
    when 5 then '2026-07-05 21:00:00+01'::timestamptz
    when 6 then '2026-07-04 21:00:00+01'::timestamptz
    when 7 then '2026-07-05 23:00:00+01'::timestamptz
    when 8 then '2026-07-05 20:00:00+01'::timestamptz
    when 9 then '2026-07-06 15:00:00+01'::timestamptz
    when 10 then '2026-07-06 14:00:00+01'::timestamptz
    when 11 then '2026-07-04 20:00:00+01'::timestamptz
    when 12 then '2026-07-04 23:00:00+01'::timestamptz
    when 13 then '2026-07-05 18:00:00+01'::timestamptz
    when 14 then '2026-07-06 12:00:00+01'::timestamptz
    when 15 then '2026-07-04 21:00:00+01'::timestamptz
    when 16 then '2026-07-04 22:00:00+01'::timestamptz
    when 17 then '2026-07-05 20:00:00+01'::timestamptz
    when 18 then '2026-07-05 18:00:00+01'::timestamptz
    when 19 then '2026-07-05 23:00:00+01'::timestamptz
    when 20 then '2026-07-06 18:00:00+01'::timestamptz
    when 21 then '2026-07-05 17:00:00+01'::timestamptz
    when 22 then '2026-07-05 22:00:00+01'::timestamptz
  end,
  ends_at = case id
    when 1 then '2026-07-06 04:00:00+01'::timestamptz
    when 2 then '2026-07-05 02:00:00+01'::timestamptz
    when 3 then '2026-07-06 00:00:00+01'::timestamptz
    when 4 then '2026-07-06 23:00:00+01'::timestamptz
    when 5 then '2026-07-06 05:00:00+01'::timestamptz
    when 6 then '2026-07-05 03:00:00+01'::timestamptz
    when 7 then '2026-07-06 06:00:00+01'::timestamptz
    when 8 then '2026-07-06 00:00:00+01'::timestamptz
    when 9 then '2026-07-06 22:00:00+01'::timestamptz
    when 10 then '2026-07-06 20:00:00+01'::timestamptz
    when 11 then '2026-07-05 02:00:00+01'::timestamptz
    when 12 then '2026-07-05 05:00:00+01'::timestamptz
    when 13 then '2026-07-06 02:00:00+01'::timestamptz
    when 14 then '2026-07-06 20:00:00+01'::timestamptz
    when 15 then '2026-07-05 03:00:00+01'::timestamptz
    when 16 then '2026-07-05 06:00:00+01'::timestamptz
    when 17 then '2026-07-06 04:00:00+01'::timestamptz
    when 18 then '2026-07-05 22:00:00+01'::timestamptz
    when 19 then '2026-07-06 06:00:00+01'::timestamptz
    when 20 then '2026-07-06 23:00:00+01'::timestamptz
    when 21 then '2026-07-06 01:00:00+01'::timestamptz
    when 22 then '2026-07-06 06:00:00+01'::timestamptz
  end
where id between 1 and 22;

alter table public.parties alter column starts_at set not null;
alter table public.parties alter column ends_at set not null;

-- is_weekend becomes derived (Sat/Sun in Lagos local time) instead of a value
-- that goes stale the moment it's no longer "this week" — matches the
-- Sat/Sun-only pattern the original seed data already used.
alter table public.parties drop column is_weekend;
alter table public.parties add column is_weekend boolean
  generated always as (
    extract(isodow from (starts_at at time zone 'Africa/Lagos')) in (6, 7)
  ) stored;

-- is_this_week depended on wall-clock "now", which can't live in a generated
-- column (or a stale stored one) — the app now computes it from starts_at
-- at query time instead.
alter table public.parties drop column is_this_week;

-- ---------------------------------------------------------------------------
-- created_by: ties a party to the organizer who submitted it. Null on the
-- 22 seeded rows (no owner — platform-curated). Backs the new /host pages.
-- ---------------------------------------------------------------------------
alter table public.parties add column created_by uuid references auth.users (id) on delete set null;

create policy "organizers create their own parties"
  on public.parties for insert
  with check ((select auth.uid()) = created_by);

create policy "organizers update their own parties"
  on public.parties for update
  using ((select auth.uid()) = created_by);

create index parties_created_by_idx on public.parties (created_by);

-- ---------------------------------------------------------------------------
-- reminders.notified_at: tracks whether the 1-hour-before notification has
-- already fired for this reminder, so the client-side scheduler doesn't
-- re-notify every time it polls.
-- ---------------------------------------------------------------------------
alter table public.reminders add column notified_at timestamptz;

-- ---------------------------------------------------------------------------
-- Atomic inventory enforcement: every order decrements spots_left in the same
-- transaction as the insert, and the whole order is rejected if there isn't
-- enough capacity left — closes the oversell gap where orders and spots_left
-- were previously two disconnected numbers.
-- ---------------------------------------------------------------------------
create function public.decrement_party_spots()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.parties
  set spots_left = spots_left - new.quantity
  where id = new.party_id and spots_left >= new.quantity;

  if not found then
    raise exception 'Not enough spots left for this party' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke execute on function public.decrement_party_spots() from public, anon, authenticated;

create trigger orders_decrement_spots
  before insert on public.orders
  for each row execute procedure public.decrement_party_spots();
