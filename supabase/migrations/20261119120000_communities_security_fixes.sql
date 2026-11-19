-- Communities security fixes (audit 2026-11-19).
--
-- Fixes ten holes in the Communities RLS policies from
-- 20261024120000_communities.sql (helpers hardened in
-- 20261027120000_communities_rls_fix.sql):
--   C1  self-promotion to owner/admin via the join INSERT
--   C2  admins stealing ownership (role / owner_id changes)
--   H1  bans never enforced
--   H2  managers rewriting any member's message
--   H3  admins deleting the owner's membership
--   M9  RSVP to a private community's event with only its UUID
--   M10 members pinning their own message / stuffing poll votes at insert
--   L4  invite codes exposed in list queries and only ~24 bits
--   L5  event authorship spoofing (created_by)
--   L6  reports referencing a message from another community
--
-- Apply in Supabase Dashboard -> SQL Editor and expect
-- "Success. No rows returned". Safe to run more than once: every policy
-- drop, trigger drop and function replace is idempotent, and the legacy
-- cleanup DELETE below only removes rows that are banned already.
--
-- APP FOLLOW-UPS (not in this migration; no app code is changed here):
--   1. joinCommunity in src/services/communityBackend.ts should call
--      public.join_community_by_invite(community_id, invite_code) instead
--      of inserting into community_members directly. Until then, public
--      joins and private/invite-only join *requests* (role 'pending',
--      which grants no access) keep working through the direct INSERT
--      policy below; only the server-verified instant join for a correct
--      invite code needs the RPC.
--   2. listCommunities still selects invite_code directly, so the code is
--      still visible in list responses until the app stops selecting it
--      and uses public.community_invite_code(id) (owner/manager only)
--      where the code is actually needed. The default for NEW communities
--      is now 12 hex chars (~48 bits) instead of 6 (~24 bits); codes of
--      existing communities are unchanged so shared codes keep working.

-- ---------------------------------------------------------------------------
-- H1 (part 1): bans are now checked by the membership helpers.
-- The SECURITY DEFINER + fixed search_path form is kept exactly as in
-- 20261027120000_communities_rls_fix.sql, otherwise the infinite-recursion
-- error (42P17) on community_members comes back. A banned user is no
-- longer a member (or a manager) for any policy that calls these helpers.
-- ---------------------------------------------------------------------------

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
  )
  and not exists (
    select 1 from public.community_bans b
    where b.community_id = cid and b.user_id = auth.uid()
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
  )
  and not exists (
    select 1 from public.community_bans b
    where b.community_id = cid and b.user_id = auth.uid()
  );
$$;

