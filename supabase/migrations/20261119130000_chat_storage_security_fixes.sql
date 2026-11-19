-- Chat / messages / storage / stories / calls security fixes (audit M4-M8, M11-M13, L2, L3, L7-L12).
--
-- Apply in the Supabase SQL editor (or `supabase db push`). Safe to run more
-- than once: every policy / function / trigger / index below is dropped or
-- replaced first, or guarded with IF EXISTS / IF NOT EXISTS.
--
-- Manual follow-ups (NOT done by this file — see the PR description):
--  * M4: group photos now live in a private bucket. The app still loads them
--    with storage getPublicUrl (src/services/liveBackend.ts groupPhotoUrl),
--    so group photos will stop loading until the app switches to
--    createSignedUrl (as wallpapers and chat media already do).
--  * M8/M12: delete_expired_stories() and delete_old_call_signals() below are
--    the retention cleanup. They need a pg_cron schedule (may not be
--    available on the free plan) or a regular manual / Edge Function call.
--    Until one runs, the RLS expiry checks in this file are the enforcement.
--  * L7: send-push deletes expired endpoints with .eq('endpoint', ...) and
--    no user filter. Now that one endpoint can belong to several users, that
--    delete must also filter by user_id (Edge Function change, other owner).
--  * search_profiles: restored to the partial/prefix search from
--    20261020270000_search_requires_contact.sql (exact match first, then
--    prefix matches, then contains matches), keeping the is_premium column
--    added by 20261020300000_premium_tier.sql. NOTE: 20261020280000 recorded
--    an exact-match-only function "matching the live function", so exact
--    search may have been deliberate at some point; if the product decision
--    is exact-only, revert just the search_profiles block.
--
-- What this file deliberately does NOT change:
--  * No app code (liveBackend.ts / storyBackend.ts / send-push).
--  * No previously applied migration is edited.
--  * No direct SQL deletion of storage objects: Supabase exposes no
--    storage.delete_object-style SQL function, and deleting rows from
--    storage.objects is not a documented server-side file delete. M11 is
--    therefore enforced at the RLS layer (below): media objects are readable
--    only while a live (non-deleted) message still references their path.
--    The app already tries a client-side storage.remove() in
--    deleteForEveryone (liveBackend.ts); the RLS check is the guarantee.

-- ===========================================================================
-- Helpers / indexes used by the policies below
-- ===========================================================================

-- Lets the M11 "still referenced by a live message" check in the media
-- storage policies use an index lookup instead of a sequential scan.
create index if not exists messages_media_path_idx
  on public.messages (media_path)
  where media_path is not null;

-- Lets the M8 expiry check in the story-photos storage policy look a photo
-- up by its media_path.
create index if not exists stories_media_path_idx
  on public.stories (media_path);

-- ===========================================================================
-- M4 — group-photos bucket must not be public
-- ===========================================================================
-- The bucket was created public, so the members-only photo policy was
-- bypassed entirely via the predictable <conversation-uuid>/photo.jpg URL.
update storage.buckets set public = false where id = 'group-photos';

-- ===========================================================================
-- L2 — are_contacts(a, b) must not be a social-graph oracle
-- ===========================================================================
-- Internal callers audited before adding this check (all remaining direct
-- users pass auth.uid() as one side, or use the internal variant):
-- contact_member, list_my_conversations, start_direct_conversation,
-- create_group, add_group_member, stories policies, and the three
-- enforce_contact_* triggers (switched to the internal variant below).
-- The call_signals insert policy no longer calls are_contacts at all
-- (it now uses conversation_visible, which is equivalent for a direct
-- two-member chat and is caller-anchored).
-- auth.uid() is null for service_role / postgres, so server-side callers
-- keep working; only direct authenticated calls are restricted.

create or replace function private.are_contacts_internal(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.contact_requests
    where status = 'accepted'
      and least(from_id, to_id) = least(a, b)
      and greatest(from_id, to_id) = greatest(a, b)
  );
$$;

revoke all on function private.are_contacts_internal(uuid, uuid) from public, anon, authenticated;

