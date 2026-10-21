-- Video messages. Duration is not capped. The only size limit is 50 MB.
-- Apply in the SQL editor. Safe to run more than once.

alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages
  add constraint messages_kind_check
  check (kind in ('text', 'voice', 'image', 'video'));

alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages
  add constraint messages_body_check
  check (
    char_length(body) <= 4000
    and (
      deleted_at is not null
      or kind in ('voice', 'image', 'video')
      or (kind = 'text' and char_length(btrim(body)) between 1 and 4000)
    )
  );

alter table public.messages drop constraint if exists messages_media_seconds_check;
alter table public.messages
  add constraint messages_media_seconds_check
  check (
    media_seconds is null
    or (kind = 'video' and media_seconds >= 0)
    or (kind is distinct from 'video' and media_seconds between 0 and 600)
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-videos',
  'chat-videos',
  false,
  52428800,
  array['video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Members read chat videos" on storage.objects;
create policy "Members read chat videos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'chat-videos'
    and public.is_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "Members upload chat videos" on storage.objects;
create policy "Members upload chat videos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'chat-videos'
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.is_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "Members update own chat videos" on storage.objects;
create policy "Members update own chat videos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'chat-videos'
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.is_member(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'chat-videos'
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.is_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "Members delete own chat videos" on storage.objects;
create policy "Members delete own chat videos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'chat-videos'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create or replace function public.list_my_conversations()
returns table (
  id uuid,
  updated_at timestamptz,
  peer_id uuid,
  peer_username text,
  peer_avatar_url text,
  peer_favourite_anime text,
  peer_is_creator boolean,
  peer_is_premium boolean,
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
    coalesce((peer.premium_from is null or peer.premium_from <= now()) and peer.premium_until > now(), false),
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
      when lm.kind = 'video' then 'Video'
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

revoke all on function public.list_my_conversations() from public;
grant execute on function public.list_my_conversations() to authenticated;

notify pgrst, 'reload schema';
