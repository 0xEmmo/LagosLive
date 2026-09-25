create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  profile_email text;
  profile_name text;
begin
  profile_email := nullif(btrim(coalesce(new.email, '')), '');
  if profile_email is null then
    raise exception 'LagosLive requires an email address for new users.' using errcode = 'P0001';
  end if;

  profile_name := nullif(btrim(coalesce(new.raw_user_meta_data->>'full_name', '')), '');
  if profile_name is null then
    profile_name := nullif(btrim(coalesce(new.raw_user_meta_data->>'name', '')), '');
  end if;
  profile_name := coalesce(profile_name, split_part(profile_email, '@', 1));

  insert into public.profiles (id, name, email, role, account_status)
  values (new.id, left(profile_name, 200), profile_email, 'viewer', 'active')
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke execute on function public.handle_new_user() from public, anon, authenticated;