create or replace function public.are_contacts(a uuid, b uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if a is null or b is null then
    return false;
  end if;
  -- A signed-in caller may only ask about pairs that include themselves.
  -- Server-side code that must check two other users uses
  -- private.are_contacts_internal instead.
  if auth.uid() is not null and a <> auth.uid() and b <> auth.uid() then
    raise exception 'are_contacts may only be called about yourself';
  end if;
  return private.are_contacts_internal(a, b);
end;
$$;

revoke all on function public.are_contacts(uuid, uuid) from public;
grant execute on function public.are_contacts(uuid, uuid) to authenticated;

-- Internal callers that pass row values (not necessarily the caller) now
-- use the internal variant. Behaviour is otherwise identical to the
-- versions in 20261020270000_search_requires_contact.sql.
-- (enforce_contact_on_member is redefined again below for M13.)

create or replace function public.enforce_contact_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  chat_kind text;
begin
  if not exists (
    select 1 from public.conversation_members
    where conversation_id = new.conversation_id and user_id = new.sender_id
  ) then
    raise exception 'Not a member of this conversation';
  end if;

  select kind into chat_kind
  from public.conversations
  where id = new.conversation_id;

  if chat_kind = 'group' then
    return new;
  end if;

  if not exists (
    select 1
    from public.conversation_members peer
    where peer.conversation_id = new.conversation_id
      and peer.user_id <> new.sender_id
      and private.are_contacts_internal(new.sender_id, peer.user_id)
  ) then
    raise exception 'You can only message an accepted contact';
  end if;

  if exists (
    select 1
    from public.conversation_members peer
    where peer.conversation_id = new.conversation_id
      and peer.user_id <> new.sender_id
      and private.users_blocked(new.sender_id, peer.user_id)
  ) then
    raise exception 'This chat is blocked';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_contact_on_call()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.conversations
    where id = new.conversation_id and kind = 'group'
  ) then
    raise exception 'Group calls are not available';
  end if;
  if not private.are_contacts_internal(new.from_id, new.to_id) then
    raise exception 'Calls are only available between accepted contacts';
  end if;
  if private.users_blocked(new.from_id, new.to_id) then
    raise exception 'This chat is blocked';
  end if;
  if not exists (
    select 1 from public.conversation_members
    where conversation_id = new.conversation_id and user_id = new.from_id
  ) or not exists (
    select 1 from public.conversation_members
    where conversation_id = new.conversation_id and user_id = new.to_id
  ) then
    raise exception 'That call is not in a shared chat';
  end if;
  return new;
end;
$$;

-- ===========================================================================
-- M13 — enforce_contact_on_member checked only ONE arbitrary peer
-- ===========================================================================
-- The old version picked a single peer with LIMIT 1 and no ORDER BY, so
-- the contact gate on group membership was non-deterministic. Groups are
-- now skipped here entirely: create_group / add_group_member already
-- require the acting admin to be contacts with the new member. Direct
-- chats check EVERY other member, deterministically.

create or replace function public.enforce_contact_on_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  chat_kind text;
begin
  select kind into chat_kind
  from public.conversations
  where id = new.conversation_id;

  -- Groups only require the creator/admin to be contacts with the new
  -- member (enforced in create_group / add_group_member), not every pair.
  if chat_kind = 'group' then
    return new;
  end if;

  if exists (
    select 1
    from public.conversation_members m
    where m.conversation_id = new.conversation_id
      and m.user_id <> new.user_id
      and not private.are_contacts_internal(new.user_id, m.user_id)
  ) then
    raise exception 'Contacts must accept a request before a chat can start';
  end if;
  return new;
end;
$$;

-- ===========================================================================
-- L3 — declined contact requests: 7-day cooldown before re-sending
-- ===========================================================================
-- request_contact() flipped a declined row straight back to pending, so a
-- declined request could be re-sent immediately, forever. The decline time
-- is the row's updated_at (decline_contact sets updated_at = now()).

create or replace function public.request_contact(other_id uuid)
returns public.contact_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.contact_requests;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if other_id is null or other_id = auth.uid() then
    raise exception 'You cannot add yourself';
  end if;
  if not exists (select 1 from public.profiles where id = other_id) then
    raise exception 'User not found';
  end if;

  select * into row
  from public.contact_requests
  where least(from_id, to_id) = least(auth.uid(), other_id)
    and greatest(from_id, to_id) = greatest(auth.uid(), other_id);

  if row.id is null then
    insert into public.contact_requests (from_id, to_id, status)
    values (auth.uid(), other_id, 'pending')
    returning * into row;
    return row;
  end if;

  if row.status = 'accepted' or (row.status = 'pending' and row.from_id = auth.uid()) then
    return row;
  end if;

  if row.status = 'pending' and row.to_id = auth.uid() then
    return row;
  end if;

  if row.status = 'declined' and row.updated_at > now() - interval '7 days' then
    raise exception 'That request was declined recently. You can send it again 7 days after it was declined.';
  end if;

  update public.contact_requests
    set from_id = auth.uid(),
        to_id = other_id,
        status = 'pending',
        updated_at = now()
    where id = row.id
    returning * into row;
  return row;
