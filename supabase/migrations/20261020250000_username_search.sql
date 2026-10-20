-- The app searches with search_profiles. Live only has find_user_by_username,
-- an exact full-name lookup, so every search fails.
-- This restores a partial, case-insensitive match. _ and % are letters, not wildcards.
-- The signed-in user is left out, and so is anyone in a block either way.
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
  order by p.username
  limit 20;
end;
$$;

revoke all on function public.search_profiles(text) from public, anon;
grant execute on function public.search_profiles(text) to authenticated;

notify pgrst, 'reload schema';
