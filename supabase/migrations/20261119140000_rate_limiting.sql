-- M3 (deep security audit): server-side rate limiting.
--
-- Before this migration, message sending, community messages, contact
-- requests, account creation and uploads had no server-side rate limit:
-- community slow-mode was enforced only in the local/demo store, so any
-- signed-in client could bypass it by calling Supabase directly.
--
-- This migration adds a generic per-user fixed-window counter
-- (public.rate_limits) plus a SECURITY DEFINER helper, and enforces it
-- with BEFORE INSERT triggers plus a check inside request_contact():
--   * public.messages:                  max 30 messages / 60 s per user
--   * public.community_channel_messages: max 30 messages / 60 s per user,
--     plus the community's slow_mode_seconds (communities.slow_mode_seconds,
--     0-300 s, 0 = off) between two messages by the same user in the same
--     channel. Community owners/admins are exempt from slow mode only.
--   * public.contact_requests:          max 10 new requests / 24 h per user
--     (trigger covers direct inserts and the insert inside
--     request_contact(); the re-request path after a decline is checked
--     explicitly inside request_contact() below).
--   * turn-credentials Edge Function:   quota is enforced by the function
--     itself via public.check_rate_limit_for() (service_role only) using
--     the same table with action 'turn-credentials', 30 / hour.
--
-- Limits are deliberately generous for a human (30/min) and are arguments
-- to the helper functions, so they can be tuned without a schema change.
-- Account creation / sign-up abuse and upload abuse cannot be limited by
-- a Postgres trigger; they need Supabase dashboard settings (Auth CAPTCHA
-- and Auth email rate limits) — see the PR description for the user steps.
--
-- Safe to run once: IF NOT EXISTS / CREATE OR REPLACE / DROP TRIGGER IF
-- EXISTS throughout. It does not edit any earlier migration. It must be
-- applied in the Supabase SQL Editor BEFORE deploying the updated
-- turn-credentials Edge Function, which calls check_rate_limit_for().

create table if not exists public.rate_limits (
  user_id uuid not null references public.profiles (id) on delete cascade,
  action text not null check (char_length(btrim(action)) between 1 and 64),
  window_start timestamptz not null,
  count int not null default 1 check (count >= 1),
  primary key (user_id, action, window_start)
);

alter table public.rate_limits enable row level security;
-- No policies on purpose: authenticated users get no direct access to this
-- table. Only SECURITY DEFINER functions (which bypass RLS) and the
-- service role (used by Edge Functions) may read/write it.
revoke all on public.rate_limits from public, authenticated, anon;

