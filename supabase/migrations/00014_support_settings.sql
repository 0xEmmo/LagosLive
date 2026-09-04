-- Support system settings: canned responses + FAQs.
-- These are managed by support/admin staff via the settings screen and are
-- meant to be public/readable (a user's support page could show FAQs), so
-- reads are open via an anon-visible policy while writes stay staff-only.

-- Organizers submit payout requests as a self-service flow. The INSERT policy
-- is deliberately restrictive: the payout must be for the caller, must start
-- as 'pending', and staff-only fields (status / paid_at / bank_last4) cannot be
-- set by the organizer. amount/revenue/platform_fee are recomputed downstream
-- by finance before approval, so a malicious amount here is harmless.
drop policy if exists "organizers request their own payouts" on public.payouts;
create policy "organizers request their own payouts"
  on public.payouts for insert
  with check (
    organizer_id = (select auth.uid())
    and status = 'pending'
    and paid_at is null
    and bank_last4 is null
    and public.has_role(array['organizer', 'admin', 'super_admin'])
  );

create table if not exists public.canned_responses (
  id bigint generated always as identity primary key,
  label text not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.canned_responses enable row level security;

create table if not exists public.faqs (
  id bigint generated always as identity primary key,
  question text not null,
  answer text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.faqs enable row level security;

-- Canned responses: staff can read/write; buyers are not expected to see these
drop policy if exists "staff manage canned responses" on public.canned_responses;
create policy "staff manage canned responses"
  on public.canned_responses for all
  using (public.has_role(array['support', 'admin', 'super_admin']))
  with check (public.has_role(array['support', 'admin', 'super_admin']));

-- FAQs: readable by everyone (public in-app support), editable by staff
drop policy if exists "anyone reads faqs" on public.faqs;
create policy "anyone reads faqs"
  on public.faqs for select
  using (true);

drop policy if exists "staff manage faqs" on public.faqs;
create policy "staff manage faqs"
  on public.faqs for all
  using (public.has_role(array['support', 'admin', 'super_admin']))
  with check (public.has_role(array['support', 'admin', 'super_admin']));