revoke all on function private.community_is_manager(uuid) from public, anon, authenticated;
grant execute on function private.community_is_manager(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- C1: joining a community can no longer self-grant a privileged role.
--
-- The old policy only checked user_id = auth.uid(), so any signed-in user
-- could insert role 'owner' (or 'admin') for any community. The new policy:
--   * role 'member' only for public communities;
--   * role 'pending' (a join request -- pending grants no access, because
--     community_is_member excludes it) for any visibility, so the app's
--     current private / invite-only join requests keep working;
--   * role 'owner' only when the inserter owns the community -- this is
--     the createCommunity flow, which inserts its own owner row right
--     after creating the community;
--   * never for a banned user.
-- Private / invite-only instant joins go through the RPC below instead.
-- ---------------------------------------------------------------------------

drop policy if exists "Join a community" on public.community_members;
create policy "Join a community"
  on public.community_members for insert to authenticated
  with check (
    user_id = auth.uid()
    and not exists (
      select 1 from public.community_bans b
      where b.community_id = community_members.community_id
        and b.user_id = auth.uid()
    )
    and (
      (
        role in ('member', 'pending')
        and exists (
          select 1 from public.communities c
          where c.id = community_members.community_id
            and (c.visibility = 'public' or role = 'pending')
        )
      )
      or (
        role = 'owner'
        and exists (
          select 1 from public.communities c
          where c.id = community_members.community_id
            and c.owner_id = auth.uid()
        )
      )
    )
  );

-- Server-verified join for every visibility. SECURITY DEFINER so it can
-- check the invite code of a private / invite-only community the caller
-- cannot read directly; it enforces every rule itself instead of relying
-- on the INSERT policy above. Returns the role the caller now has.
--   public      -> 'member'
--   invite-only -> 'member' only with the correct code (case-insensitive)
--   private     -> 'pending' (a manager approves it)
-- Re-joining while already a member returns the existing role.
create or replace function public.join_community_by_invite(p_community_id uuid, p_invite_code text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visibility text;
  v_invite_code text;
  v_existing text;
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  select visibility, invite_code into v_visibility, v_invite_code
  from public.communities
  where id = p_community_id;
  if v_visibility is null then
    raise exception 'Community not found';
  end if;
  if exists (
    select 1 from public.community_bans b
    where b.community_id = p_community_id and b.user_id = auth.uid()
  ) then
    raise exception 'You are banned from this community';
  end if;
  select role into v_existing
  from public.community_members
  where community_id = p_community_id and user_id = auth.uid();
  if v_existing is not null then
    return v_existing;
  end if;
  if v_visibility = 'public' then
    v_role := 'member';
  elsif v_visibility = 'invite-only' then
    if upper(btrim(coalesce(p_invite_code, ''))) = '' then
      raise exception 'An invite code is required for this community';
    end if;
    if upper(btrim(p_invite_code)) <> upper(v_invite_code) then
      raise exception 'That invite code does not match this community';
    end if;
    v_role := 'member';
  else -- private: join request, a manager approves it.
    v_role := 'pending';
  end if;
  insert into public.community_members (community_id, user_id, role)
  values (p_community_id, auth.uid(), v_role);
  return v_role;
end;
$$;

revoke all on function public.join_community_by_invite(uuid, text) from public, anon, authenticated;
grant execute on function public.join_community_by_invite(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- C2 (part 1): only the owner may grant, remove, or touch the owner role.
-- A membership row cannot be moved to another community or user either.
-- This guards the "Managers manage membership" policy, which on its own
-- lets any admin change any role. Ownership transfer itself stays a
-- two-step flow: the owner promotes the successor, then demotes
-- themselves (both steps pass because the caller is the owner).
-- NOTE: changing communities.owner_id does not by itself swap the
-- membership roles; a transfer flow must update those rows too.
-- ---------------------------------------------------------------------------

create or replace function private.enforce_community_member_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner
  from public.communities
  where id = new.community_id;
  if new.community_id is distinct from old.community_id
     or new.user_id is distinct from old.user_id then
    raise exception 'A membership cannot be moved to another community or user';
  end if;
  if old.user_id = v_owner and auth.uid() is distinct from v_owner then
    raise exception 'Only the community owner can change the owner''s membership';
  end if;
  if new.role = 'owner' and old.role is distinct from 'owner' then
    if auth.uid() is distinct from v_owner then
      raise exception 'Only the community owner can grant the owner role';
    end if;
  end if;
  if old.role = 'owner' and new.role is distinct from 'owner' then
    if auth.uid() is distinct from v_owner then
      raise exception 'Only the community owner can remove the owner role';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists community_members_role_guard on public.community_members;
create trigger community_members_role_guard
  before update on public.community_members
  for each row execute function private.enforce_community_member_role_change();

-- ---------------------------------------------------------------------------
-- C2 (part 2): only the owner may transfer ownership or change the
-- visibility / invite code of a community. Managers keep editing the
-- other settings (slow mode, word filter, name, description), which the
-- app's setSlowMode / setWordFilter calls rely on.
-- ---------------------------------------------------------------------------

create or replace function private.enforce_community_owner_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_id is distinct from old.owner_id
     and auth.uid() is distinct from old.owner_id then
    raise exception 'Only the community owner can transfer ownership';
  end if;
  if (new.visibility is distinct from old.visibility
      or new.invite_code is distinct from old.invite_code)
     and auth.uid() is distinct from old.owner_id then
    raise exception 'Only the community owner can change visibility or the invite code';
  end if;
  return new;
end;
$$;

drop trigger if exists communities_owner_guard on public.communities;
create trigger communities_owner_guard
  before update on public.communities
  for each row execute function private.enforce_community_owner_change();

-- ---------------------------------------------------------------------------
-- H1 (part 2): a ban now removes the membership row, so the banned user
-- loses read/post access immediately. The owner's row is never removed
-- this way: deleting it would lock the owner out of their own community
-- (see H3), and un-banning restores a kept row but not a deleted one.
-- The app's banMember already deletes the row itself after inserting the
-- ban; this trigger makes the removal happen even if that second call
-- never runs. One-time cleanup for bans created before this migration,
-- when no such removal happened.
-- ---------------------------------------------------------------------------

create or replace function private.remove_banned_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner
  from public.communities
  where id = new.community_id;
  if new.user_id is distinct from v_owner then
    delete from public.community_members
    where community_id = new.community_id and user_id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists community_bans_remove_member on public.community_bans;
create trigger community_bans_remove_member
  after insert on public.community_bans
  for each row execute function private.remove_banned_member();

delete from public.community_members m
where exists (
  select 1 from public.community_bans b
  where b.community_id = m.community_id and b.user_id = m.user_id
)
and m.user_id <> (
  select owner_id from public.communities c where c.id = m.community_id
);

-- The "Managers manage membership" UPDATE policy also must not
-- re-activate a banned user (e.g. approving a pending row that was
-- banned before this migration). Managers can still mute / change the
-- role of ordinary members exactly as before.
drop policy if exists "Managers manage membership" on public.community_members;
create policy "Managers manage membership"
  on public.community_members for update to authenticated
  using (private.community_is_manager(community_id))
  with check (
    private.community_is_manager(community_id)
    and not exists (
      select 1 from public.community_bans b
      where b.community_id = community_members.community_id
        and b.user_id = community_members.user_id
    )
  );

-- ---------------------------------------------------------------------------
-- H2: a message update may now only pin/unpin it, or change the caller's
-- own poll vote. Body, sender, channel, poll options and timestamp can
-- no longer be rewritten by anyone, so a manager can no longer edit a
-- member's message and impersonate them.
--
-- The app's togglePin updates only `pinned` and keeps working through
-- the unchanged "Managers pin channel messages" policy. The app's
-- votePoll updates only `poll_votes`; it used to work only for managers
-- (the pin policy was the only UPDATE policy), so a new "Members vote in
-- polls" policy lets ordinary members vote too -- the trigger still
-- limits every vote to the caller's own entry, so nobody can stuff or
-- erase another member's vote.
-- ---------------------------------------------------------------------------

create or replace function private.enforce_channel_message_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_community_id uuid;
begin
  if new.body is distinct from old.body
     or new.sender_id is distinct from old.sender_id
     or new.channel_id is distinct from old.channel_id
     or new.poll_options is distinct from old.poll_options
     or new.created_at is distinct from old.created_at then
    raise exception 'Channel messages cannot be edited or moved';
  end if;
  if new.pinned is distinct from old.pinned then
    select community_id into v_community_id
    from public.community_channels
    where id = old.channel_id;
    if not private.community_is_manager(v_community_id) then
      raise exception 'Only a community owner or admin can pin a message';
    end if;
  end if;
  if new.poll_votes is distinct from old.poll_votes then
    if (new.poll_votes - auth.uid()::text) is distinct from (old.poll_votes - auth.uid()::text) then
      raise exception 'A vote can only change your own entry';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists community_channel_messages_update_guard on public.community_channel_messages;
create trigger community_channel_messages_update_guard
  before update on public.community_channel_messages
  for each row execute function private.enforce_channel_message_update();

drop policy if exists "Members vote in polls" on public.community_channel_messages;
create policy "Members vote in polls"
  on public.community_channel_messages for update to authenticated
  using (exists (
    select 1 from public.community_channels c
    where c.id = channel_id and private.community_is_member(c.community_id)
  ))
  with check (exists (
    select 1 from public.community_channels c
    where c.id = channel_id and private.community_is_member(c.community_id)
  ));

-- ---------------------------------------------------------------------------
-- H3: an admin can no longer delete the owner's membership row and lock
-- the owner out. The owner may still remove their own row (leaving), and
-- managers can still remove any other member exactly as before.
-- ---------------------------------------------------------------------------

drop policy if exists "Managers remove membership" on public.community_members;
create policy "Managers remove membership"
  on public.community_members for delete to authenticated
  using (
    private.community_is_manager(community_id)
    and (
      user_id <> (select owner_id from public.communities where id = community_id)
      or user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- M9: an RSVP now requires membership of the event's community, on both
-- the read side (unchanged) and the write side (fixed). Knowing an event
-- UUID is no longer enough to RSVP to a private community's event.
-- ---------------------------------------------------------------------------

drop policy if exists "Members manage their RSVP" on public.community_event_rsvps;
create policy "Members manage their RSVP"
  on public.community_event_rsvps for all to authenticated
  using (user_id = auth.uid() and exists (
    select 1 from public.community_events e
    where e.id = event_id and private.community_is_member(e.community_id)
  ))
  with check (user_id = auth.uid() and exists (
    select 1 from public.community_events e
    where e.id = event_id and private.community_is_member(e.community_id)
  ));

-- ---------------------------------------------------------------------------
-- M10: members can no longer pin their own message or stuff fake poll
-- votes at insert. The app's sendMessage / createPoll already insert
-- pinned = false and poll_votes = '{}', so this changes nothing for them;
-- only managers may set pinned afterwards (via the H2 guard above).
-- ---------------------------------------------------------------------------

create or replace function private.force_channel_message_defaults()
returns trigger
language plpgsql
as $$
begin
  new.pinned := false;
  new.poll_votes := '{}'::jsonb;
  return new;
end;
$$;

drop trigger if exists community_channel_messages_defaults on public.community_channel_messages;
create trigger community_channel_messages_defaults
  before insert on public.community_channel_messages
  for each row execute function private.force_channel_message_defaults();

-- ---------------------------------------------------------------------------
-- L4: invite codes for NEW communities are 12 hex chars (~48 bits)
-- instead of 6 (~24 bits). Existing codes are left alone so codes
-- already shared keep working. Plus an owner/manager-only lookup, so
-- the app can stop selecting invite_code in its list query (see the
-- header note): RLS is row-level, so no SELECT policy can hide one
-- column -- the column must simply not be selected for strangers.
-- ---------------------------------------------------------------------------

alter table public.communities
  alter column invite_code set default upper(substr(md5(random()::text || gen_random_uuid()::text), 1, 12));

create or replace function public.community_invite_code(p_community_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select c.invite_code
  from public.communities c
  where c.id = p_community_id
    and (c.owner_id = auth.uid() or private.community_is_manager(p_community_id));
$$;

revoke all on function public.community_invite_code(uuid) from public, anon, authenticated;
grant execute on function public.community_invite_code(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- L5: event authorship can no longer be spoofed. The old single FOR ALL
-- policy let any manager insert an event with any created_by. It is now
-- split: INSERT requires created_by = auth.uid(); UPDATE / DELETE stay
-- manager-only, and a trigger forbids changing created_by or moving the
-- event to another community afterwards. The app's createEvent already
-- inserts created_by = me.id.
-- ---------------------------------------------------------------------------

drop policy if exists "Managers manage events" on public.community_events;
drop policy if exists "Managers create events" on public.community_events;
create policy "Managers create events"
  on public.community_events for insert to authenticated
  with check (private.community_is_manager(community_id) and created_by = auth.uid());
drop policy if exists "Managers update events" on public.community_events;
create policy "Managers update events"
  on public.community_events for update to authenticated
  using (private.community_is_manager(community_id))
  with check (private.community_is_manager(community_id));
drop policy if exists "Managers delete events" on public.community_events;
create policy "Managers delete events"
  on public.community_events for delete to authenticated
  using (private.community_is_manager(community_id));

create or replace function private.enforce_community_event_authorship()
returns trigger
language plpgsql
as $$
begin
  if new.created_by is distinct from old.created_by then
    raise exception 'An event''s author cannot be changed';
  end if;
  if new.community_id is distinct from old.community_id then
    raise exception 'An event cannot be moved to another community';
  end if;
  return new;
end;
$$;

drop trigger if exists community_events_authorship_guard on public.community_events;
create trigger community_events_authorship_guard
  before update on public.community_events
  for each row execute function private.enforce_community_event_authorship();

-- ---------------------------------------------------------------------------
-- L6: a report can no longer reference a message from another community.
-- message_id NULL (a report about the community itself) stays allowed;
-- the app's reportMessage always passes a message from that community.
-- ---------------------------------------------------------------------------

drop policy if exists "Members file community reports" on public.community_reports;
create policy "Members file community reports"
  on public.community_reports for insert to authenticated
  with check (
    reporter_id = auth.uid()
    and private.community_is_member(community_id)
    and (
      message_id is null
      or exists (
        select 1
        from public.community_channel_messages m
        join public.community_channels c on c.id = m.channel_id
        where m.id = community_reports.message_id
          and c.community_id = community_reports.community_id
      )
    )
  );

notify pgrst, 'reload schema';
