-- Contact requests. A chat, a message, or a call exists only after both people accept.
-- Chats that already exist are recorded as accepted so they keep working.

create table if not exists public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references public.profiles (id) on delete cascade,
  to_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_id <> to_id)
);

create unique index if not exists contact_requests_pair_idx
  on public.contact_requests (least(from_id, to_id), greatest(from_id, to_id));

create index if not exists contact_requests_to_idx
  on public.contact_requests (to_id, status);

create or replace function public.are_contacts(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.contact_requests
    where status = 'accepted'
      and least(from_id, to_id) = least(a, b)
      and greatest(from_id, to_id) = greatest(a, b)
  );
$$;

-- True when the signed-in user shares this chat with an accepted contact.
-- Security definer so policies can check the other member without looping.
create or replace function public.contact_member(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_members peer
    where peer.conversation_id = cid
      and peer.user_id <> auth.uid()
      and public.are_contacts(auth.uid(), peer.user_id)
  );
$$;

insert into public.contact_requests (from_id, to_id, status)
select a.user_id, b.user_id, 'accepted'
from public.conversation_members a
join public.conversation_members b
  on b.conversation_id = a.conversation_id
 and a.user_id < b.user_id
where (
  select count(*) from public.conversation_members m where m.conversation_id = a.conversation_id
) = 2
on conflict ((least(from_id, to_id)), (greatest(from_id, to_id))) do nothing;

alter table public.contact_requests enable row level security;

grant select, insert, delete on public.contact_requests to authenticated;

drop policy if exists "Read own contact requests" on public.contact_requests;
create policy "Read own contact requests"
  on public.contact_requests for select
  to authenticated
  using (from_id = auth.uid() or to_id = auth.uid());

drop policy if exists "Send a contact request" on public.contact_requests;
create policy "Send a contact request"
  on public.contact_requests for insert
  to authenticated
  with check (from_id = auth.uid() and to_id <> auth.uid() and status = 'pending');

drop policy if exists "Cancel own pending request" on public.contact_requests;
create policy "Cancel own pending request"
  on public.contact_requests for delete
  to authenticated
  using (from_id = auth.uid() and status = 'pending');

-- No update policy: pending becomes accepted or declined only through the functions below.

create or replace function public.request_contact(other_id uuid)
returns public.contact_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.contact_requests;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if other_id is null or other_id = auth.uid() then
    raise exception 'You cannot add yourself';
  end if;
  if not exists (select 1 from public.profiles where id = other_id) then
    raise exception 'User not found';
  end if;

  select * into row
  from public.contact_requests
  where least(from_id, to_id) = least(auth.uid(), other_id)
    and greatest(from_id, to_id) = greatest(auth.uid(), other_id);

  if row.id is null then
    insert into public.contact_requests (from_id, to_id, status)
    values (auth.uid(), other_id, 'pending')
    returning * into row;
    return row;
  end if;

  if row.status = 'accepted' or (row.status = 'pending' and row.from_id = auth.uid()) then
    return row;
  end if;

  if row.status = 'pending' and row.to_id = auth.uid() then
    return row;
  end if;

  update public.contact_requests
    set from_id = auth.uid(),
        to_id = other_id,
        status = 'pending',
        updated_at = now()
    where id = row.id
    returning * into row;
  return row;
end;
$$;

