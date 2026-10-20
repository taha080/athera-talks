-- Username search: an exact name returns only that person. Otherwise prefix matches
-- come first, then other contains matches. _ and % are letters. Self and blocks stay out.
-- Direct messages and calls still require an accepted contact request. Groups do not.
-- Apply this file in the Supabase SQL editor.

drop function if exists public.search_profiles(text);

create function public.search_profiles(query text)
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

revoke all on function public.search_profiles(text) from public, anon;
grant execute on function public.search_profiles(text) to authenticated;

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

drop trigger if exists messages_require_contact on public.messages;
create trigger messages_require_contact
  before insert on public.messages
  for each row execute function public.enforce_contact_on_message();

drop policy if exists "Members send messages" on public.messages;
create policy "Members send messages"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and public.may_send(conversation_id)
  );

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

drop trigger if exists calls_require_contact on public.call_signals;
create trigger calls_require_contact
  before insert on public.call_signals
  for each row execute function public.enforce_contact_on_call();

notify pgrst, 'reload schema';
