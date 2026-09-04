-- ===========================================================================
-- Event cover images (Batch 17) — IDEMPOTENT / re-runnable.
--
-- Adds the ability for hosts to upload a custom cover image for their events
-- instead of the auto-generated gradient-only cards.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Add cover_url column to parties.
-- ---------------------------------------------------------------------------
alter table public.parties
  add column if not exists cover_url text;

-- ---------------------------------------------------------------------------
-- 2. Create Supabase Storage bucket for event images.
--    The bucket is PUBLIC so guests can read cover images without auth.
--    Uploads are restricted by RLS policies below.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-images',
  'event-images',
  true,
  5242880,  -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Storage RLS policies.
-- ---------------------------------------------------------------------------

-- Anyone can read from the public bucket.
drop policy if exists "Public read for event images" on storage.objects;
create policy "Public read for event images"
  on storage.objects for select
  using (bucket_id = 'event-images');

-- Authenticated users can upload to events/{party_id}/.
-- We verify the party exists AND the uploader is its creator.
drop policy if exists "Organizers upload event images" on storage.objects;
create policy "Organizers upload event images"
  on storage.objects for insert
  with check (
    bucket_id = 'event-images'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = 'events'
    and exists (
      select 1 from public.parties
      where parties.id = ((storage.foldername(name))[2])::bigint
        and parties.created_by = auth.uid()
    )
  );

-- Organizers can update (replace) images on their own events.
drop policy if exists "Organizers replace event images" on storage.objects;
create policy "Organizers replace event images"
  on storage.objects for update
  using (
    bucket_id = 'event-images'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = 'events'
    and exists (
      select 1 from public.parties
      where parties.id = ((storage.foldername(name))[2])::bigint
        and parties.created_by = auth.uid()
    )
  );

-- Organizers can delete images on their own events.
drop policy if exists "Organizers delete event images" on storage.objects;
create policy "Organizers delete event images"
  on storage.objects for delete
  using (
    bucket_id = 'event-images'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = 'events'
    and exists (
      select 1 from public.parties
      where parties.id = ((storage.foldername(name))[2])::bigint
        and parties.created_by = auth.uid()
    )
  );

-- Staff (admin/super_admin) can manage all event images.
drop policy if exists "Staff manage event images" on storage.objects;
create policy "Staff manage event images"
  on storage.objects for all
  using (
    bucket_id = 'event-images'
    and public.has_role(array['admin', 'super_admin'])
  );
