-- Guest ticket links are bearer credentials. Keep them valid long enough for
-- ticket holders to retrieve event details, but put a server-enforced lifetime
-- on each link. Existing guest links receive a fresh five-year window so this
-- migration does not invalidate emails already in customer inboxes.
alter table public.orders
  add column ticket_access_expires_at timestamptz;

update public.orders
   set ticket_access_expires_at = now() + interval '5 years'
 where ticket_access_token is not null;

alter table public.orders
  alter column ticket_access_expires_at set default (now() + interval '5 years');

create index orders_ticket_access_expiry_idx
  on public.orders (ticket_access_expires_at)
  where ticket_access_token is not null;
