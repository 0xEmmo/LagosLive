-- ===========================================================================
-- LOCAL TEST HARNESS BOOTSTRAP (not a production migration)
-- ===========================================================================
-- Recreates the minimum Supabase platform surface that supabase/migrations
-- depends on, so the RLS/security regression suite can run against a real
-- PostgreSQL instance instead of being reasoned about.
--
-- It mirrors the *actual* Supabase defaults on a hosted project:
--   * roles anon / authenticated / service_role
--   * the `auth` schema (auth.users + auth.uid()/auth.role()/auth.jwt())
--   * the `storage` schema (buckets / objects / foldername())
--   * blanket table+routine grants to the three API roles
--
-- The blanket grants are the important part: the repo contains no GRANTs for
-- the public schema, so on a real project every table is fully granted to
-- `authenticated` and RLS is the ONLY privilege boundary. A harness that
-- omitted them would make every test pass vacuously.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. API roles
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. auth schema
-- ---------------------------------------------------------------------------
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  phone text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb;
$$;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(nullif(auth.jwt() ->> 'role', ''), current_user::text);
$$;

-- ---------------------------------------------------------------------------
-- 3. storage schema
-- ---------------------------------------------------------------------------
create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid,
  created_at timestamptz not null default now()
);

create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select string_to_array(coalesce(name, ''), '/');
$$;

alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;

-- ---------------------------------------------------------------------------
-- 4. Supabase default privileges on the public schema
-- ---------------------------------------------------------------------------
-- The API roles need USAGE on auth/storage: every RLS policy calls
-- auth.uid()/auth.role(), so without this every statement fails closed with
-- "permission denied for schema auth" and the whole suite would pass
-- vacuously instead of exercising the policies.
grant usage on schema auth, storage to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
grant execute on all functions in schema storage to anon, authenticated, service_role;
grant select on auth.users to anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all routines in schema public to anon, authenticated, service_role;

alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on routines to anon, authenticated, service_role;

-- The API roles must never be able to create objects in public.
revoke create on schema public from anon, authenticated;
