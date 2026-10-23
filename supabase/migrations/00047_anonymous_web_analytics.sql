-- Anonymous first-party web analytics.
-- Deliberately stores no account id, name, email, IP address, raw user-agent,
-- cookie value, query string, or free-form click text.
begin;

create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  visitor_id text not null check (length(visitor_id) between 16 and 96),
  session_id text not null check (length(session_id) between 16 and 96),
  event_name text not null check (
    event_name in (
      'session_started',
      'page_view',
      'page_exit',
      'buy_ticket_clicked',
      'checkout_started',
      'purchase_completed',
      'ticket_opened'
    )
  ),
  path text not null check (path like '/%' and length(path) <= 240),
  party_id bigint,
  duration_ms integer not null default 0 check (duration_ms between 0 and 86400000),
  device_type text not null default 'unknown' check (device_type in ('mobile', 'tablet', 'desktop', 'unknown')),
  audience text not null default 'guest' check (audience in ('guest', 'signed_in')),
  referrer_origin text check (referrer_origin is null or length(referrer_origin) <= 160),
  created_at timestamptz not null default now()
);

comment on table public.analytics_events is
  'First-party anonymous traffic events. Do not add account identifiers, contact details, IP addresses, raw user-agents, or free-form text.';

alter table public.analytics_events enable row level security;

-- Browser traffic is accepted only through the server route, which validates
-- and inserts with the service-role client. Admin reads are also aggregated in
-- the server route; raw event rows are never exposed to the browser.
revoke all on table public.analytics_events from anon, authenticated;
grant all on table public.analytics_events to service_role;

drop policy if exists "no direct client access to analytics" on public.analytics_events;

create index if not exists analytics_events_created_at_idx
  on public.analytics_events (created_at desc);
create index if not exists analytics_events_event_name_created_at_idx
  on public.analytics_events (event_name, created_at desc);
create index if not exists analytics_events_visitor_created_at_idx
  on public.analytics_events (visitor_id, created_at desc);
create index if not exists analytics_events_session_created_at_idx
  on public.analytics_events (session_id, created_at desc);

commit;
