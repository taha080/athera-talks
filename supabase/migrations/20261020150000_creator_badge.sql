-- Creator verification. People cannot set this on their own profile.
alter table public.profiles
  add column if not exists is_creator boolean not null default false;

update public.profiles
set is_creator = true
where username = 'taha'
  and id in (
    select id from auth.users where email = 'ahsantaha16@gmail.com'
  );

revoke update on table public.profiles from public, anon, authenticated;
grant update (
  username,
  avatar_url,
  favourite_anime,
  theme,
  wallpaper,
  wallpaper_path,
  last_seen_at,
  show_last_seen,
  show_read_receipts,
  notify_sound,
  notify_desktop,
  updated_at
) on public.profiles to authenticated;
revoke insert (is_creator) on public.profiles from public, anon, authenticated;

create or replace function public.protect_creator_flag()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  actor text;
begin
  actor := coalesce(auth.role(), '');
  if tg_op = 'UPDATE' and new.is_creator is not distinct from old.is_creator then
    return new;
  end if;
  if tg_op = 'INSERT' and new.is_creator = false then
    return new;
  end if;
  if actor = 'service_role' or (actor = '' and current_user in ('postgres', 'supabase_admin', 'service_role')) then
    return new;
  end if;
  raise exception 'Creator status cannot be changed';
end;
$$;

drop trigger if exists profiles_protect_creator on public.profiles;
create trigger profiles_protect_creator
  before insert or update on public.profiles
  for each row execute function public.protect_creator_flag();

drop function if exists public.list_contact_requests();

create function public.list_contact_requests()
returns table (
  id uuid,
  from_id uuid,
  to_id uuid,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  peer_id uuid,
  peer_username text,
  peer_avatar_url text,
  peer_favourite_anime text,
  peer_is_creator boolean
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
    r.id,
    r.from_id,
    r.to_id,
    r.status,
    r.created_at,
    r.updated_at,
    peer.id,
    peer.username,
    peer.avatar_url,
    peer.favourite_anime,
    peer.is_creator
  from public.contact_requests r
  join public.profiles peer
    on peer.id = case when r.from_id = auth.uid() then r.to_id else r.from_id end
  where r.status = 'pending'
    and (r.from_id = auth.uid() or r.to_id = auth.uid())
  order by r.created_at desc;
end;
$$;

drop function if exists public.find_user_by_username(text);

create function public.find_user_by_username(name text)
returns table (
  id uuid,
  username text,
  avatar_url text,
  favourite_anime text,
  is_creator boolean,
  request_id uuid,
  request_status text,
  request_from uuid
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  cleaned text;
  recent int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  cleaned := lower(btrim(coalesce(name, '')));
  if cleaned !~ '^[a-z0-9_]{3,20}$' then
    return;
  end if;

  delete from public.username_lookups
  where user_id = auth.uid()
    and looked_at < now() - interval '1 hour';

  select count(*) into recent
  from public.username_lookups
  where user_id = auth.uid()
    and looked_at > now() - interval '1 minute';

  if recent >= 20 then
    raise exception 'Too many lookups. Wait a moment and try again.';
  end if;

  insert into public.username_lookups (user_id) values (auth.uid());

  return query
  select
    p.id,
    p.username,
    p.avatar_url,
    p.favourite_anime,
    p.is_creator,
    r.id,
    r.status,
    r.from_id
  from public.profiles p
  left join public.contact_requests r
    on least(r.from_id, r.to_id) = least(auth.uid(), p.id)
   and greatest(r.from_id, r.to_id) = greatest(auth.uid(), p.id)
  where p.id <> auth.uid()
    and p.username = cleaned
  limit 1;
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
  last_delivered_at timestamptz
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
    lm.delivered_at
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

revoke all on function public.list_contact_requests() from public;
revoke all on function public.find_user_by_username(text) from public;
revoke all on function public.list_my_conversations() from public;
grant execute on function public.list_contact_requests() to authenticated;
grant execute on function public.find_user_by_username(text) to authenticated;
grant execute on function public.list_my_conversations() to authenticated;
