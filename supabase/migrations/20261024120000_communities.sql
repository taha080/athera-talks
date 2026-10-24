-- Athera Communities.
--
-- IMPORTANT: this file is a migration to apply, not proof it has been
-- applied. Until the owner runs this SQL in their Supabase project
-- (Supabase Dashboard -> SQL Editor, or `supabase db push`), the live
-- Communities page falls back to its local demo store and shows a banner
-- saying the tables are not set up yet. It never crashes the site.
--
-- Tables here are new only. No existing table is altered, so chats,
-- groups, calls and profiles keep working exactly as before.
--
-- Row Level Security notes (policies below follow the existing pattern in
-- 20261020200000_groups_safety_chats.sql):
--  * Public communities are readable by any signed-in user so they can be
--    discovered; private and invite-only communities are readable only by
--    their members.
--  * Membership rows are readable by members of that community. A user can
--    insert their own membership row (join / join request); only owners and
--    admins can change another member's role or remove them.
--  * Channel messages, events and voice rooms are readable and writable
--    only by members of the owning community.
--  * Reports can be filed by any member; only owners and admins of that
--    community can read them. Bans are managed by owners and admins.
-- Review these policies for your own project before applying in production.

create table if not exists public.communities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 60),
  description text not null default '' check (char_length(description) <= 500),
  visibility text not null default 'public' check (visibility in ('public', 'private', 'invite-only')),
  invite_code text not null default upper(substr(md5(random()::text), 1, 6)),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  favourite_anime text,
  slow_mode_seconds integer not null default 0 check (slow_mode_seconds between 0 and 300),
  word_filter text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.community_members (
  community_id uuid not null references public.communities (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member', 'pending')),
  muted_until timestamptz,
  joined_at timestamptz not null default now(),
  primary key (community_id, user_id)
);

create table if not exists public.community_channels (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  kind text not null default 'text' check (kind in ('text', 'announcements')),
  created_at timestamptz not null default now()
);

create table if not exists public.community_channel_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.community_channels (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  pinned boolean not null default false,
  poll_options text[],
  poll_votes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.community_events (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 500),
  starts_at timestamptz not null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.community_event_rsvps (
  event_id uuid not null references public.community_events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  answer text not null check (answer in ('yes', 'maybe', 'no')),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table if not exists public.community_voice_rooms (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  message_id uuid references public.community_channel_messages (id) on delete set null,
  reason text not null check (reason in ('Spam', 'Harassment', 'Impersonation', 'Other')),
  details text not null default '' check (char_length(details) <= 500),
  created_at timestamptz not null default now()
);

create table if not exists public.community_bans (
  community_id uuid not null references public.communities (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  banned_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (community_id, user_id)
);

create index if not exists community_members_user_idx on public.community_members (user_id);
create index if not exists community_channels_community_idx on public.community_channels (community_id);
create index if not exists community_messages_channel_idx on public.community_channel_messages (channel_id, created_at);
create index if not exists community_events_community_idx on public.community_events (community_id, starts_at);
create index if not exists community_reports_community_idx on public.community_reports (community_id, created_at desc);

alter table public.communities enable row level security;
alter table public.community_members enable row level security;
alter table public.community_channels enable row level security;
alter table public.community_channel_messages enable row level security;
alter table public.community_events enable row level security;
alter table public.community_event_rsvps enable row level security;
alter table public.community_voice_rooms enable row level security;
alter table public.community_reports enable row level security;
alter table public.community_bans enable row level security;

grant select, insert, update, delete on public.communities to authenticated;
grant select, insert, update, delete on public.community_members to authenticated;
grant select, insert, update, delete on public.community_channels to authenticated;
grant select, insert, update, delete on public.community_channel_messages to authenticated;
grant select, insert, update, delete on public.community_events to authenticated;
grant select, insert, update, delete on public.community_event_rsvps to authenticated;
grant select, insert, update, delete on public.community_voice_rooms to authenticated;
grant select, insert on public.community_reports to authenticated;
grant select, insert, delete on public.community_bans to authenticated;

-- Helper used by the policies below: true when the caller is a member
-- (any role, including pending, is excluded by the role check where needed).
create or replace function private.community_is_member(cid uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.community_members
    where community_id = cid and user_id = auth.uid() and role <> 'pending'
  );
$$;

create or replace function private.community_is_manager(cid uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.community_members
    where community_id = cid and user_id = auth.uid() and role in ('owner', 'admin')
  );
$$;

drop policy if exists "Discover public communities" on public.communities;
create policy "Discover public communities"
  on public.communities for select to authenticated
  using (visibility = 'public' or private.community_is_member(id) or owner_id = auth.uid());

drop policy if exists "Create a community" on public.communities;
create policy "Create a community"
  on public.communities for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "Managers update a community" on public.communities;
create policy "Managers update a community"
  on public.communities for update to authenticated
  using (private.community_is_manager(id))
  with check (private.community_is_manager(id));

drop policy if exists "Read community membership" on public.community_members;
create policy "Read community membership"
  on public.community_members for select to authenticated
  using (private.community_is_member(community_id) or user_id = auth.uid());

drop policy if exists "Join a community" on public.community_members;
create policy "Join a community"
  on public.community_members for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Managers manage membership" on public.community_members;
create policy "Managers manage membership"
  on public.community_members for update to authenticated
  using (private.community_is_manager(community_id))
  with check (private.community_is_manager(community_id));

drop policy if exists "Managers remove membership" on public.community_members;
create policy "Managers remove membership"
  on public.community_members for delete to authenticated
  using (private.community_is_manager(community_id));

drop policy if exists "Members read channels" on public.community_channels;
create policy "Members read channels"
  on public.community_channels for select to authenticated
  using (private.community_is_member(community_id));

drop policy if exists "Managers manage channels" on public.community_channels;
create policy "Managers manage channels"
  on public.community_channels for all to authenticated
  using (private.community_is_manager(community_id))
  with check (private.community_is_manager(community_id));

drop policy if exists "Members read channel messages" on public.community_channel_messages;
create policy "Members read channel messages"
  on public.community_channel_messages for select to authenticated
  using (exists (select 1 from public.community_channels c where c.id = channel_id and private.community_is_member(c.community_id)));

drop policy if exists "Members send channel messages" on public.community_channel_messages;
create policy "Members send channel messages"
  on public.community_channel_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (select 1 from public.community_channels c where c.id = channel_id and private.community_is_member(c.community_id))
  );

drop policy if exists "Managers pin channel messages" on public.community_channel_messages;
create policy "Managers pin channel messages"
  on public.community_channel_messages for update to authenticated
  using (exists (select 1 from public.community_channels c where c.id = channel_id and private.community_is_manager(c.community_id)));

drop policy if exists "Members read events" on public.community_events;
create policy "Members read events"
  on public.community_events for select to authenticated
  using (private.community_is_member(community_id));

drop policy if exists "Managers manage events" on public.community_events;
create policy "Managers manage events"
  on public.community_events for all to authenticated
  using (private.community_is_manager(community_id))
  with check (private.community_is_manager(community_id));

drop policy if exists "Members manage their RSVP" on public.community_event_rsvps;
create policy "Members manage their RSVP"
  on public.community_event_rsvps for all to authenticated
  using (user_id = auth.uid() and exists (select 1 from public.community_events e where e.id = event_id and private.community_is_member(e.community_id)))
  with check (user_id = auth.uid());

drop policy if exists "Members read voice rooms" on public.community_voice_rooms;
create policy "Members read voice rooms"
  on public.community_voice_rooms for select to authenticated
  using (private.community_is_member(community_id));

drop policy if exists "Managers manage voice rooms" on public.community_voice_rooms;
create policy "Managers manage voice rooms"
  on public.community_voice_rooms for all to authenticated
  using (private.community_is_manager(community_id))
  with check (private.community_is_manager(community_id));

drop policy if exists "Members file community reports" on public.community_reports;
create policy "Members file community reports"
  on public.community_reports for insert to authenticated
  with check (reporter_id = auth.uid() and private.community_is_member(community_id));

drop policy if exists "Managers read community reports" on public.community_reports;
create policy "Managers read community reports"
  on public.community_reports for select to authenticated
  using (private.community_is_manager(community_id));

drop policy if exists "Managers read bans" on public.community_bans;
create policy "Managers read bans"
  on public.community_bans for select to authenticated
  using (private.community_is_manager(community_id));

drop policy if exists "Managers manage bans" on public.community_bans;
create policy "Managers manage bans"
  on public.community_bans for all to authenticated
  using (private.community_is_manager(community_id))
  with check (private.community_is_manager(community_id));
