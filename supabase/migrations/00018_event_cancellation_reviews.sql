-- ===========================================================================
-- Event cancellation + post-event ratings & reviews (Batch 18) — IDEMPOTENT.
--
-- 1. Event cancellation: a host can cancel their event at any time. Guests are
--    refunded (server-side, see /api/host/cancel-event) and notified by email.
--    parties gains cancelled_at / cancellation_reason; orders gains
--    cancellation_reason so each refunded order remembers why it was refunded.
--
-- 2. Post-event reviews: guests who attended an ended event can post one
--    star rating + optional review per event. parties gains review_count and
--    avg_rating (recomputed by the add_event_review function below).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Event cancellation columns.
-- ---------------------------------------------------------------------------
alter table public.parties add column if not exists cancelled_at timestamptz;
alter table public.parties add column if not exists cancellation_reason text;

alter table public.orders add column if not exists cancellation_reason text;

create index if not exists parties_cancelled_at_idx on public.parties (cancelled_at)
  where cancelled_at is not null;

-- ---------------------------------------------------------------------------
-- 2. Review aggregates on parties.
-- ---------------------------------------------------------------------------
alter table public.parties add column if not exists review_count integer not null default 0 check (review_count >= 0);
alter table public.parties add column if not exists avg_rating numeric(3,2) not null default 0
  check (avg_rating >= 0 and avg_rating <= 5);

-- ---------------------------------------------------------------------------
-- 3. reviews table.
--
-- guest_name is denormalised at insert time (from the reviewer's profile) so
-- we never need to join profiles on the public event page — profiles RLS keeps
-- identities private, review names stay safe.
-- ---------------------------------------------------------------------------
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  party_id bigint not null references public.parties (id) on delete cascade,
  guest_id uuid not null references public.profiles (id) on delete cascade,
  guest_name text not null default 'Guest',
  rating integer not null check (rating >= 1 and rating <= 5),
  review_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reviews_one_per_guest_per_event unique (party_id, guest_id)
);

create index if not exists reviews_party_id_idx on public.reviews (party_id);
create index if not exists reviews_guest_id_idx on public.reviews (guest_id);

alter table public.reviews enable row level security;

-- Anyone who can see an event (approved public / owner / admin) can read its
-- reviews. Anon users have auth.uid() = null, so only the approved-arm applies.
drop policy if exists "reviews of visible parties are readable" on public.reviews;
create policy "reviews of visible parties are readable"
  on public.reviews for select
  using (
    exists (
      select 1 from public.parties
      where parties.id = reviews.party_id
        and (parties.status = 'approved'
             or parties.created_by = (select auth.uid())
             or exists (select 1 from public.profiles where id = (select auth.uid()) and is_admin))
    )
  );

-- Writes go through the SECURITY DEFINER function below only (it verifies the
-- reviewer owns a confirmed ticket, the event has ended, and one review per
-- guest per event). No direct insert/update/delete is allowed by clients.
drop policy if exists "no direct review writes" on public.reviews;
create policy "no direct review writes"
  on public.reviews for insert
  with check (false);

-- ---------------------------------------------------------------------------
-- 4. add_event_review: verified, single write path for a review.
--
--    * rating must be 1..5
--    * the event must have ended (starts_at is the scheduled start; reviews
--      open once the start time has passed)
--    * the caller must hold a confirmed (paid) order for the event
--    * one review per guest per event — a repeat call updates the existing one
--
--    Recomputes parties.review_count / avg_rating from the reviews table.
-- ---------------------------------------------------------------------------
create or replace function public.add_event_review(p_party_id bigint, p_rating integer, p_review_text text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_party public.parties%rowtype;
  v_order_count bigint;
  v_name text;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be between 1 and 5' using errcode = 'P0001';
  end if;

  select * into v_party from public.parties where id = p_party_id;
  if not found then
    raise exception 'Event not found' using errcode = 'P0001';
  end if;

  if v_party.starts_at >= now() then
    raise exception 'Reviews open after the event starts' using errcode = 'P0001';
  end if;

  select count(*) into v_order_count
  from public.orders
  where party_id = p_party_id
    and user_id = (select auth.uid())
    and payment_status = 'confirmed';

  if v_order_count = 0 then
    raise exception 'Only ticket holders can review this event' using errcode = 'P0001';
  end if;

  select name into v_name from public.profiles where id = (select auth.uid());
  v_name := coalesce(v_name, 'Guest');

  insert into public.reviews (party_id, guest_id, guest_name, rating, review_text)
  values (p_party_id, (select auth.uid()), v_name, p_rating, nullif(trim(p_review_text), ''))
  on conflict (party_id, guest_id) do update
    set rating = excluded.rating,
        review_text = excluded.review_text,
        updated_at = now();

  update public.parties p
  set review_count = agg.cnt,
      avg_rating = round(agg.avg_r::numeric, 2)
  from (
    select count(*)::integer as cnt, avg(rating) as avg_r
    from public.reviews
    where party_id = p_party_id
  ) agg
  where p.id = p_party_id;
end;
$$;

revoke execute on function public.add_event_review(bigint, integer, text) from public, anon;
grant execute on function public.add_event_review(bigint, integer, text) to authenticated;

-- Tracks which order already received a post-event "leave a review" email so
-- the review-request cron never nags the same guest twice.
alter table public.orders add column if not exists review_emailed_at timestamptz; 
create index if not exists orders_review_emailed_at_idx on public.orders (review_emailed_at) where review_emailed_at is null;