-- Finding a person is an exact username, not a partial scan of every profile.
-- Direct selects stay inside the allow-list below. This function is the only
-- way to look up someone who is not already connected to you.

create table if not exists public.username_lookups (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  looked_at timestamptz not null default now()
);

create index if not exists username_lookups_user_idx
  on public.username_lookups (user_id, looked_at desc);

alter table public.username_lookups enable row level security;

revoke all on table public.username_lookups from anon, authenticated;

create or replace function public.can_read_profile(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and (
      target = auth.uid()
      or public.are_contacts(auth.uid(), target)
      or exists (
        select 1
        from public.contact_requests r
        where r.status = 'pending'
          and (
            (r.from_id = auth.uid() and r.to_id = target)
            or (r.to_id = auth.uid() and r.from_id = target)
          )
      )
      or exists (
        select 1
        from public.conversation_members mine
        join public.conversation_members theirs
          on theirs.conversation_id = mine.conversation_id
         and theirs.user_id = target
        where mine.user_id = auth.uid()
      )
    );
$$;

revoke all on function public.can_read_profile(uuid) from public;
grant execute on function public.can_read_profile(uuid) to authenticated;

drop policy if exists "Read own profile" on public.profiles;
drop policy if exists "Read visible profiles" on public.profiles;
create policy "Read visible profiles"
  on public.profiles for select
  to authenticated
  using (public.can_read_profile(id));

drop function if exists public.search_profiles(text);
drop function if exists public.find_user_by_username(text);

create function public.find_user_by_username(name text)
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
  -- Partial text, wildcards, and too-short names match nobody.
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

revoke all on function public.find_user_by_username(text) from public;
grant execute on function public.find_user_by_username(text) to authenticated;

-- Live databases already store is_creator. Re-running this lookup must not
-- drop that column from the result.
do $upgrade$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'is_creator'
  ) then
    execute $sql$
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
as $function$
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
$function$;

revoke all on function public.find_user_by_username(text) from public;
grant execute on function public.find_user_by_username(text) to authenticated;
$sql$;
  end if;
end
$upgrade$;
