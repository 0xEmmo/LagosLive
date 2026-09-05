-- ===========================================================================
-- Email campaigns / newsletter (Batch 19) — IDEMPOTENT.
--
-- Newsletter subscribers opt in from the homepage modal; weekly campaigns are
-- assembled and sent by the /api/cron/send-weekly-campaign job. Reads/writes
-- of subscriber data are staff-only except the public insert that lets anyone
-- subscribe. campaign_sends tracks per-recipient delivery for future
-- open/click analytics.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. newsletter_subscribers.
-- ---------------------------------------------------------------------------
create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  first_name text,
  last_name text,
  subscribed_at timestamptz not null default now(),
  unsubscribe_token text,
  verified boolean not null default false,
  constraint newsletter_subscribers_email_key unique (email)
);

alter table public.newsletter_subscribers enable row level security;

-- Anyone (including anonymous visitors) can subscribe. Duplicate emails are
-- ignored by the unique constraint — clients should upsert-or-ignore.
drop policy if exists "anything can subscribe" on public.newsletter_subscribers;
create policy "anything can subscribe"
  on public.newsletter_subscribers for insert
  with check (true);

-- Only staff and service reads subscriber data.
drop policy if exists "staff read newsletter subscribers" on public.newsletter_subscribers;
create policy "staff read newsletter subscribers"
  on public.newsletter_subscribers for select
  using (public.has_role(array['support', 'finance', 'admin', 'super_admin']));

-- ---------------------------------------------------------------------------
-- 2. email_campaigns + campaign_sends.
-- ---------------------------------------------------------------------------
create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subject text not null,
  html_content text not null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.campaign_sends (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.email_campaigns (id) on delete cascade,
  subscriber_email text,
  sent_at timestamptz not null default now(),
  opened_at timestamptz,
  clicked_at timestamptz
);

alter table public.email_campaigns enable row level security;
alter table public.campaign_sends enable row level security;

-- Staff manage campaigns and sends; subscribers never touch them.
drop policy if exists "staff manage campaigns" on public.email_campaigns;
create policy "staff manage campaigns"
  on public.email_campaigns for all
  using (public.has_role(array['admin', 'super_admin']))
  with check (public.has_role(array['admin', 'super_admin']));

drop policy if exists "staff manage campaign sends" on public.campaign_sends;
create policy "staff manage campaign sends"
  on public.campaign_sends for all
  using (public.has_role(array['admin', 'super_admin']))
  with check (public.has_role(array['admin', 'super_admin']));