-- Groups, blocks, reports, message edits, and per-user pin / mute / archive.
--
-- Direct chats keep the contact rule. A block stops messages and calls in
-- both directions, while the chat stays visible so each person sees why.
-- Group membership is the gate for group messages. Group calls are rejected.
-- Pin, mute, and archive live on chat_prefs, one row per member, with RLS
-- so a person can only read and write their own settings.

create schema if not exists private;

alter table public.conversations
  add column if not exists kind text not null default 'direct',
  add column if not exists title text,
  add column if not exists photo_path text,
  add column if not exists created_by uuid references public.profiles (id);

alter table public.conversations drop constraint if exists conversations_kind_check;
alter table public.conversations
  add constraint conversations_kind_check check (kind in ('direct', 'group'));

alter table public.conversations drop constraint if exists conversations_title_check;
alter table public.conversations
  add constraint conversations_title_check check (
    (kind = 'direct' and title is null)
    or (kind = 'group' and title is not null and char_length(btrim(title)) between 1 and 80)
  );

alter table public.conversation_members
  add column if not exists role text not null default 'member';

alter table public.conversation_members drop constraint if exists conversation_members_role_check;
alter table public.conversation_members
  add constraint conversation_members_role_check check (role in ('admin', 'member'));

alter table public.messages
  add column if not exists edited_at timestamptz;

grant select (edited_at) on table public.messages to authenticated;

-- ---------------------------------------------------------------------------
-- Blocks. You can see and change only the rows you created.
-- ---------------------------------------------------------------------------

create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index if not exists blocks_blocked_idx on public.blocks (blocked_id);

alter table public.blocks enable row level security;

grant select, insert, delete on public.blocks to authenticated;

drop policy if exists "Read your blocks" on public.blocks;
create policy "Read your blocks"
  on public.blocks for select
  to authenticated
  using (blocker_id = auth.uid());

drop policy if exists "Block someone" on public.blocks;
create policy "Block someone"
  on public.blocks for insert
  to authenticated
  with check (blocker_id = auth.uid());

drop policy if exists "Unblock someone" on public.blocks;
create policy "Unblock someone"
  on public.blocks for delete
  to authenticated
  using (blocker_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Reports. Anyone can file one. Only the creator account can read them.
-- ---------------------------------------------------------------------------

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reported_id uuid not null references public.profiles (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  reason text not null check (reason in ('Spam', 'Harassment', 'Impersonation', 'Other')),
  details text check (details is null or char_length(details) <= 1000),
  created_at timestamptz not null default now(),
  check (reporter_id <> reported_id)
);

create index if not exists reports_created_idx on public.reports (created_at desc);

alter table public.reports enable row level security;

grant select, insert on public.reports to authenticated;

drop policy if exists "File a report" on public.reports;
create policy "File a report"
  on public.reports for insert
  to authenticated
  with check (reporter_id = auth.uid());

drop policy if exists "Creator reads reports" on public.reports;
create policy "Creator reads reports"
  on public.reports for select
  to authenticated
  using (private.viewer_is_creator());

-- ---------------------------------------------------------------------------
-- Per-user chat settings.
-- ---------------------------------------------------------------------------

create table if not exists public.chat_prefs (
  user_id uuid not null references public.profiles (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  pinned boolean not null default false,
  muted boolean not null default false,
  archived boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, conversation_id)
);

alter table public.chat_prefs enable row level security;

grant select, insert, update, delete on public.chat_prefs to authenticated;

drop policy if exists "Read your chat prefs" on public.chat_prefs;
create policy "Read your chat prefs"
  on public.chat_prefs for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Insert your chat prefs" on public.chat_prefs;
create policy "Insert your chat prefs"
  on public.chat_prefs for insert
  to authenticated
  with check (user_id = auth.uid() and public.is_member(conversation_id));

drop policy if exists "Update your chat prefs" on public.chat_prefs;
create policy "Update your chat prefs"
  on public.chat_prefs for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_member(conversation_id));

drop policy if exists "Delete your chat prefs" on public.chat_prefs;
create policy "Delete your chat prefs"
  on public.chat_prefs for delete
  to authenticated
  using (user_id = auth.uid());