-- Core counter. Atomically increments the fixed-window bucket for
-- (p_user_id, p_action) and raises when the caller is over the limit, so
-- a trigger or function calling it simply aborts the write. The window is
-- aligned to the Unix epoch (floor(epoch / window) * window). Stale
-- windows for the same user+action are pruned on each call.
create or replace function public.check_rate_limit_for(
  p_user_id uuid,
  p_action text,
  p_max int,
  p_window_seconds int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start timestamptz;
  v_count int;
begin
  if p_user_id is null then
    raise exception 'Rate limit: no user';
  end if;
  if p_max <= 0 or p_window_seconds <= 0 then
    raise exception 'Rate limit: invalid limit';
  end if;

  v_start := to_timestamp(
    (floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds)::double precision
  );

  delete from public.rate_limits
    where user_id = p_user_id
      and action = p_action
      and window_start < v_start;

  insert into public.rate_limits (user_id, action, window_start, count)
    values (p_user_id, p_action, v_start, 1)
    on conflict (user_id, action, window_start)
    do update set count = public.rate_limits.count + 1
    returning count into v_count;

  if v_count > p_max then
    raise exception 'Rate limit exceeded for %: max % per % seconds',
      p_action, p_max, p_window_seconds;
  end if;
  return true;
end;
$$;

-- Wrapper for ordinary authenticated callers (triggers, RPC functions):
-- the limited user is always the signed-in user, never a caller-supplied id.
create or replace function public.check_rate_limit(
  p_action text,
  p_max int,
  p_window_seconds int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  return public.check_rate_limit_for(auth.uid(), p_action, p_max, p_window_seconds);
end;
$$;

revoke all on function public.check_rate_limit(text, int, int) from public;
grant execute on function public.check_rate_limit(text, int, int) to authenticated;
-- check_rate_limit_for() takes an arbitrary user id, so only the service
-- role (Edge Functions) may call it directly; authenticated users must go
-- through check_rate_limit(), which pins the id to auth.uid().
revoke all on function public.check_rate_limit_for(uuid, text, int, int) from public;
grant execute on function public.check_rate_limit_for(uuid, text, int, int) to service_role;

-- ---------------------------------------------------------------------------
-- Direct messages: 30 / minute per user.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_message_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.check_rate_limit('message', 30, 60);
  return new;
end;
$$;

drop trigger if exists messages_rate_limit on public.messages;
create trigger messages_rate_limit
  before insert on public.messages
  for each row execute function public.enforce_message_rate_limit();

-- ---------------------------------------------------------------------------
-- Community channel messages: 30 / minute per user + slow mode.
-- slow_mode_seconds lives on public.communities (integer 0-300, 0 = off).
-- The wait is measured between two messages by the same user in the same
-- channel; owners/admins of that community are exempt from slow mode
-- (they still hit the 30/min cap like everyone else).
-- ---------------------------------------------------------------------------
create or replace function public.enforce_community_message_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slow int;
  v_last timestamptz;
  v_is_manager boolean;
begin
  perform public.check_rate_limit('community_message', 30, 60);

  select c.slow_mode_seconds into v_slow
    from public.community_channels ch
    join public.communities c on c.id = ch.community_id
    where ch.id = new.channel_id;

  if v_slow is not null and v_slow > 0 then
    select exists (
      select 1
        from public.community_members m
        join public.community_channels ch on ch.community_id = m.community_id
        where ch.id = new.channel_id
          and m.user_id = new.sender_id
          and m.role in ('owner', 'admin')
    ) into v_is_manager;

    if not coalesce(v_is_manager, false) then
      select max(created_at) into v_last
        from public.community_channel_messages
        where channel_id = new.channel_id
          and sender_id = new.sender_id;

      if v_last is not null
        and v_last > now() - make_interval(secs => v_slow) then
        raise exception 'Slow mode is on: wait % seconds between messages in this channel', v_slow;
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists community_messages_rate_limit on public.community_channel_messages;
create trigger community_messages_rate_limit
  before insert on public.community_channel_messages
  for each row execute function public.enforce_community_message_rate_limit();

-- ---------------------------------------------------------------------------
-- Contact requests: 10 / day per user.
-- The trigger covers direct inserts and the insert inside request_contact().
-- request_contact() below is redefined (CREATE OR REPLACE, same body plus
-- one rate-limit check) so the re-request path after a decline — which is
-- an UPDATE, not an INSERT — is limited too.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_contact_request_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.check_rate_limit('contact_request', 10, 86400);
  return new;
end;
$$;

drop trigger if exists contact_requests_rate_limit on public.contact_requests;
create trigger contact_requests_rate_limit
  before insert on public.contact_requests
  for each row execute function public.enforce_contact_request_rate_limit();

-- request_contact() redefined with the rate-limit check added; body is
-- otherwise identical to 20261020120000_contact_requests.sql. (That file is
-- an applied migration and is never edited; OR REPLACE is the way to change
-- a function it created.)
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
    -- New request: the BEFORE INSERT trigger on contact_requests enforces
    -- the 10/day limit, so no check is needed here (and adding one would
    -- count the same request twice).
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

  -- Re-request after a decline: this is an UPDATE, so the INSERT trigger
  -- never fires — enforce the same 10/day limit explicitly.
  perform public.check_rate_limit('contact_request', 10, 86400);

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
