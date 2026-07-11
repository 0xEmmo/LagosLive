-- Lagos Live — initial schema
-- Mirrors the existing client-side shapes (lib/types.ts Party, lib/store.ts User)
-- so the migration from static data + localStorage is a swap, not a redesign.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- parties (replaces lib/data.ts PARTIES)
-- ---------------------------------------------------------------------------
create table public.parties (
  id bigint generated always as identity primary key,
  title text not null,
  date text not null,
  time text not null,
  location text not null,
  address text not null,
  lat double precision not null,
  lng double precision not null,
  fee text not null,
  fee_num integer not null check (fee_num >= 0),
  distance numeric not null,
  vibe text not null check (vibe in ('Club', 'Rooftop', 'Festival', 'Concert', 'House Party', 'Lounge')),
  capacity integer not null check (capacity > 0),
  spots_left integer not null check (spots_left >= 0),
  age_restriction text not null,
  dress_code text not null,
  organizer text not null,
  instagram text not null,
  whatsapp text not null,
  description text not null,
  gradient text not null,
  is_weekend boolean not null default false,
  is_this_week boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.parties enable row level security;

create policy "parties are publicly readable"
  on public.parties for select
  using (true);

-- No insert/update/delete policy: writes go through the service role only
-- (dashboard or an admin tool), same trust boundary as the old hardcoded array.

-- ---------------------------------------------------------------------------
-- profiles (extends auth.users; replaces lib/store.ts User)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null,
  push_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "users read their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "users update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create a profile row whenever someone signs up. `name` comes from the
-- signup form via supabase.auth.signUp({ options: { data: { name } } }).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)), new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- saved_parties (replaces store.savedParties number[])
-- ---------------------------------------------------------------------------
create table public.saved_parties (
  user_id uuid not null references auth.users (id) on delete cascade,
  party_id bigint not null references public.parties (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, party_id)
);

alter table public.saved_parties enable row level security;

create policy "users manage their own saved parties"
  on public.saved_parties for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- reminders (replaces store.reminders number[])
-- ---------------------------------------------------------------------------
create table public.reminders (
  user_id uuid not null references auth.users (id) on delete cascade,
  party_id bigint not null references public.parties (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, party_id)
);

alter table public.reminders enable row level security;

create policy "users manage their own reminders"
  on public.reminders for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- orders (RSVPs + paid tickets; replaces the fake orderRef from checkout)
-- ---------------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  party_id bigint not null references public.parties (id) on delete restrict,
  tier text not null check (tier in ('regular', 'vip')),
  quantity integer not null check (quantity > 0),
  unit_price integer not null check (unit_price >= 0),
  service_fee integer not null default 0 check (service_fee >= 0),
  total integer not null check (total >= 0),
  payment_method text check (payment_method in ('card', 'transfer')),
  order_ref text not null unique,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  created_at timestamptz not null default now()
);

alter table public.orders enable row level security;

create policy "users read their own orders"
  on public.orders for select
  using (auth.uid() = user_id);

create policy "users create their own orders"
  on public.orders for insert
  with check (auth.uid() = user_id);
