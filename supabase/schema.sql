-- Athera Talks schema
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

-- Professional chat: appearance, voice, images, receipts.
-- The same statements live in supabase/migrations/20261019120000_professional_chat.sql

-- Appearance, voice notes, images, receipts, and privacy.
-- Safe to run again on a database that already has the base Athera Talks schema.

alter table public.profiles
  add column if not exists theme text not null default 'dark',
  add column if not exists wallpaper text not null default 'plain',
  add column if not exists wallpaper_path text,
  add column if not exists last_seen_at timestamptz,
  add column if not exists show_last_seen boolean not null default true,
  add column if not exists show_read_receipts boolean not null default true,
  add column if not exists notify_sound boolean not null default true,
  add column if not exists notify_desktop boolean not null default true;

alter table public.profiles drop constraint if exists profiles_theme_check;
alter table public.profiles
  add constraint profiles_theme_check
  check (theme in ('dark', 'naruto', 'midnight', 'sakura', 'ocean', 'forest', 'light', 'amoled'));

alter table public.profiles drop constraint if exists profiles_wallpaper_check;
alter table public.profiles
  add constraint profiles_wallpaper_check
  check (wallpaper in (
    'plain', 'ink', 'paper', 'accent',
    'waves', 'hemp', 'diamonds', 'stripes', 'dots', 'petals', 'mist', 'grid', 'stars', 'leaves',
    'custom'
  ));

alter table public.messages
  add column if not exists kind text not null default 'text',
  add column if not exists media_path text,
  add column if not exists media_mime text,
  add column if not exists media_seconds integer,
  add column if not exists waveform text,
  add column if not exists reply_to uuid,
  add column if not exists reply_preview text,
  add column if not exists deleted_at timestamptz,
  add column if not exists delivered_at timestamptz;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.messages'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%body%'
  loop
    execute format('alter table public.messages drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages
  add constraint messages_kind_check
  check (kind in ('text', 'voice', 'image'));

alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages
  add constraint messages_body_check
  check (
    char_length(body) <= 4000
    and (
      deleted_at is not null
      or kind in ('voice', 'image')
      or (kind = 'text' and char_length(btrim(body)) between 1 and 4000)
    )
  );

alter table public.messages drop constraint if exists messages_media_seconds_check;
alter table public.messages
  add constraint messages_media_seconds_check
  check (media_seconds is null or media_seconds between 0 and 600);

alter table public.messages drop constraint if exists messages_reply_to_fkey;
alter table public.messages
  add constraint messages_reply_to_fkey
  foreign key (reply_to) references public.messages (id) on delete set null;

create table if not exists public.message_hides (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

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
  if new.body is distinct from old.body and new.deleted_at is null then
    raise exception 'Message text cannot change';
  end if;
  return new;
end;
$$;

create or replace function public.touch_last_seen()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  update public.profiles
    set last_seen_at = now()
    where id = auth.uid();
end;
$$;

create or replace function public.mark_delivered()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  update public.messages as message
    set delivered_at = now()
    where message.delivered_at is null
      and message.sender_id <> auth.uid()
      and public.is_member(message.conversation_id);
end;
$$;

create or replace function public.hide_message(mid uuid)
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
    select 1
    from public.messages
    where id = mid
      and public.is_member(conversation_id)
  ) then
    raise exception 'Message not found';
  end if;
  insert into public.message_hides (message_id, user_id)
  values (mid, auth.uid())
  on conflict do nothing;
end;
$$;

create or replace function public.delete_message_for_everyone(mid uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  path text;
  message_kind text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  select media_path, kind into path, message_kind
  from public.messages
  where id = mid
    and sender_id = auth.uid()
    and deleted_at is null;
  if message_kind is null then
    raise exception 'Message not found';
  end if;
  update public.messages
    set deleted_at = now(),
        body = '',
        media_path = null,
        media_mime = null,
        waveform = null
    where id = mid
      and sender_id = auth.uid();
  return path;
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
  peer_last_seen timestamptz,
  peer_receipts boolean,
  last_body text,
  last_kind text,
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
    case when peer.show_last_seen then peer.last_seen_at else null end,
    peer.show_read_receipts,
    case
      when lm.deleted_at is not null then 'Message deleted'
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
    select m.body, m.sender_id, m.created_at, m.kind, m.deleted_at
    from public.messages m
    where m.conversation_id = c.id
      and not exists (
        select 1 from public.message_hides h
        where h.message_id = m.id and h.user_id = auth.uid()
      )
    order by m.created_at desc
    limit 1
  ) lm on true
  order by c.updated_at desc;
end;
$$;

revoke all on function public.touch_last_seen() from public;
revoke all on function public.mark_delivered() from public;
revoke all on function public.hide_message(uuid) from public;
revoke all on function public.delete_message_for_everyone(uuid) from public;
revoke all on function public.list_my_conversations() from public;

grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.touch_last_seen() to authenticated;
grant execute on function public.mark_delivered() to authenticated;
grant execute on function public.hide_message(uuid) to authenticated;
grant execute on function public.delete_message_for_everyone(uuid) to authenticated;
grant execute on function public.list_my_conversations() to authenticated;

drop policy if exists "Members read messages" on public.messages;
create policy "Members read messages"
  on public.messages for select
  to authenticated
  using (
    public.is_member(conversation_id)
    and not exists (
      select 1 from public.message_hides h
      where h.message_id = messages.id and h.user_id = auth.uid()
    )
  );

alter table public.message_hides enable row level security;

drop policy if exists "Read own hides" on public.message_hides;
create policy "Read own hides"
  on public.message_hides for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Hide a message for me" on public.message_hides;
create policy "Hide a message for me"
  on public.message_hides for insert
  to authenticated
  with check (user_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'voice-messages',
  'voice-messages',
  false,
  8388608,
  array['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/aac', 'audio/wav', 'audio/x-m4a', 'video/mp4']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-images',
  'chat-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'wallpapers',
  'wallpapers',
  false,
  3145728,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Members read voice messages" on storage.objects;
create policy "Members read voice messages"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'voice-messages'
    and public.is_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "Members upload voice messages" on storage.objects;
create policy "Members upload voice messages"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'voice-messages'
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.is_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "Members delete own voice messages" on storage.objects;
create policy "Members delete own voice messages"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'voice-messages'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "Members read chat images" on storage.objects;
create policy "Members read chat images"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'chat-images'
    and public.is_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "Members upload chat images" on storage.objects;
create policy "Members upload chat images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'chat-images'
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.is_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "Owner reads wallpaper" on storage.objects;
create policy "Owner reads wallpaper"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'wallpapers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Owner uploads wallpaper" on storage.objects;
create policy "Owner uploads wallpaper"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'wallpapers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Owner updates wallpaper" on storage.objects;
create policy "Owner updates wallpaper"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'wallpapers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Owner deletes wallpaper" on storage.objects;
create policy "Owner deletes wallpaper"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'wallpapers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Members delete own chat images" on storage.objects;
create policy "Members delete own chat images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'chat-images'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
