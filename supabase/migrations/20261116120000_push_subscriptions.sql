-- Push subscriptions for message notifications (Web Push).
--
-- IMPORTANT: this file is a migration to apply, not proof it has been
-- applied. Until the owner runs this SQL in their Supabase project
-- (Supabase Dashboard -> SQL Editor, or `supabase db push`), push
-- notifications stay off: the Settings toggle reports "not set up yet"
-- and the app works exactly as before. It never crashes the site.
--
-- Tables here are new only. No existing table is altered, so chats,
-- groups, calls, profiles and communities keep working exactly as before.
--
-- What is stored: one row per device/browser that turned notifications
-- on. The endpoint URL plus the two encryption keys (p256dh, auth) are
-- what the push server needs to deliver a notification to that browser.
-- No message content is stored here — the message itself is only in the
-- notification payload at send time.
--
-- Row Level Security notes (policies below follow the existing pattern in
-- 20261026120000_stories.sql):
--  * A subscription is readable only by its owner. Nobody can list
--    another person's devices.
--  * Anyone signed in can insert only their own subscription, and only
--    one row per endpoint (the unique constraint below).
--  * Only the owner can delete their subscription (turning notifications
--    off, or the server cleaning up an expired one on their behalf —
--    the Edge Function uses the service-role key, which bypasses RLS).
-- The send-push Edge Function reads this table with the service-role key
-- and deletes rows whose push endpoint answers 404 or 410 (expired).

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  device text not null default '' check (char_length(device) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_unique unique (endpoint)
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- A subscription is visible only to its owner.
drop policy if exists "Read your own push subscriptions" on public.push_subscriptions;
create policy "Read your own push subscriptions"
  on public.push_subscriptions for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Insert your own push subscription" on public.push_subscriptions;
create policy "Insert your own push subscription"
  on public.push_subscriptions for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Update your own push subscription" on public.push_subscriptions;
create policy "Update your own push subscription"
  on public.push_subscriptions for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Delete your own push subscription" on public.push_subscriptions;
create policy "Delete your own push subscription"
  on public.push_subscriptions for delete to authenticated
  using (user_id = auth.uid());
