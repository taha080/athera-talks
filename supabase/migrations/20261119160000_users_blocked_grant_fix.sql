-- Fix: grant EXECUTE on private.users_blocked to authenticated.
--
-- Regression from 20261119130000 (L8 fix): that migration added
-- private.users_blocked(...) directly into two RLS policies
-- ("Contacts read stories" and "Contacts read story photos"). RLS policy
-- expressions run as the querying user, and EXECUTE on
-- private.users_blocked was revoked from authenticated in
-- 20261020200000_groups_safety_chats.sql and never granted back, so every
-- stories query failed with "permission denied for function users_blocked".
--
-- This is safe: the function lives in the `private` schema, which PostgREST
-- does not expose, so users cannot call it directly through the API — it can
-- only run inside RLS policies and SECURITY DEFINER functions. This is the
-- exact revoke-then-grant pattern already used for private.is_group_admin,
-- private.community_is_member, private.community_is_manager and
-- public.are_contacts.
--
-- Applied live 2026-11-20 ~00:25 PKT (user reported the error in the app).

grant execute on function private.users_blocked(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