create or replace function public.accept_contact(request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.contact_requests;
  cid uuid;
  other_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into row from public.contact_requests where id = request_id for update;
  if row.id is null or row.to_id <> auth.uid() or row.status <> 'pending' then
    raise exception 'That request is not waiting for you';
  end if;

  update public.contact_requests
    set status = 'accepted', updated_at = now()
    where id = row.id;

  other_id := row.from_id;

  select c.id into cid
  from public.conversations c
  join public.conversation_members mine
    on mine.conversation_id = c.id and mine.user_id = auth.uid()
  join public.conversation_members theirs
    on theirs.conversation_id = c.id and theirs.user_id = other_id
  where (select count(*) from public.conversation_members m where m.conversation_id = c.id) = 2
  limit 1;

  if cid is not null then
    return cid;
  end if;

  insert into public.conversations default values returning id into cid;
  insert into public.conversation_members (conversation_id, user_id) values (cid, auth.uid());
  insert into public.conversation_members (conversation_id, user_id) values (cid, other_id);
  return cid;
end;
$$;

create or replace function public.decline_contact(request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  update public.contact_requests
    set status = 'declined', updated_at = now()
    where id = request_id and to_id = auth.uid() and status = 'pending';
  if not found then
    raise exception 'That request is not waiting for you';
  end if;
end;
$$;

create or replace function public.cancel_contact(request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  delete from public.contact_requests
    where id = request_id and from_id = auth.uid() and status = 'pending';
  if not found then
    raise exception 'That request is not yours to cancel';
  end if;
end;
$$;

create or replace function public.list_contact_requests()
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
  peer_favourite_anime text
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
    peer.favourite_anime
  from public.contact_requests r
  join public.profiles peer
    on peer.id = case when r.from_id = auth.uid() then r.to_id else r.from_id end
  where r.status = 'pending'
    and (r.from_id = auth.uid() or r.to_id = auth.uid())
  order by r.created_at desc;
end;
$$;

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

  select c.id into cid
  from public.conversations c
  join public.conversation_members mine
    on mine.conversation_id = c.id and mine.user_id = auth.uid()
  join public.conversation_members theirs
    on theirs.conversation_id = c.id and theirs.user_id = other_id
  where (select count(*) from public.conversation_members m where m.conversation_id = c.id) = 2
  limit 1;

  if cid is not null then
    return cid;
  end if;

  insert into public.conversations default values returning id into cid;
  insert into public.conversation_members (conversation_id, user_id) values (cid, auth.uid());
  insert into public.conversation_members (conversation_id, user_id) values (cid, other_id);
  return cid;
end;
$$;

drop function if exists public.search_profiles(text);

create function public.search_profiles(query text)
returns table (
  id uuid,
  username text,
  avatar_url text,
  favourite_anime text,
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

  cleaned := replace(replace(replace(cleaned, '\', '\\'), '%', '\%'), '_', '\_');

  return query
  select
    p.id,
    p.username,
    p.avatar_url,
    p.favourite_anime,
    r.id,
    r.status,
    r.from_id
  from public.profiles p
  left join public.contact_requests r
    on least(r.from_id, r.to_id) = least(auth.uid(), p.id)
   and greatest(r.from_id, r.to_id) = greatest(auth.uid(), p.id)
  where p.id <> auth.uid()
    and p.username ilike '%' || cleaned || '%' escape '\'
  order by p.username
  limit 20;
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

create or replace function public.enforce_contact_on_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  return new;
end;
$$;

drop trigger if exists conversations_require_session on public.conversations;
create trigger conversations_require_session
  before insert on public.conversations
  for each row execute function public.enforce_contact_on_conversation();

create or replace function public.enforce_contact_on_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  peer uuid;
begin
  select m.user_id into peer
  from public.conversation_members m
  where m.conversation_id = new.conversation_id
    and m.user_id <> new.user_id
  limit 1;

  if peer is not null and not public.are_contacts(new.user_id, peer) then
    raise exception 'Contacts must accept a request before a chat can start';
  end if;
  return new;
end;
$$;

drop trigger if exists members_require_contact on public.conversation_members;
create trigger members_require_contact
  before insert on public.conversation_members
  for each row execute function public.enforce_contact_on_member();

create or replace function public.enforce_contact_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  peer uuid;
begin
  if not exists (
    select 1 from public.conversation_members
    where conversation_id = new.conversation_id and user_id = new.sender_id
  ) then
    raise exception 'Not a member of this conversation';
  end if;

  select m.user_id into peer
  from public.conversation_members m
  where m.conversation_id = new.conversation_id
    and m.user_id <> new.sender_id
  limit 1;

  if peer is null or not public.are_contacts(new.sender_id, peer) then
    raise exception 'You can only message an accepted contact';
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
    and public.is_member(conversation_id)
    and public.contact_member(conversation_id)
  );

create table if not exists public.call_signals (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references public.profiles (id) on delete cascade,
  to_id uuid not null references public.profiles (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  kind text not null check (kind in ('ring', 'offer', 'answer', 'ice', 'reject', 'hangup')),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists call_signals_to_idx
  on public.call_signals (to_id, created_at desc);

alter table public.call_signals enable row level security;

grant select, insert on public.call_signals to authenticated;

create or replace function public.enforce_contact_on_call()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.are_contacts(new.from_id, new.to_id) then
    raise exception 'Calls are only available between accepted contacts';
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

drop policy if exists "Read call signals sent to you" on public.call_signals;
create policy "Read call signals sent to you"
  on public.call_signals for select
  to authenticated
  using (to_id = auth.uid() or from_id = auth.uid());

drop policy if exists "Send a call signal to a contact" on public.call_signals;
create policy "Send a call signal to a contact"
  on public.call_signals for insert
  to authenticated
  with check (
    from_id = auth.uid()
    and public.are_contacts(from_id, to_id)
    and public.is_member(conversation_id)
    and exists (
      select 1 from public.conversation_members peer
      where peer.conversation_id = call_signals.conversation_id
        and peer.user_id = to_id
    )
  );

alter table public.contact_requests replica identity full;
alter table public.call_signals replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'contact_requests'
  ) then
    alter publication supabase_realtime add table public.contact_requests;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'call_signals'
  ) then
    alter publication supabase_realtime add table public.call_signals;
  end if;
end $$;

-- A chat row is only readable, and only created, for an accepted pair.
-- contact_member runs as the owner so policies can check the other member
-- without the membership policy querying its own table.
create or replace function public.contact_member(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_members peer
    where peer.conversation_id = cid
      and peer.user_id <> auth.uid()
      and public.are_contacts(auth.uid(), peer.user_id)
  );
$$;

revoke insert, update, delete on public.conversations from anon, authenticated;
revoke insert, update, delete on public.conversation_members from anon, authenticated;

drop policy if exists "Members read conversations" on public.conversations;
create policy "Members read conversations"
  on public.conversations for select
  to authenticated
  using (public.is_member(id) and public.contact_member(id));

drop policy if exists "Members read membership" on public.conversation_members;
create policy "Members read membership"
  on public.conversation_members for select
  to authenticated
  using (public.is_member(conversation_id) and public.contact_member(conversation_id));

drop policy if exists "Members read messages" on public.messages;
create policy "Members read messages"
  on public.messages for select
  to authenticated
  using (
    public.is_member(conversation_id)
    and public.contact_member(conversation_id)
    and not exists (
      select 1 from public.message_hides h
      where h.message_id = messages.id and h.user_id = auth.uid()
    )
  );

revoke all on function public.are_contacts(uuid, uuid) from public;
revoke all on function public.contact_member(uuid) from public;
revoke all on function public.request_contact(uuid) from public;
revoke all on function public.accept_contact(uuid) from public;
revoke all on function public.decline_contact(uuid) from public;
revoke all on function public.cancel_contact(uuid) from public;
revoke all on function public.list_contact_requests() from public;
revoke all on function public.search_profiles(text) from public;
revoke all on function public.start_direct_conversation(uuid) from public;
revoke all on function public.list_my_conversations() from public;

grant execute on function public.are_contacts(uuid, uuid) to authenticated;
grant execute on function public.contact_member(uuid) to authenticated;
grant execute on function public.request_contact(uuid) to authenticated;
grant execute on function public.accept_contact(uuid) to authenticated;
grant execute on function public.decline_contact(uuid) to authenticated;
grant execute on function public.cancel_contact(uuid) to authenticated;
grant execute on function public.list_contact_requests() to authenticated;
grant execute on function public.search_profiles(text) to authenticated;
grant execute on function public.start_direct_conversation(uuid) to authenticated;
grant execute on function public.list_my_conversations() to authenticated;
