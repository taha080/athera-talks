-- Call history. Participants can read the log; a participant who was on the call can write it.
-- Apply this file in the Supabase SQL editor before merging.

create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  caller_id uuid not null references public.profiles (id),
  callee_id uuid references public.profiles (id),
  call_type text not null check (call_type in ('voice', 'video')),
  started_at timestamptz not null,
  answered_at timestamptz,
  ended_at timestamptz not null,
  status text not null check (status in ('completed', 'missed', 'declined', 'cancelled')),
  duration_seconds integer not null default 0 check (duration_seconds >= 0)
);

create index if not exists calls_conversation_idx
  on public.calls (conversation_id, ended_at);

alter table public.calls enable row level security;

grant select, insert on public.calls to authenticated;

drop policy if exists "Participants read call history" on public.calls;
create policy "Participants read call history"
  on public.calls for select
  to authenticated
  using (
    exists (
      select 1
      from public.conversation_members member
      where member.conversation_id = calls.conversation_id
        and member.user_id = auth.uid()
    )
  );

drop policy if exists "Participants log a call" on public.calls;
create policy "Participants log a call"
  on public.calls for insert
  to authenticated
  with check (
    (caller_id = auth.uid() or callee_id = auth.uid())
    and exists (
      select 1
      from public.conversation_members member
      where member.conversation_id = calls.conversation_id
        and member.user_id = auth.uid()
    )
  );

alter table public.calls replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'calls'
  ) then
    alter publication supabase_realtime add table public.calls;
  end if;
end $$;