end;
$$;

-- ===========================================================================
-- M5 + M11 — chat media storage: ex-contacts / blocked users lose access,
-- and "delete for everyone" must also hide the file
-- ===========================================================================
-- The three SELECT policies used is_member (membership alone), so anyone
-- who was ever a member kept reading voice notes / images / videos after
-- the contact ended or a block. They now use conversation_visible, which
-- additionally requires a current accepted contact for direct chats.
-- They also require the object path to still be referenced by a live
-- (non-deleted) message of the matching kind: delete_message_for_everyone
-- sets media_path = null, so a deleted message's file stops being readable
-- even if the object was never removed from storage. Upload / delete
-- policies are unchanged (uploads happen before the message row exists,
-- so a reference check there would break sending).

drop policy if exists "Members read voice messages" on storage.objects;
create policy "Members read voice messages"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'voice-messages'
    and public.conversation_visible(((storage.foldername(name))[1])::uuid)
    and exists (
      select 1 from public.messages m
      where m.media_path = storage.objects.name
        and m.kind = 'voice'
        and m.deleted_at is null
    )
  );

drop policy if exists "Members read chat images" on storage.objects;
create policy "Members read chat images"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'chat-images'
    and public.conversation_visible(((storage.foldername(name))[1])::uuid)
    and exists (
      select 1 from public.messages m
      where m.media_path = storage.objects.name
        and m.kind = 'image'
        and m.deleted_at is null
    )
  );

drop policy if exists "Members read chat videos" on storage.objects;
create policy "Members read chat videos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'chat-videos'
    and public.conversation_visible(((storage.foldername(name))[1])::uuid)
    and exists (
      select 1 from public.messages m
      where m.media_path = storage.objects.name
        and m.kind = 'video'
        and m.deleted_at is null
    )
  );

-- ===========================================================================
-- M6 — reactions: blocked / ex-contact users can no longer read or post them
-- ===========================================================================
-- Both policies were gated only by is_member. Reading now requires the
-- conversation to still be visible (current accepted contact for direct
-- chats); reacting additionally requires may_send (so blocked users cannot
-- react either). Reactions on deleted messages are hidden and cannot be
-- added. (Change / remove own reaction policies are unchanged: they only
-- touch the caller's own row, and the read policy already hides reactions
-- on deleted or no-longer-visible messages.)

drop policy if exists "Members read reactions" on public.message_reactions;
create policy "Members read reactions"
  on public.message_reactions for select
  to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_id
        and m.deleted_at is null
        and public.conversation_visible(m.conversation_id)
    )
  );

drop policy if exists "React as yourself" on public.message_reactions;
create policy "React as yourself"
  on public.message_reactions for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.messages m
      where m.id = message_id
        and m.deleted_at is null
        and public.may_send(m.conversation_id)
    )
  );

-- ===========================================================================
-- M7 — call history forgery: validate logged calls server-side
-- ===========================================================================
-- The INSERT policy trusted every client-supplied timestamp / duration /
-- status. A BEFORE INSERT trigger now validates the row.
--
-- IMPORTANT correction to the audit's suggested check: the app does NOT
-- measure duration from started_at. CallContext.recordCall computes
-- durationSeconds from connectedAt (the answer time): talk time only,
-- 0 when unanswered. ended_at - started_at is ring + talk time, so
-- comparing it to duration_seconds would reject legitimate answered
-- calls. The trigger therefore validates duration against
-- ended_at - answered_at, and requires duration 0 when unanswered.
-- ended_at allows 5 minutes of client clock skew; anything further ahead
-- is rejected as "in the future".

create or replace function public.validate_call_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  total_seconds numeric;
  talk_seconds numeric;
  member_count int;
