-- Creator-only premium grants, callable from the app by the creator account.
--
-- The service_role functions grant_premium / revoke_premium from
-- 20261020300000_premium_tier.sql are unchanged. Those are what a bot with
-- service-role access used. This file adds grant_premium_by_creator /
-- revoke_premium_by_creator for the signed-in creator (authenticated role),
-- so the creator can grant Premium from Settings > Admin premium without
-- opening the SQL editor, and so a future Muse Supabase connection using the
-- creator's own session can do the same.
--
-- The trigger protect_premium_until() still blocks direct updates to
-- premium_from / premium_until. These functions set app.premium_write = '1'
-- for their own transaction, exactly like grant_premium does, and they only
-- run when private.viewer_is_creator() is true.
--
-- Apply this file in the Supabase SQL editor, together with the Communities
-- migration (20261024120000_communities.sql) if that is still unapplied.
-- It is safe to run more than once.

create or replace function public.grant_premium_by_creator(p_username text, p_days int)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  name text := lower(ltrim(btrim(coalesce(p_username, '')), '@'));
  until timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not private.viewer_is_creator() then
    raise exception 'Only the creator can grant premium';
  end if;
  if name = '' then
    raise exception 'User not found';
  end if;
  if p_days is null or p_days < 1 or p_days > 365 then
    raise exception 'Premium days must be between 1 and 365';
  end if;
  perform set_config('app.premium_write', '1', true);
  update public.profiles
  set premium_from = now(),
      premium_until = greatest(coalesce(premium_until, now()), now()) + make_interval(days => p_days)
  where lower(username) = name
  returning premium_until into until;
  if until is null then
    raise exception 'User not found';
  end if;
  return until;
end;
$$;

create or replace function public.revoke_premium_by_creator(p_username text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  name text := lower(ltrim(btrim(coalesce(p_username, '')), '@'));
  found uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not private.viewer_is_creator() then
    raise exception 'Only the creator can revoke premium';
  end if;
  if name = '' then
    raise exception 'User not found';
  end if;
  perform set_config('app.premium_write', '1', true);
  update public.profiles
  set premium_from = null,
      premium_until = null
  where lower(username) = name
  returning id into found;
  if found is null then
    raise exception 'User not found';
  end if;
end;
$$;

revoke all on function public.grant_premium_by_creator(text, int) from public, anon, authenticated;
revoke all on function public.revoke_premium_by_creator(text) from public, anon, authenticated;
grant execute on function public.grant_premium_by_creator(text, int) to authenticated;
grant execute on function public.revoke_premium_by_creator(text) to authenticated;

notify pgrst, 'reload schema';
