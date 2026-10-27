-- Allow a community owner to delete their community.
--
-- The communities table had select, insert and update policies but no
-- delete policy, so deleting was blocked by Row Level Security even for
-- the owner. This adds one owner-only delete policy. The child rows
-- (members, channels, messages, events, voice rooms, reports, bans)
-- are removed by the ON DELETE CASCADE foreign keys defined in
-- 20261024120000_communities.sql; cascade deletes do not need separate
-- policies on the child tables.
--
-- Apply in Supabase Dashboard -> SQL Editor and expect
-- "Success. No rows returned".

drop policy if exists "Owners delete a community" on public.communities;
create policy "Owners delete a community"
  on public.communities for delete to authenticated
  using (owner_id = auth.uid());

notify pgrst, 'reload schema';