begin
  if new.caller_id is null or new.callee_id is null or new.caller_id = new.callee_id then
    raise exception 'A call needs two different participants';
  end if;
  if new.caller_id <> auth.uid() and new.callee_id <> auth.uid() then
    raise exception 'You can only log a call you were on';
  end if;

  if not exists (
    select 1 from public.conversations c
    where c.id = new.conversation_id and c.kind = 'direct'
  ) then
    raise exception 'Calls can only be logged in a direct chat';
  end if;

  select count(*) into member_count
  from public.conversation_members m
  where m.conversation_id = new.conversation_id;
  if member_count <> 2
     or not exists (
       select 1 from public.conversation_members m
       where m.conversation_id = new.conversation_id and m.user_id = new.caller_id
     )
     or not exists (
       select 1 from public.conversation_members m
       where m.conversation_id = new.conversation_id and m.user_id = new.callee_id
     )
  then
    raise exception 'Caller and callee must be the two members of this chat';
  end if;

  if new.started_at is null or new.ended_at is null then
    raise exception 'A call needs a start and end time';
  end if;
  if new.ended_at < new.started_at then
    raise exception 'A call cannot end before it starts';
  end if;
  -- Client clocks can run a little ahead; allow 5 minutes of skew.
  if new.ended_at > now() + interval '5 minutes' then
    raise exception 'A call cannot end in the future';
  end if;
  total_seconds := extract(epoch from new.ended_at - new.started_at);
  if total_seconds > 86400 then
    raise exception 'A call cannot last longer than 24 hours';
  end if;
  if new.duration_seconds < 0 or new.duration_seconds > 86400 then
    raise exception 'Call duration is out of range';
  end if;
  if new.duration_seconds > total_seconds + 2 then
    raise exception 'Call duration is longer than the call';
  end if;

  if new.answered_at is null then
    if new.status = 'completed' then
      raise exception 'A completed call must have an answer time';
    end if;
    if new.duration_seconds <> 0 then
      raise exception 'An unanswered call has no talk time';
    end if;
  else
    if new.answered_at > new.ended_at then
      raise exception 'A call cannot be answered after it ends';
    end if;
    -- 60s grace covers the app's startedAt fallback (started = ended when
    -- the start timestamp was never recorded).
    if new.answered_at < new.started_at - interval '60 seconds' then
      raise exception 'A call cannot be answered before it starts';
    end if;
    if new.status <> 'completed' then
      raise exception 'An answered call is completed';
    end if;
    talk_seconds := extract(epoch from new.ended_at - new.answered_at);
    if abs(new.duration_seconds - talk_seconds) > 2 then
      raise exception 'Call duration does not match the answer and end times';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.validate_call_log() from public, anon, authenticated;

drop trigger if exists calls_validate_log on public.calls;
create trigger calls_validate_log
  before insert on public.calls
  for each row execute function public.validate_call_log();

-- ===========================================================================
-- M8 + L8 + L11 + L12 — stories: expiry at the RLS layer, blocks, server
-- timestamps, and a guarded UUID cast
-- ===========================================================================

-- M8: contacts can no longer read expired stories. The author keeps
-- reading their own expired rows (needed to see/delete them); the expiry
-- check applies to the contacts branch only.
-- L8: a blocked author is hidden from contacts (both directions of the
-- block, via private.users_blocked).
drop policy if exists "Contacts read stories" on public.stories;
create policy "Contacts read stories"
  on public.stories for select to authenticated
  using (
    author_id = auth.uid()
    or (
      public.are_contacts(auth.uid(), author_id)
      and not private.users_blocked(auth.uid(), author_id)
      and expires_at > now()
    )
  );

-- M8: a view can only be recorded on a story that has not expired yet.
drop policy if exists "Record your own story view" on public.story_views;
create policy "Record your own story view"
  on public.story_views for insert to authenticated
  with check (
    viewer_id = auth.uid()
    and exists (
      select 1 from public.stories s
      where s.id = story_id
        and s.expires_at > now()
        and (s.author_id = auth.uid() or public.are_contacts(auth.uid(), s.author_id))
    )
  );

