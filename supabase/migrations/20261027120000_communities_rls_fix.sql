-- Fix Communities loading: the RLS helper functions were not SECURITY DEFINER.
--
-- private.community_is_member / private.community_is_manager query
-- public.community_members, and the RLS policies on community_members call
-- those same functions. Without SECURITY DEFINER Postgres evaluates the
-- policy function under RLS again, which recurses until it throws
-- "infinite recursion detected in policy for relation community_members"
-- (42P17) on any authenticated query that touches membership rows -- the
-- communities list, creating a community, and creating channels. The app
-- then showed only the generic "Communities could not be loaded." text.
--
-- This recreates both helpers exactly as the other RLS helpers in this
-- project are written (see 20261020200000_groups_safety_chats.sql):
-- SECURITY DEFINER with a fixed search_path, executable by authenticated
-- users only. No table or policy changes.
--
-- Apply in Supabase Dashboard -> SQL Editor and expect
-- "Success. No rows returned".

create or replace function private.community_is_member(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.community_members
    where community_id = cid and user_id = auth.uid() and role <> 'pending'
  );
$$;

revoke all on function private.community_is_member(uuid) from public, anon, authenticated;
grant execute on function private.community_is_member(uuid) to authenticated;

create or replace function private.community_is_manager(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.community_members
    where community_id = cid and user_id = auth.uid() and role in ('owner', 'admin')
  );
$$;

revoke all on function private.community_is_manager(uuid) from public, anon, authenticated;
grant execute on function private.community_is_manager(uuid) to authenticated;

notify pgrst, 'reload schema';
