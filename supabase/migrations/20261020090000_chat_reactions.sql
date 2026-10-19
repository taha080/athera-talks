-- Chat list ticks and message reactions
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
create table if not exists public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index if not exists message_reactions_message_idx
  on public.message_reactions (message_id);

alter table public.message_reactions enable row level security;

grant select, insert, update, delete on public.message_reactions to authenticated;

drop policy if exists "Members read reactions" on public.message_reactions;
create policy "Members read reactions"
  on public.message_reactions for select
  to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_id and public.is_member(m.conversation_id)
    )
  );

drop policy if exists "React as yourself" on public.message_reactions;
create policy "React as yourself"
  on public.message_reactions for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.messages m
      where m.id = message_id and public.is_member(m.conversation_id)
    )
  );

drop policy if exists "Change own reaction" on public.message_reactions;
create policy "Change own reaction"
  on public.message_reactions for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Remove own reaction" on public.message_reactions;
create policy "Remove own reaction"
  on public.message_reactions for delete
  to authenticated
  using (user_id = auth.uid());

alter table public.message_reactions replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'message_reactions'
  ) then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
end $$;
