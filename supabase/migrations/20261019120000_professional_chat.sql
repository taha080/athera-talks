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
