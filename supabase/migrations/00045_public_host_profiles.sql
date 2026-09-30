-- ===========================================================================
-- 00045 — Public host profiles
-- Optional profile enrichment only: existing hosts and first-time event creators
-- remain valid without completing any of these fields.
-- ===========================================================================

alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists public_bio text,
  add column if not exists instagram_url text,
  add column if not exists tiktok_url text,
  add column if not exists x_url text,
  add column if not exists website_url text,
  add column if not exists public_profile boolean not null default true;

-- A host profile is read through this narrow function rather than exposing the
-- private profiles table to anonymous visitors.
create or replace function public.get_public_host_profile(p_host_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'bio', coalesce(p.public_bio, p.bio),
    'avatar_url', p.avatar_url,
    'instagram_url', p.instagram_url,
    'tiktok_url', p.tiktok_url,
    'x_url', p.x_url,
    'website_url', p.website_url,
    'is_verified', p.host_verification_status = 'verified'
  )
  from public.profiles p
  where p.id = p_host_id
    and p.public_profile = true
    and p.account_status = 'active'
    and p.role in ('organizer', 'admin', 'super_admin');
$$;

revoke all on function public.get_public_host_profile(uuid) from public, anon, authenticated;
grant execute on function public.get_public_host_profile(uuid) to anon, authenticated;

-- Public avatar bucket; upload/replace/delete is restricted to the owner folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-avatars', 'profile-avatars', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists "Public read profile avatars" on storage.objects;
create policy "Public read profile avatars"
  on storage.objects for select
  using (bucket_id = 'profile-avatars');

drop policy if exists "Users upload own profile avatar" on storage.objects;
create policy "Users upload own profile avatar"
  on storage.objects for insert
  with check (
    bucket_id = 'profile-avatars'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users replace own profile avatar" on storage.objects;
create policy "Users replace own profile avatar"
  on storage.objects for update
  using (
    bucket_id = 'profile-avatars'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users delete own profile avatar" on storage.objects;
create policy "Users delete own profile avatar"
  on storage.objects for delete
  using (
    bucket_id = 'profile-avatars'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Keep the existing profile RPC untouched. This separate host-profile RPC
-- avoids changing its return type/signature and keeps first-event signup safe.
create or replace function public.update_public_host_profile(
  p_name text default null,
  p_phone text default null,
  p_bio text default null,
  p_avatar_url text default null,
  p_public_bio text default null,
  p_instagram_url text default null,
  p_tiktok_url text default null,
  p_x_url text default null,
  p_website_url text default null,
  p_public_profile boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  update public.profiles
  set name = coalesce(nullif(btrim(p_name), ''), name),
      phone = coalesce(p_phone, phone),
      bio = coalesce(p_bio, bio),
      avatar_url = coalesce(p_avatar_url, avatar_url),
      public_bio = coalesce(p_public_bio, public_bio),
      instagram_url = coalesce(p_instagram_url, instagram_url),
      tiktok_url = coalesce(p_tiktok_url, tiktok_url),
      x_url = coalesce(p_x_url, x_url),
      website_url = coalesce(p_website_url, website_url),
      public_profile = coalesce(p_public_profile, public_profile)
  where id = auth.uid();
end;
$$;

revoke all on function public.update_public_host_profile(text, text, text, text, text, text, text, text, text, boolean) from public, anon;
grant execute on function public.update_public_host_profile(text, text, text, text, text, text, text, text, text, boolean) to authenticated;
