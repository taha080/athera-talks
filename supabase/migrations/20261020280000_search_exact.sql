-- Exact username search, matching the live function from pg_get_functiondef.
-- Case-insensitive, strips a leading @, one row. Self and blocks stay out.
-- Apply this file in the Supabase SQL editor. It is already applied on the live project.

CREATE OR REPLACE FUNCTION public.search_profiles(query text)
 RETURNS TABLE(id uuid, username text, avatar_url text, favourite_anime text, is_creator boolean, request_id uuid, request_status text, request_from uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare cleaned text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  cleaned := lower(btrim(coalesce(query, '')));
  cleaned := ltrim(cleaned, '@');
  if length(cleaned) = 0 then return; end if;
  return query
  select p.id, p.username, p.avatar_url, p.favourite_anime, p.is_creator, r.id, r.status, r.from_id
  from public.profiles p
  left join public.contact_requests r
    on least(r.from_id, r.to_id) = least(auth.uid(), p.id)
   and greatest(r.from_id, r.to_id) = greatest(auth.uid(), p.id)
  where p.id <> auth.uid()
    and not private.users_blocked(auth.uid(), p.id)
    and lower(p.username) = cleaned
  limit 1;
end;
$function$;

revoke all on function public.search_profiles(text) from public;
revoke all on function public.search_profiles(text) from anon;
grant execute on function public.search_profiles(text) to authenticated;

notify pgrst, 'reload schema';
