-- Premium is active when the start is open or already reached and premium_until
-- is still ahead. Both columns may already exist. Authenticated users cannot
-- set them. Use grant_premium / revoke_premium from the SQL editor or the
-- service role.
-- Apply this file in the Supabase SQL editor. It is safe to run more than once.

alter table public.profiles
  add column if not exists premium_until timestamptz;

alter table public.profiles
  add column if not exists premium_from timestamptz;

revoke update (premium_until) on public.profiles from public, anon, authenticated;
revoke update (premium_from) on public.profiles from public, anon, authenticated;

create or replace function public.protect_premium_until()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  actor text;
begin
  if tg_op = 'UPDATE'
     and new.premium_until is not distinct from old.premium_until
     and new.premium_from is not distinct from old.premium_from then
    return new;
  end if;
  if tg_op = 'INSERT' and new.premium_until is null and new.premium_from is null then
    return new;
  end if;
  if current_setting('app.premium_write', true) = '1' then
    return new;
  end if;
  actor := coalesce(auth.role(), '');
  if actor = 'service_role' or (actor = '' and current_user in ('postgres', 'supabase_admin', 'service_role')) then
    return new;
  end if;
  raise exception 'Premium status cannot be changed';
end;
$$;

revoke all on function public.protect_premium_until() from public, anon, authenticated;

drop trigger if exists profiles_protect_premium on public.profiles;
create trigger profiles_protect_premium
  before insert or update on public.profiles
  for each row execute function public.protect_premium_until();

create or replace function private.viewer_is_premium()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select (premium_from is null or premium_from <= now()) and premium_until > now()
      from public.profiles
      where id = auth.uid()
    ),
    false
  );
$$;

revoke all on function private.viewer_is_premium() from public, anon, authenticated;
grant execute on function private.viewer_is_premium() to authenticated;

drop function if exists public.grant_premium(text, int);

create or replace function public.grant_premium(p_username text, p_days int, p_from timestamptz default now())
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  until timestamptz;
  name text := lower(btrim(coalesce(p_username, '')));
begin
  if p_days is null or p_days < 1 then
    raise exception 'Premium days must be at least 1';
  end if;
  if name = '' then
    raise exception 'User not found';
  end if;
  perform set_config('app.premium_write', '1', true);
  update public.profiles
  set premium_from = coalesce(p_from, now()),
      premium_until = greatest(coalesce(premium_until, now()), now()) + make_interval(days => p_days)
  where lower(username) = name
  returning premium_until into until;
  if until is null then
    raise exception 'User not found';
  end if;
  return until;
end;
$$;

create or replace function public.revoke_premium(p_username text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  name text := lower(btrim(coalesce(p_username, '')));
  found uuid;
begin
  if name = '' then
    raise exception 'User not found';
  end if;
  perform set_config('app.premium_write', '1', true);
  update public.profiles
  set premium_until = null,
      premium_from = null
  where lower(username) = name
  returning id into found;
  if found is null then
    raise exception 'User not found';
  end if;
end;
$$;

revoke all on function public.grant_premium(text, int, timestamptz) from public, anon, authenticated;
revoke all on function public.revoke_premium(text) from public, anon, authenticated;
grant execute on function public.grant_premium(text, int, timestamptz) to service_role;
grant execute on function public.revoke_premium(text) to service_role;

-- GIF avatars: creator or a premium account that has not expired.
drop policy if exists "Users upload their own avatar" on storage.objects;
create policy "Users upload their own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (
      not private.object_is_gif(name, metadata)
      or (select private.viewer_is_creator())
      or (select private.viewer_is_premium())
    )
  );

drop policy if exists "Users update their own avatar" on storage.objects;
create policy "Users update their own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (
      not private.object_is_gif(name, metadata)
      or (select private.viewer_is_creator())
      or (select private.viewer_is_premium())
    )
  );

create or replace function private.reject_non_creator_gif_avatar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.avatar_url is not distinct from old.avatar_url then
    return new;
  end if;
  if coalesce(new.is_creator, false)
     or coalesce((new.premium_from is null or new.premium_from <= now()) and new.premium_until > now(), false) then
    return new;
  end if;
  if private.avatar_url_is_gif(new.avatar_url) then
    raise exception 'Animated GIF avatars are for Premium and the creator.';
  end if;
  return new;
end;
$$;

-- Search stays an exact username match and also returns the live premium flag.
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
end;
$$;

revoke all on function public.search_profiles(text) from public;
grant execute on function public.search_profiles(text) to authenticated;

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
  peer_is_creator boolean,
  peer_is_premium boolean
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
    peer.is_creator,
    coalesce((peer.premium_from is null or peer.premium_from <= now()) and peer.premium_until > now(), false)
  from public.contact_requests r
  join public.profiles peer
    on peer.id = case when r.from_id = auth.uid() then r.to_id else r.from_id end
  where r.status = 'pending'
    and (r.from_id = auth.uid() or r.to_id = auth.uid())
  order by r.created_at desc;
end;
$$;

revoke all on function public.list_contact_requests() from public;
grant execute on function public.list_contact_requests() to authenticated;

drop function if exists public.list_blocked();

create function public.list_blocked()
returns table (
  id uuid,
  username text,
  avatar_url text,
  is_creator boolean,
  is_premium boolean,
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
  select p.id, p.username, p.avatar_url, p.is_creator, coalesce((p.premium_from is null or p.premium_from <= now()) and p.premium_until > now(), false), b.created_at
  from public.blocks b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
end;
$$;

revoke all on function public.list_blocked() from public;
grant execute on function public.list_blocked() to authenticated;

drop function if exists public.list_group_members(uuid);

create function public.list_group_members(cid uuid)
returns table (
  id uuid,
  username text,
  avatar_url text,
  favourite_anime text,
  is_creator boolean,
  is_premium boolean,
  role text,
  last_seen timestamptz
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
  if not public.is_member(cid) then
    raise exception 'That chat is not yours';
  end if;
  return query
  select
    p.id,
    p.username,
    p.avatar_url,
    p.favourite_anime,
    p.is_creator,
    coalesce((p.premium_from is null or p.premium_from <= now()) and p.premium_until > now(), false),
    m.role,
    case
      when p.show_last_seen or creator then p.last_seen_at
      else null
    end
  from public.conversation_members m
  join public.profiles p on p.id = m.user_id
  where m.conversation_id = cid
  order by case when m.role = 'admin' then 0 else 1 end, m.joined_at;
end;
$$;

revoke all on function public.list_group_members(uuid) from public;
grant execute on function public.list_group_members(uuid) to authenticated;

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
