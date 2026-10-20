-- Group member rows include last seen, with the same visibility as a direct chat:
-- the timestamp is returned when that person left show_last_seen on, or when the viewer is the creator.
-- Profiles RLS stays "Read own profile". search_profiles is not changed.
-- Apply this file in the Supabase SQL editor.

drop function if exists public.list_group_members(uuid);

create function public.list_group_members(cid uuid)
returns table (
  id uuid,
  username text,
  avatar_url text,
  favourite_anime text,
  is_creator boolean,
  role text,
  last_seen timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  creator boolean := private.viewer_is_creator();
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_member(cid) then
    raise exception 'That chat is not yours';
  end if;
  return query
  select
    p.id,
    p.username,
    p.avatar_url,
    p.favourite_anime,
    p.is_creator,
    m.role,
    case
      when p.show_last_seen or creator then p.last_seen_at
      else null
    end
  from public.conversation_members m
  join public.profiles p on p.id = m.user_id
  where m.conversation_id = cid
  order by case when m.role = 'admin' then 0 else 1 end, m.joined_at;
end;
$$;

revoke all on function public.list_group_members(uuid) from public;
grant execute on function public.list_group_members(uuid) to authenticated;

notify pgrst, 'reload schema';