create or replace function private.users_blocked(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.blocks
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;

revoke all on function private.users_blocked(uuid, uuid) from public, anon, authenticated;

create or replace function private.is_group_admin(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_members
    where conversation_id = cid
      and user_id = auth.uid()
      and role = 'admin'
  );
$$;

revoke all on function private.is_group_admin(uuid) from public, anon, authenticated;
grant execute on function private.is_group_admin(uuid) to authenticated;

create or replace function public.direct_chat_blocked(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_member(cid)
    and exists (
      select 1
      from public.conversations c
      join public.conversation_members a on a.conversation_id = c.id
      join public.conversation_members b
        on b.conversation_id = c.id
       and b.user_id <> a.user_id
      where c.id = cid
        and c.kind = 'direct'
        and private.users_blocked(a.user_id, b.user_id)
    );
$$;

create or replace function public.conversation_visible(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_member(cid)
    and (
      exists (
        select 1 from public.conversations c
        where c.id = cid and c.kind = 'group'
      )
      or public.contact_member(cid)
    );
$$;

create or replace function public.may_send(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_member(cid)
    and (
      exists (
        select 1 from public.conversations c
        where c.id = cid and c.kind = 'group'
      )
      or (public.contact_member(cid) and not public.direct_chat_blocked(cid))
    );
$$;

create or replace function public.enforce_pin_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.pinned and (
    select count(*)
    from public.chat_prefs
    where user_id = new.user_id
      and pinned
      and conversation_id <> new.conversation_id
  ) >= 3 then
    raise exception 'You can pin up to 3 chats';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists chat_prefs_pin_limit on public.chat_prefs;
create trigger chat_prefs_pin_limit
  before insert or update on public.chat_prefs
  for each row execute function public.enforce_pin_limit();

create or replace function public.unarchive_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.chat_prefs
    set archived = false,
        updated_at = now()
    where conversation_id = new.conversation_id
      and archived
      and not muted;
  return new;
end;
$$;

drop trigger if exists messages_unarchive on public.messages;
create trigger messages_unarchive
  after insert on public.messages
  for each row execute function public.unarchive_on_message();

-- A sender may change their own text once, and the row keeps an edited mark.
-- Delete-for-everyone still clears the body while setting deleted_at.
create or replace function public.protect_message_edits()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id is distinct from old.id
    or new.sender_id is distinct from old.sender_id
    or new.conversation_id is distinct from old.conversation_id
    or new.created_at is distinct from old.created_at
    or new.kind is distinct from old.kind
    or new.reply_to is distinct from old.reply_to
  then
    raise exception 'That part of a message cannot change';
  end if;
  if old.deleted_at is not null and new.deleted_at is null then
    raise exception 'A deleted message stays deleted';
  end if;
  if (
    new.media_path is distinct from old.media_path
    or new.media_mime is distinct from old.media_mime
    or new.media_seconds is distinct from old.media_seconds
    or new.waveform is distinct from old.waveform
  ) and new.deleted_at is null then
    raise exception 'That part of a message cannot change';
  end if;
  if new.edited_at is distinct from old.edited_at then
    if new.sender_id is distinct from auth.uid()
      or old.kind is distinct from 'text'
      or new.deleted_at is not null
      or new.edited_at is null
    then
      raise exception 'That message cannot be edited';
    end if;
  end if;
  if new.body is distinct from old.body and new.deleted_at is null then
    if old.kind is distinct from 'text'
      or new.edited_at is null
      or new.sender_id is distinct from auth.uid()
    then
      raise exception 'Message text cannot change';
    end if;
  end if;
  return new;
end;
$$;

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
      and public.are_contacts(new.sender_id, peer.user_id)
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
  if not public.are_contacts(new.from_id, new.to_id) then
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

drop policy if exists "Members read conversations" on public.conversations;
create policy "Members read conversations"
  on public.conversations for select
  to authenticated
  using (public.conversation_visible(id));

drop policy if exists "Members read membership" on public.conversation_members;
create policy "Members read membership"
  on public.conversation_members for select
  to authenticated
  using (public.conversation_visible(conversation_id));

drop policy if exists "Members read messages" on public.messages;
create policy "Members read messages"
  on public.messages for select
  to authenticated
  using (
    public.conversation_visible(conversation_id)
    and not exists (
      select 1 from public.message_hides h
      where h.message_id = messages.id and h.user_id = auth.uid()
    )
  );

drop policy if exists "Members send messages" on public.messages;
create policy "Members send messages"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and public.may_send(conversation_id)
  );

drop policy if exists "Send a call signal to a contact" on public.call_signals;
create policy "Send a call signal to a contact"
  on public.call_signals for insert
  to authenticated
  with check (
    from_id = auth.uid()
    and public.are_contacts(from_id, to_id)
    and public.is_member(conversation_id)
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

-- Keep one-to-one lookup on direct chats only, so a two-person group is not reused.
create or replace function public.start_direct_conversation(other_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if other_id = auth.uid() then
    raise exception 'You cannot start a chat with yourself';
  end if;
  if not exists (select 1 from public.profiles where id = other_id) then
    raise exception 'User not found';
  end if;
  if not public.are_contacts(auth.uid(), other_id) then
    raise exception 'Contacts must accept a request before a chat can start';
  end if;
  if private.users_blocked(auth.uid(), other_id) then
    raise exception 'This chat is blocked';
  end if;

  select c.id into cid
  from public.conversations c
  join public.conversation_members mine
    on mine.conversation_id = c.id and mine.user_id = auth.uid()
  join public.conversation_members theirs
    on theirs.conversation_id = c.id and theirs.user_id = other_id
  where c.kind = 'direct'
    and (select count(*) from public.conversation_members m where m.conversation_id = c.id) = 2
  limit 1;

  if cid is not null then
    return cid;
  end if;

  insert into public.conversations (kind) values ('direct') returning id into cid;
  insert into public.conversation_members (conversation_id, user_id) values (cid, auth.uid());
  insert into public.conversation_members (conversation_id, user_id) values (cid, other_id);
  return cid;
end;
$$;

create or replace function public.edit_message(mid uuid, new_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  text_body text := btrim(new_body);
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if text_body is null or char_length(text_body) < 1 or char_length(text_body) > 4000 then
    raise exception 'Write a message first';
  end if;
  update public.messages
    set body = text_body,
        edited_at = now()
    where id = mid
      and sender_id = auth.uid()
      and kind = 'text'
      and deleted_at is null;
  if not found then
    raise exception 'That message cannot be edited';
  end if;
end;
$$;

create or replace function public.block_user(other_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if other_id = auth.uid() then
    raise exception 'You cannot block yourself';
  end if;
  if not exists (select 1 from public.profiles where id = other_id) then
    raise exception 'User not found';
  end if;
  insert into public.blocks (blocker_id, blocked_id)
  values (auth.uid(), other_id)
  on conflict do nothing;
end;
$$;

create or replace function public.unblock_user(other_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  delete from public.blocks
  where blocker_id = auth.uid()
    and blocked_id = other_id;
end;
$$;

create or replace function public.list_blocked()
returns table (
  id uuid,
  username text,
  avatar_url text,
  is_creator boolean,
  blocked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  return query
  select p.id, p.username, p.avatar_url, p.is_creator, b.created_at
  from public.blocks b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
end;
$$;

create or replace function public.report_user(
  other_id uuid,
  reason text,
  details text,
  cid uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  report_id uuid;
  clean_details text := nullif(btrim(coalesce(details, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if other_id = auth.uid() then
    raise exception 'You cannot report yourself';
  end if;
  if not exists (select 1 from public.profiles where id = other_id) then
    raise exception 'User not found';
  end if;
  if reason not in ('Spam', 'Harassment', 'Impersonation', 'Other') then
    raise exception 'Choose a reason';
  end if;
  if cid is not null and not public.is_member(cid) then
    raise exception 'That chat is not yours';
  end if;
  if clean_details is not null and char_length(clean_details) > 1000 then
    raise exception 'Keep the details under 1000 characters';
  end if;
  insert into public.reports (reporter_id, reported_id, conversation_id, reason, details)
  values (auth.uid(), other_id, cid, reason, clean_details)
  returning id into report_id;
  return report_id;
end;
$$;

create or replace function public.list_reports()
returns table (
  id uuid,
  reporter_id uuid,
  reporter_username text,
  reported_id uuid,
  reported_username text,
  conversation_id uuid,
  reason text,
  details text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not private.viewer_is_creator() then
    raise exception 'Reports are visible to the creator only';
  end if;
  return query
  select
    r.id,
    r.reporter_id,
    reporter.username,
    r.reported_id,
    reported.username,
    r.conversation_id,
    r.reason,
    r.details,
    r.created_at
  from public.reports r
  join public.profiles reporter on reporter.id = r.reporter_id
  join public.profiles reported on reported.id = r.reported_id
  order by r.created_at desc
  limit 200;
end;
$$;

create or replace function public.create_group(title text, member_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid;
  clean_title text := btrim(title);
  chosen uuid[];
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if clean_title is null or char_length(clean_title) < 1 or char_length(clean_title) > 80 then
    raise exception 'Give the group a name';
  end if;

  select coalesce(array_agg(distinct member_id), '{}')
    into chosen
  from unnest(coalesce(member_ids, '{}')) as member_id
  where member_id is not null
    and member_id <> auth.uid();

  if coalesce(array_length(chosen, 1), 0) < 1 then
    raise exception 'Add at least one person';
  end if;

  if exists (
    select 1
    from unnest(chosen) as member_id
    where not exists (select 1 from public.profiles p where p.id = member_id)
       or not public.are_contacts(auth.uid(), member_id)
       or private.users_blocked(auth.uid(), member_id)
  ) then
    raise exception 'Groups can only include accepted contacts';
  end if;

  insert into public.conversations (kind, title, created_by)
  values ('group', clean_title, auth.uid())
  returning id into cid;

  insert into public.conversation_members (conversation_id, user_id, role)
  values (cid, auth.uid(), 'admin');

  insert into public.conversation_members (conversation_id, user_id, role)
  select cid, member_id, 'member'
  from unnest(chosen) as member_id;

  return cid;
end;
$$;

create or replace function public.list_group_members(cid uuid)
returns table (
  id uuid,
  username text,
  avatar_url text,
  favourite_anime text,
  is_creator boolean,
  role text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_member(cid) then
    raise exception 'That chat is not yours';
  end if;
  return query
  select p.id, p.username, p.avatar_url, p.favourite_anime, p.is_creator, m.role
  from public.conversation_members m
  join public.profiles p on p.id = m.user_id
  where m.conversation_id = cid
  order by case when m.role = 'admin' then 0 else 1 end, m.joined_at;
end;
$$;

create or replace function public.add_group_member(cid uuid, member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not private.is_group_admin(cid) then
    raise exception 'Only an admin can do that';
  end if;
  if member_id = auth.uid() then
    raise exception 'You are already in this group';
  end if;
  if not exists (select 1 from public.profiles where id = member_id) then
    raise exception 'User not found';
  end if;
  if not public.are_contacts(auth.uid(), member_id) or private.users_blocked(auth.uid(), member_id) then
    raise exception 'Groups can only include accepted contacts';
  end if;
  insert into public.conversation_members (conversation_id, user_id, role)
  values (cid, member_id, 'member')
  on conflict do nothing;
end;
$$;

create or replace function public.remove_group_member(cid uuid, member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not private.is_group_admin(cid) then
    raise exception 'Only an admin can do that';
  end if;
  if member_id = auth.uid() then
    raise exception 'Use leave to exit the group';
  end if;
  delete from public.conversation_members
  where conversation_id = cid
    and user_id = member_id;
end;
$$;

create or replace function public.set_group_role(cid uuid, member_id uuid, next_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  other_admins int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if next_role not in ('admin', 'member') then
    raise exception 'Choose admin or member';
  end if;
  if not private.is_group_admin(cid) then
    raise exception 'Only an admin can do that';
  end if;
  if not exists (
    select 1 from public.conversation_members
    where conversation_id = cid and user_id = member_id
  ) then
    raise exception 'That person is not in the group';
  end if;
  select count(*) into other_admins
  from public.conversation_members
  where conversation_id = cid
    and role = 'admin'
    and user_id <> member_id;
  if next_role = 'member' and other_admins = 0 then
    raise exception 'The group needs an admin';
  end if;
  update public.conversation_members
    set role = next_role
    where conversation_id = cid
      and user_id = member_id;
end;
$$;

create or replace function public.rename_group(cid uuid, next_title text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_title text := btrim(next_title);
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not private.is_group_admin(cid) then
    raise exception 'Only an admin can do that';
  end if;
  if clean_title is null or char_length(clean_title) < 1 or char_length(clean_title) > 80 then
    raise exception 'Give the group a name';
  end if;
  update public.conversations
    set title = clean_title
    where id = cid
      and kind = 'group';
end;
$$;

create or replace function public.set_group_photo(cid uuid, path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not private.is_group_admin(cid) then
    raise exception 'Only an admin can do that';
  end if;
  if path is not null and path is distinct from (cid::text || '/photo.jpg') then
    raise exception 'That photo path is not allowed';
  end if;
  update public.conversations
    set photo_path = path,
        updated_at = now()
    where id = cid
      and kind = 'group';
end;
$$;

create or replace function public.leave_group(cid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining int;
  admins int;
  promoted uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (
    select 1 from public.conversations
    where id = cid and kind = 'group'
  ) then
    raise exception 'That group was not found';
  end if;
  if not public.is_member(cid) then
    raise exception 'That chat is not yours';
  end if;

  delete from public.conversation_members
  where conversation_id = cid
    and user_id = auth.uid();

  select count(*) into remaining
  from public.conversation_members
  where conversation_id = cid;

  if remaining = 0 then
    delete from public.conversations where id = cid;
    return;
  end if;

  select count(*) into admins
  from public.conversation_members
  where conversation_id = cid
    and role = 'admin';

  if admins = 0 then
    select user_id into promoted
    from public.conversation_members
    where conversation_id = cid
    order by joined_at
    limit 1;
    update public.conversation_members
      set role = 'admin'
      where conversation_id = cid
        and user_id = promoted;
  end if;
end;
$$;

create or replace function public.delete_group(cid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (
    select 1 from public.conversations
    where id = cid and kind = 'group'
  ) then
    raise exception 'That group was not found';
  end if;
  if not private.is_group_admin(cid) then
    raise exception 'Only an admin can do that';
  end if;
  delete from public.conversations where id = cid;
end;
$$;

drop function if exists public.list_my_conversations();

create function public.list_my_conversations()
returns table (
  id uuid,
  updated_at timestamptz,
  peer_id uuid,
  peer_username text,
  peer_avatar_url text,
  peer_favourite_anime text,
  peer_is_creator boolean,
  peer_last_seen timestamptz,
  peer_receipts boolean,
  last_body text,
  last_kind text,
  last_sender_id uuid,
  last_created_at timestamptz,
  unread int,
  last_read_at timestamptz,
  last_delivered_at timestamptz,
  kind text,
  title text,
  photo_path text,
  member_count int,
  my_role text,
  pinned boolean,
  muted boolean,
  archived boolean,
  blocked boolean,
  blocked_by_me boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  creator boolean := private.viewer_is_creator();
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  return query
  select
    c.id,
    c.updated_at,
    peer.id,
    peer.username,
    peer.avatar_url,
    peer.favourite_anime,
    peer.is_creator,
    case
      when c.kind = 'group' then null
      when peer.show_last_seen or creator then peer.last_seen_at
      else null
    end,
    case
      when c.kind = 'group' then true
      else peer.show_read_receipts or creator
    end,
    case
      when lm.deleted_at is not null then 'This message was deleted'
      when lm.kind = 'voice' then 'Voice message'
      when lm.kind = 'image' then 'Photo'
      else lm.body
    end,
    lm.kind,
    lm.sender_id,
    lm.created_at,
    (
      select count(*)::int
      from public.messages um
      where um.conversation_id = c.id
        and um.sender_id <> auth.uid()
        and um.read_at is null
        and um.deleted_at is null
        and not exists (
          select 1 from public.message_hides h
          where h.message_id = um.id and h.user_id = auth.uid()
        )
    ) as unread,
    case
      when lm.sender_id = auth.uid()
        and (c.kind = 'group' or peer.show_read_receipts or creator)
        then lm.read_at
      else null
    end,
    case
      when lm.sender_id = auth.uid()
        and (c.kind = 'group' or peer.show_read_receipts or creator)
        then lm.delivered_at
      else null
    end,
    c.kind,
    c.title,
    c.photo_path,
    (
      select count(*)::int
      from public.conversation_members counted
      where counted.conversation_id = c.id
    ),
    mine.role,
    coalesce(pref.pinned, false),
    coalesce(pref.muted, false),
    coalesce(pref.archived, false),
    case
      when c.kind = 'group' or peer.id is null then false
      else private.users_blocked(auth.uid(), peer.id)
    end,
    case
      when c.kind = 'group' or peer.id is null then false
      else exists (
        select 1 from public.blocks b
        where b.blocker_id = auth.uid()
          and b.blocked_id = peer.id
      )
    end
  from public.conversations c
  join public.conversation_members mine
    on mine.conversation_id = c.id and mine.user_id = auth.uid()
  left join lateral (
    select m.user_id
    from public.conversation_members m
    where m.conversation_id = c.id
      and m.user_id <> auth.uid()
    order by m.joined_at
    limit 1
  ) other on true
  left join public.profiles peer on peer.id = other.user_id
  left join public.chat_prefs pref
    on pref.conversation_id = c.id
   and pref.user_id = auth.uid()
  left join lateral (
    select m.body, m.sender_id, m.created_at, m.kind, m.deleted_at, m.read_at, m.delivered_at
    from public.messages m
    where m.conversation_id = c.id
      and not exists (
        select 1 from public.message_hides h
        where h.message_id = m.id and h.user_id = auth.uid()
      )
    order by m.created_at desc
    limit 1
  ) lm on true
  where case
    when c.kind = 'group' then true
    else peer.id is not null and public.are_contacts(auth.uid(), peer.id)
  end
  order by c.updated_at desc;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'group-photos',
  'group-photos',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Members read group photos" on storage.objects;
create policy "Members read group photos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'group-photos'
    and public.is_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "Admins upload group photos" on storage.objects;
create policy "Admins upload group photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'group-photos'
    and storage.filename(name) = 'photo.jpg'
    and private.is_group_admin(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "Admins update group photos" on storage.objects;
create policy "Admins update group photos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'group-photos'
    and private.is_group_admin(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'group-photos'
    and storage.filename(name) = 'photo.jpg'
    and private.is_group_admin(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "Admins delete group photos" on storage.objects;
create policy "Admins delete group photos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'group-photos'
    and private.is_group_admin(((storage.foldername(name))[1])::uuid)
  );

do $$
begin
  if exists (
    select 1
    from pg_publication_rel as rel
    join pg_class as class on class.oid = rel.prrelid
    join pg_namespace as namespace on namespace.oid = class.relnamespace
    join pg_publication as publication on publication.oid = rel.prpubid
    where publication.pubname = 'supabase_realtime'
      and namespace.nspname = 'public'
      and class.relname = 'messages'
  ) then
    alter publication supabase_realtime drop table public.messages;
  end if;

  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter table public.messages replica identity default;
    alter publication supabase_realtime add table public.messages (
      id,
      conversation_id,
      sender_id,
      body,
      created_at,
      kind,
      media_path,
      media_mime,
      media_seconds,
      waveform,
      reply_to,
      reply_preview,
      deleted_at,
      edited_at
    );
  end if;
end $$;

revoke all on function public.direct_chat_blocked(uuid) from public;
revoke all on function public.conversation_visible(uuid) from public;
revoke all on function public.may_send(uuid) from public;
revoke all on function public.enforce_pin_limit() from public;
revoke all on function public.unarchive_on_message() from public;
revoke all on function public.edit_message(uuid, text) from public;
revoke all on function public.block_user(uuid) from public;
revoke all on function public.unblock_user(uuid) from public;
revoke all on function public.list_blocked() from public;
revoke all on function public.report_user(uuid, text, text, uuid) from public;
revoke all on function public.list_reports() from public;
revoke all on function public.create_group(text, uuid[]) from public;
revoke all on function public.list_group_members(uuid) from public;
revoke all on function public.add_group_member(uuid, uuid) from public;
revoke all on function public.remove_group_member(uuid, uuid) from public;
revoke all on function public.set_group_role(uuid, uuid, text) from public;
revoke all on function public.rename_group(uuid, text) from public;
revoke all on function public.set_group_photo(uuid, text) from public;
revoke all on function public.leave_group(uuid) from public;
revoke all on function public.delete_group(uuid) from public;
revoke all on function public.list_my_conversations() from public;

grant execute on function public.direct_chat_blocked(uuid) to authenticated;
grant execute on function public.conversation_visible(uuid) to authenticated;
grant execute on function public.may_send(uuid) to authenticated;
grant execute on function public.edit_message(uuid, text) to authenticated;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.list_blocked() to authenticated;
grant execute on function public.report_user(uuid, text, text, uuid) to authenticated;
grant execute on function public.list_reports() to authenticated;
grant execute on function public.create_group(text, uuid[]) to authenticated;
grant execute on function public.list_group_members(uuid) to authenticated;
grant execute on function public.add_group_member(uuid, uuid) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
grant execute on function public.set_group_role(uuid, uuid, text) to authenticated;
grant execute on function public.rename_group(uuid, text) to authenticated;
grant execute on function public.set_group_photo(uuid, text) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;
grant execute on function public.delete_group(uuid) to authenticated;
grant execute on function public.list_my_conversations() to authenticated;

notify pgrst, 'reload schema';
