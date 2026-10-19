create or replace function public.enforce_contact_on_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null and coalesce(current_setting('app.creator_attach', true), '') <> '1' then
    raise exception 'Not authenticated';
  end if;
  return new;
end;
$$;

alter table public.conversation_members
  add column if not exists pinned boolean not null default false;

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
  pinned boolean
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
    peer.is_creator,
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
    ) as unread,
    lm.read_at,
    lm.delivered_at,
    mine.pinned
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
  order by mine.pinned desc, c.updated_at desc;
end;
$$;

revoke all on function public.list_contact_requests() from public;
revoke all on function public.search_profiles(text) from public;
revoke all on function public.list_my_conversations() from public;
grant execute on function public.list_contact_requests() to authenticated;
grant execute on function public.search_profiles(text) to authenticated;
grant execute on function public.list_my_conversations() to authenticated;

-- Accepted contact and chat with the creator, pinned for the new person only.
create or replace function public.attach_creator_contact(fan uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  creator uuid;
  cid uuid;
  pair public.contact_requests%rowtype;
begin
  select id into creator
  from public.profiles
  where is_creator
    and username = 'taha'
  limit 1;

  if creator is null or creator = fan then
    return;
  end if;

  select * into pair
  from public.contact_requests
  where least(from_id, to_id) = least(fan, creator)
    and greatest(from_id, to_id) = greatest(fan, creator);

  if pair.id is null then
    insert into public.contact_requests (from_id, to_id, status)
    values (creator, fan, 'accepted');
  elsif pair.status <> 'accepted' then
    return;
  end if;

  select c.id into cid
  from public.conversations c
  join public.conversation_members a
    on a.conversation_id = c.id and a.user_id = fan
  join public.conversation_members b
    on b.conversation_id = c.id and b.user_id = creator
  where (
    select count(*) from public.conversation_members m where m.conversation_id = c.id
  ) = 2
  limit 1;

  perform set_config('app.creator_attach', '1', true);

  if cid is null then
    insert into public.conversations default values returning id into cid;
    insert into public.conversation_members (conversation_id, user_id, pinned)
    values (cid, fan, true), (cid, creator, false);
    return;
  end if;

  insert into public.conversation_members (conversation_id, user_id, pinned)
  values (cid, creator, false)
  on conflict (conversation_id, user_id) do nothing;

  insert into public.conversation_members (conversation_id, user_id, pinned)
  values (cid, fan, true)
  on conflict (conversation_id, user_id) do update
    set pinned = true;
end;
$$;

create or replace function public.add_creator_on_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.attach_creator_contact(new.id);
  return new;
end;
$$;

drop trigger if exists profiles_attach_creator on public.profiles;
create trigger profiles_attach_creator
  after insert on public.profiles
  for each row execute function public.add_creator_on_profile();

create or replace function public.protect_creator_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if (tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.status = 'accepted' and new.status is distinct from 'accepted'))
    and exists (
      select 1
      from public.profiles p
      where p.is_creator
        and p.id in (old.from_id, old.to_id)
    ) then
    raise exception 'The creator stays in your contacts';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists contact_requests_keep_creator on public.contact_requests;
create trigger contact_requests_keep_creator
  before update or delete on public.contact_requests
  for each row execute function public.protect_creator_contact();

create or replace function public.set_chat_pin(cid uuid, next_pin boolean)
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
    from public.conversation_members mine
    join public.conversation_members other
      on other.conversation_id = mine.conversation_id
     and other.user_id <> mine.user_id
    join public.profiles peer on peer.id = other.user_id
    where mine.conversation_id = cid
      and mine.user_id = auth.uid()
      and peer.is_creator
  ) then
    raise exception 'Only the creator chat can be pinned';
  end if;
  update public.conversation_members
    set pinned = coalesce(next_pin, false)
    where conversation_id = cid
      and user_id = auth.uid();
end;
$$;

revoke all on function public.attach_creator_contact(uuid) from public, anon, authenticated;
revoke all on function public.add_creator_on_profile() from public, anon, authenticated;
revoke all on function public.set_chat_pin(uuid, boolean) from public;
grant execute on function public.set_chat_pin(uuid, boolean) to authenticated;

do $$
begin
  if exists (
    select 1
    from public.contact_requests r
    join public.profiles c on c.is_creator and c.username = 'taha' and c.id in (r.from_id, r.to_id)
    where r.status = 'accepted'
  ) then
    return;
  end if;
  perform public.attach_creator_contact(id) from public.profiles;
end $$;
