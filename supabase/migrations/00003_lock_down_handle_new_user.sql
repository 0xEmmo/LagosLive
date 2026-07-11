-- handle_new_user is only meant to run via the on_auth_user_created trigger
-- (which invokes it as the table owner regardless of these grants). Revoking
-- EXECUTE stops it from being callable directly through PostgREST's
-- /rest/v1/rpc/handle_new_user endpoint by anon/authenticated clients.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
