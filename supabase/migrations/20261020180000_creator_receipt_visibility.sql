-- Creator visibility for last seen and read receipts.
--
-- mark_conversation_read() and mark_delivered() already store read_at and
-- delivered_at with no check of show_read_receipts. touch_last_seen() stores
-- last_seen_at with no check of show_last_seen. This migration does not stop
-- that. It only decides who can read the stored values.
--
-- A viewer sees another person's last seen when that person left
-- show_last_seen on, or when the viewer's profiles.is_creator is true.
-- A viewer sees delivered and read times on messages they sent when the
-- other person left show_read_receipts on, or when the viewer is the creator.
-- Everyone else gets nulls. The messages table itself stays readable for
-- chat content, but read_at and delivered_at are not granted to the API
-- roles and are not part of the messages realtime publication.

create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create or replace function private.viewer_is_creator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_creator from public.profiles where id = auth.uid()),
    false
  );
$$;

revoke all on function private.viewer_is_creator() from public, anon, authenticated;
grant execute on function private.viewer_is_creator() to authenticated;

-- Receipt rows are the only copy the API and realtime are allowed to read.
-- The trigger keeps them equal to messages.read_at and messages.delivered_at.
create table if not exists public.message_receipts (
  message_id uuid primary key references public.messages (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  read_at timestamptz,
  delivered_at timestamptz
);

create index if not exists message_receipts_conversation_idx
  on public.message_receipts (conversation_id);

create or replace function private.sync_message_receipt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.message_receipts as receipt (
    message_id,
    conversation_id,
    sender_id,
    read_at,
    delivered_at
  )
  values (
    new.id,
    new.conversation_id,
    new.sender_id,
    new.read_at,
    new.delivered_at
  )
  on conflict (message_id) do update
    set conversation_id = excluded.conversation_id,
        sender_id = excluded.sender_id,
        read_at = excluded.read_at,
        delivered_at = excluded.delivered_at;
  return new;
end;
$$;

revoke all on function private.sync_message_receipt() from public, anon, authenticated;

drop trigger if exists messages_sync_receipt on public.messages;
create trigger messages_sync_receipt
  after insert or update of read_at, delivered_at
  on public.messages
  for each row execute function private.sync_message_receipt();

insert into public.message_receipts (message_id, conversation_id, sender_id, read_at, delivered_at)
select id, conversation_id, sender_id, read_at, delivered_at
from public.messages
on conflict (message_id) do update
  set conversation_id = excluded.conversation_id,
      sender_id = excluded.sender_id,
      read_at = excluded.read_at,
      delivered_at = excluded.delivered_at;

alter table public.message_receipts enable row level security;

drop policy if exists "Read visible receipts" on public.message_receipts;
create policy "Read visible receipts"
  on public.message_receipts
  for select
  to authenticated
  using (
    public.is_member(conversation_id)
    and public.contact_member(conversation_id)
    and not exists (
      select 1
      from public.message_hides as hide
      where hide.message_id = message_receipts.message_id
        and hide.user_id = (select auth.uid())
    )
    and (
      (select private.viewer_is_creator())
      or (
        sender_id = (select auth.uid())
        and not exists (
          select 1
          from public.conversation_members as member
          join public.profiles as peer on peer.id = member.user_id
          where member.conversation_id = message_receipts.conversation_id
            and member.user_id <> (select auth.uid())
            and peer.show_read_receipts = false
        )
      )
    )
  );

revoke all on table public.message_receipts from public, anon, authenticated;
grant select on table public.message_receipts to authenticated;

-- Chat text stays selectable. Receipt timestamps do not, so a direct
-- PostgREST select cannot return hidden read or delivered times.
revoke select on table public.messages from anon, authenticated;
grant select (
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
  deleted_at
) on table public.messages to authenticated;

-- Replica identity FULL treats every column as identity, so a publication
-- column list cannot omit read_at while the messages publication includes
-- updates. The app reads the new row only, and the primary key is enough.
-- Receipt updates travel on message_receipts, whose RLS hides them.
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
      deleted_at
    );
  end if;
end $$;

alter table public.message_receipts replica identity default;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_rel as rel
       join pg_class as class on class.oid = rel.prrelid
       join pg_namespace as namespace on namespace.oid = class.relnamespace
       join pg_publication as publication on publication.oid = rel.prpubid
       where publication.pubname = 'supabase_realtime'
         and namespace.nspname = 'public'
         and class.relname = 'message_receipts'
     )
  then
    alter publication supabase_realtime add table public.message_receipts;
  end if;
end $$;

create or replace function public.list_my_conversations()
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
  last_delivered_at timestamptz
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
      when peer.show_last_seen or creator then peer.last_seen_at
      else null
    end,
    peer.show_read_receipts or creator,
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
    ) as unread,
    case
      when lm.sender_id = auth.uid() and (peer.show_read_receipts or creator) then lm.read_at
      else null
    end,
    case
      when lm.sender_id = auth.uid() and (peer.show_read_receipts or creator) then lm.delivered_at
      else null
    end
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
  where public.are_contacts(auth.uid(), peer.id)
  order by c.updated_at desc;
end;
$$;

revoke all on function public.list_my_conversations() from public;
grant execute on function public.list_my_conversations() to authenticated;

notify pgrst, 'reload schema';