-- M8 + L8 + L12: story photos. Contacts must be unblocked AND the photo
-- must belong to a story that has not expired. The folder segment is only
-- cast to uuid after a UUID-regex guard, so a non-UUID folder name returns
-- false instead of erroring the whole query. The author branch is
-- unchanged (own photos, no expiry check — the app deletes the object
-- when the story is deleted).
drop policy if exists "Contacts read story photos" on storage.objects;
create policy "Contacts read story photos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'stories'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or (
        (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        and public.are_contacts(auth.uid(), ((storage.foldername(name))[1])::uuid)
        and not private.users_blocked(auth.uid(), ((storage.foldername(name))[1])::uuid)
        and exists (
          select 1 from public.stories s
          where s.media_path = storage.objects.name
            and s.expires_at > now()
        )
      )
    )
  );

-- L11: stories must not accept caller-supplied timestamps. The trigger
-- forces created_at = now() and expires_at = created_at + 24 hours, which
-- satisfies the table CHECK (expires_at > created_at and
-- expires_at <= created_at + 24 hours). The app already sends its own
-- values; they are overridden server-side and the returned row carries
-- the server values.
create or replace function public.enforce_story_timestamps()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.created_at := now();
  new.expires_at := new.created_at + interval '24 hours';
  return new;
end;
$$;

revoke all on function public.enforce_story_timestamps() from public, anon, authenticated;

drop trigger if exists stories_force_server_timestamps on public.stories;
create trigger stories_force_server_timestamps
  before insert on public.stories
  for each row execute function public.enforce_story_timestamps();

-- M8 cleanup: delete expired stories (their views go with them via the
-- ON DELETE CASCADE on story_views, deleted explicitly first for clarity).
-- Schedule with pg_cron if available, or call regularly another way; until
-- then the RLS expiry checks above are the enforcement.
create or replace function public.delete_expired_stories()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.story_views v
  using public.stories s
  where v.story_id = s.id
    and s.expires_at <= now();
  delete from public.stories
  where expires_at <= now();
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.delete_expired_stories() from public;
grant execute on function public.delete_expired_stories() to authenticated, service_role;

-- ===========================================================================
-- M12 — call_signals: readable forever, no expiry, no DELETE policy
-- ===========================================================================
-- SELECT now requires the caller to be a party, the conversation to still
-- be visible (current membership + accepted contact), and the signal to be
-- less than 24 hours old. The INSERT policy no longer calls
-- are_contacts(from_id, to_id) on row values (see L2 note above); for a
-- direct two-member chat conversation_visible is equivalent. A DELETE
-- policy lets either party delete their own signals.

drop policy if exists "Read call signals sent to you" on public.call_signals;
create policy "Read call signals sent to you"
  on public.call_signals for select
  to authenticated
  using (
    (to_id = auth.uid() or from_id = auth.uid())
    and public.conversation_visible(conversation_id)
    and created_at > now() - interval '24 hours'
  );

drop policy if exists "Send a call signal to a contact" on public.call_signals;
create policy "Send a call signal to a contact"
  on public.call_signals for insert
  to authenticated
  with check (
    from_id = auth.uid()
    and public.conversation_visible(conversation_id)
    and not public.direct_chat_blocked(conversation_id)
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.kind = 'direct'
    )
    and exists (
      select 1 from public.conversation_members peer
      where peer.conversation_id = call_signals.conversation_id
        and peer.user_id = to_id
    )
  );

grant delete on public.call_signals to authenticated;

drop policy if exists "Delete your own call signals" on public.call_signals;
create policy "Delete your own call signals"
  on public.call_signals for delete
  to authenticated
  using (from_id = auth.uid() or to_id = auth.uid());

-- M12 cleanup: drop signals older than 24 hours. Schedule with pg_cron if
-- available, or call regularly another way.
create or replace function public.delete_old_call_signals()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.call_signals
  where created_at < now() - interval '24 hours';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.delete_old_call_signals() from public;
grant execute on function public.delete_old_call_signals() to authenticated, service_role;

-- ===========================================================================
-- L7 — push_subscriptions: endpoint must not be globally unique
-- ===========================================================================
-- One browser endpoint can legitimately belong to several users (shared
-- device / same push service endpoint reused). The global unique
-- constraint let one user's subscription probe another's endpoint
-- (unique-violation oracle) and blocked the second user outright.
-- Uniqueness is now per (user_id, endpoint). send-push already selects
-- subscriptions per recipient (.eq('user_id', recipientId)); see the
-- header note about its endpoint-only expired delete.

alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_endpoint_unique;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'push_subscriptions_user_endpoint_unique'
  ) then
    alter table public.push_subscriptions
      add constraint push_subscriptions_user_endpoint_unique
      unique (user_id, endpoint);
  end if;
end $$;

-- ===========================================================================
-- L9 — message_hides insert had no membership check
-- ===========================================================================
-- Hiding a message for yourself now requires the message to be in a chat
-- you are a member of (the hide_message() RPC already enforced this; the
-- direct-insert path did not).

drop policy if exists "Hide a message for me" on public.message_hides;
create policy "Hide a message for me"
  on public.message_hides for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.messages m
      where m.id = message_id
        and public.is_member(m.conversation_id)
    )
  );

-- ===========================================================================
-- L10 — group-photo upload allowed nested paths
-- ===========================================================================
-- "Admins upload group photos" only checked filename = 'photo.jpg', so a
-- path like <uuid>/nested/photo.jpg passed. The first folder must now be
-- the only folder. (The update policy is unchanged: an update can only
-- touch an object that already exists at that path, which requires a
-- prior insert through this policy.)

drop policy if exists "Admins upload group photos" on storage.objects;
create policy "Admins upload group photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'group-photos'
    and array_length(storage.foldername(name), 1) = 1
    and storage.filename(name) = 'photo.jpg'
    and private.is_group_admin(((storage.foldername(name))[1])::uuid)
  );

-- ===========================================================================
-- FUNCTIONAL FIX — search_profiles: restore partial / prefix search
-- ===========================================================================
-- 20261020300000_premium_tier.sql redefined search_profiles to
-- exact-match-only, silently overwriting the partial/prefix search from
-- 20261020270000_search_requires_contact.sql. Restored here, keeping the
-- is_premium column from the premium version and the leading-'@' strip
-- from the exact-match versions. Behaviour: an exact username match
-- returns only that person; otherwise prefix matches come first, then
-- other contains matches (_ and % are literal letters). Self and blocks
-- stay out. See the header note about 20261020280000 if exact-only was
-- in fact the intended product behaviour.

drop function if exists public.search_profiles(text);

create function public.search_profiles(query text)
returns table (
  id uuid,
  username text,
  avatar_url text,
  favourite_anime text,
  is_creator boolean,
  is_premium boolean,
  request_id uuid,
  request_status text,
  request_from uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cleaned text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  cleaned := lower(btrim(coalesce(query, '')));
  cleaned := ltrim(cleaned, '@');
  if length(cleaned) = 0 then
    return;
  end if;

  if exists (
    select 1
    from public.profiles p
    where p.id <> auth.uid()
      and not private.users_blocked(auth.uid(), p.id)
      and lower(p.username) = cleaned
  ) then
    return query
    select
      p.id,
      p.username,
      p.avatar_url,
      p.favourite_anime,
      p.is_creator,
      coalesce((p.premium_from is null or p.premium_from <= now()) and p.premium_until > now(), false),
      r.id,
      r.status,
      r.from_id
    from public.profiles p
    left join public.contact_requests r
      on least(r.from_id, r.to_id) = least(auth.uid(), p.id)
     and greatest(r.from_id, r.to_id) = greatest(auth.uid(), p.id)
    where p.id <> auth.uid()
      and not private.users_blocked(auth.uid(), p.id)
      and lower(p.username) = cleaned
    limit 1;
    return;
  end if;

  cleaned := replace(replace(replace(cleaned, '\', '\\'), '%', '\%'), '_', '\_');

  return query
  select
    p.id,
    p.username,
    p.avatar_url,
    p.favourite_anime,
    p.is_creator,
    coalesce((p.premium_from is null or p.premium_from <= now()) and p.premium_until > now(), false),
    r.id,
    r.status,
    r.from_id
  from public.profiles p
  left join public.contact_requests r
    on least(r.from_id, r.to_id) = least(auth.uid(), p.id)
   and greatest(r.from_id, r.to_id) = greatest(auth.uid(), p.id)
  where p.id <> auth.uid()
    and not private.users_blocked(auth.uid(), p.id)
    and p.username ilike '%' || cleaned || '%' escape '\'
  order by
    case when p.username ilike cleaned || '%' escape '\' then 0 else 1 end,
    p.username
  limit 20;
end;
$$;

revoke all on function public.search_profiles(text) from public;
grant execute on function public.search_profiles(text) to authenticated;

notify pgrst, 'reload schema';
