-- T.A.Talk schema
-- Run this once in the Supabase SQL editor (Project → SQL → New query).
-- Safe to run again: policies are dropped and recreated, tables stay if they exist.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Profiles. One row per auth user, created by the signup trigger below.
-- Direct reads and updates are limited to your own row.
-- Search and chat headers use small security-definer functions that return
-- only public fields (username, avatar, favourite anime).
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  avatar_url text,
  favourite_anime text check (
    favourite_anime is null or char_length(btrim(favourite_anime)) between 1 and 60
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Two rows per one-to-one chat: you, and the other fan.
create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists conversation_members_user_idx
  on public.conversation_members (user_id);

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at desc);

create index if not exists messages_unread_idx
  on public.messages (conversation_id)
  where read_at is null;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Checking membership inside a policy would recurse (the policy queries the
-- same table). This function runs as the table owner and skips that loop.
create or replace function public.is_member(cid uuid)
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
  );
$$;

create or replace function public.prepare_profile()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.username := lower(btrim(new.username));
  new.updated_at := now();
  if new.favourite_anime is not null then
    new.favourite_anime := nullif(btrim(new.favourite_anime), '');
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_prepare on public.profiles;
create trigger profiles_prepare
  before insert or update on public.profiles
  for each row execute function public.prepare_profile();

-- Bump the conversation when a message arrives so the chat list can sort.
create or replace function public.touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
    set updated_at = now()
    where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation();

-- Stop clients from editing the message text. Read state goes through
-- mark_conversation_read().
create or replace function public.protect_message_edits()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.body is distinct from old.body
    or new.sender_id is distinct from old.sender_id
    or new.conversation_id is distinct from old.conversation_id
    or new.created_at is distinct from old.created_at
    or new.id is distinct from old.id
  then
    raise exception 'Only read_at can change on a message';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_protect_edits on public.messages;
create trigger messages_protect_edits
  before update on public.messages
  for each row execute function public.protect_message_edits();

-- Create a profile when someone signs up with email or Google.
-- The username comes from sign-up metadata, then the email name.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base text;
  candidate text;
  suffix int := 0;
begin
  base := lower(regexp_replace(
    coalesce(
      nullif(new.raw_user_meta_data->>'username', ''),
      split_part(coalesce(new.email, 'fan'), '@', 1)
    ),
    '[^a-zA-Z0-9_]',
    '',
    'g'
  ));

  if base is null or length(base) < 3 then
    base := 'fan';
  end if;
  base := left(base, 20);
  candidate := base;

  while exists (select 1 from public.profiles where username = candidate) loop
    suffix := suffix + 1;
    candidate := left(base, 14) || '_' || suffix::text;
    if suffix > 40 then
      candidate := 'fan_' || substr(replace(new.id::text, '-', ''), 1, 8);
      exit;
    end if;
  end loop;

  insert into public.profiles (id, username)
  values (new.id, candidate);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- True when the name is free, or it is already yours.
-- anon can call this so the sign-up form can check before creating an account.
create or replace function public.username_available(name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cleaned text;
begin
  cleaned := lower(btrim(coalesce(name, '')));
  if cleaned !~ '^[a-z0-9_]{3,20}$' then
    return false;
  end if;
  if auth.uid() is not null and exists (
    select 1 from public.profiles
    where username = cleaned and id = auth.uid()
  ) then
    return true;
  end if;
  return not exists (
    select 1 from public.profiles where username = cleaned
  );
end;
$$;

-- Public fields for the "start a chat" search box.
create or replace function public.search_profiles(query text)
returns table (
  id uuid,
  username text,
  avatar_url text,
  favourite_anime text
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
  if length(cleaned) = 0 then
    return;
  end if;

  -- Treat % and _ as letters, not pattern wildcards.
  cleaned := replace(replace(replace(cleaned, '\', '\\'), '%', '\%'), '_', '\_');

  return query
  select p.id, p.username, p.avatar_url, p.favourite_anime
  from public.profiles p
  where p.id <> auth.uid()
    and p.username ilike '%' || cleaned || '%' escape '\'
  order by p.username
  limit 20;
end;
$$;

-- Find the one-to-one chat or create it with both members.
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

  select c.id into cid
  from public.conversations c
  join public.conversation_members mine
    on mine.conversation_id = c.id and mine.user_id = auth.uid()
  join public.conversation_members theirs
    on theirs.conversation_id = c.id and theirs.user_id = other_id
  where (
    select count(*) from public.conversation_members m where m.conversation_id = c.id
  ) = 2
  limit 1;

  if cid is not null then
    return cid;
  end if;

  insert into public.conversations default values
  returning id into cid;

  insert into public.conversation_members (conversation_id, user_id)
  values (cid, auth.uid()), (cid, other_id);

  return cid;
end;
$$;

create or replace function public.list_my_conversations()
returns table (
  id uuid,
  updated_at timestamptz,
  peer_id uuid,
  peer_username text,
  peer_avatar_url text,
  peer_favourite_anime text,
  last_body text,
  last_sender_id uuid,
  last_created_at timestamptz,
  unread int
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
  select
    c.id,
    c.updated_at,
    peer.id,
    peer.username,
    peer.avatar_url,
    peer.favourite_anime,
    lm.body,
    lm.sender_id,
    lm.created_at,
    (
      select count(*)::int
      from public.messages um
      where um.conversation_id = c.id
        and um.sender_id <> auth.uid()
        and um.read_at is null
    ) as unread
  from public.conversations c
  join public.conversation_members mine
    on mine.conversation_id = c.id and mine.user_id = auth.uid()
  join lateral (
    select m.user_id
    from public.conversation_members m
    where m.conversation_id = c.id
      and m.user_id <> auth.uid()
    order by m.joined_at
    limit 1
  ) other on true
  join public.profiles peer on peer.id = other.user_id
  left join lateral (
    select m.body, m.sender_id, m.created_at
    from public.messages m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) lm on true
  order by c.updated_at desc;
end;
$$;

create or replace function public.mark_conversation_read(cid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_member(cid) then
    raise exception 'Not a member of this conversation';
  end if;

  update public.messages
    set read_at = now()
    where conversation_id = cid
      and sender_id <> auth.uid()
      and read_at is null;
end;
$$;

revoke all on function public.is_member(uuid) from public;
revoke all on function public.username_available(text) from public;
revoke all on function public.search_profiles(text) from public;
revoke all on function public.start_direct_conversation(uuid) from public;
revoke all on function public.list_my_conversations() from public;
revoke all on function public.mark_conversation_read(uuid) from public;

grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function public.search_profiles(text) to authenticated;
grant execute on function public.start_direct_conversation(uuid) to authenticated;
grant execute on function public.list_my_conversations() to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

drop policy if exists "Read own profile" on public.profiles;
create policy "Read own profile"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

drop policy if exists "Update own profile" on public.profiles;
create policy "Update own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "Members read conversations" on public.conversations;
create policy "Members read conversations"
  on public.conversations for select
  to authenticated
  using (public.is_member(id));

drop policy if exists "Members read membership" on public.conversation_members;
create policy "Members read membership"
  on public.conversation_members for select
  to authenticated
  using (public.is_member(conversation_id));

drop policy if exists "Members read messages" on public.messages;
create policy "Members read messages"
  on public.messages for select
  to authenticated
  using (public.is_member(conversation_id));

drop policy if exists "Members send messages" on public.messages;
create policy "Members send messages"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_member(conversation_id)
  );

-- No update policy: clients cannot edit messages directly.
-- mark_conversation_read() is security definer and sets read_at only.

-- ---------------------------------------------------------------------------
-- Realtime. The chat screen listens for new messages.
-- Broadcast channels used for call signaling do not need a table.
-- ---------------------------------------------------------------------------

alter table public.messages replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'messages'
     )
  then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Avatars bucket. Files live at <user-id>/avatar.jpg.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view avatars" on storage.objects;
create policy "Public can view avatars"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

drop policy if exists "Users upload their own avatar" on storage.objects;
create policy "Users upload their own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users update their own avatar" on storage.objects;
create policy "Users update their own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users delete their own avatar" on storage.objects;
create policy "Users delete their own avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
