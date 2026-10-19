-- Creator-only animated GIF avatars.
--
-- The currently deployed client always squares an avatar and uploads it as
-- image/jpeg to <user-id>/avatar.jpg, including when the person picked a GIF.
-- These rules still allow that upload. They only stop a non-creator from
-- storing an image/gif object or a .gif name, and from saving a GIF URL on
-- their profile. The avatars bucket limit rises to 5 MB so a creator GIF fits.
-- Still photos stay small because the app compresses them before upload.

create schema if not exists private;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.viewer_is_creator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_creator from public.profiles where id = auth.uid()),
    false
  );
$$;

revoke all on function private.viewer_is_creator() from public, anon, authenticated;
grant execute on function private.viewer_is_creator() to authenticated;

update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
where id = 'avatars';

create or replace function private.object_is_gif(object_name text, meta jsonb)
returns boolean
language sql
stable
as $$
  select lower(coalesce(storage.extension(object_name), '')) = 'gif'
    or lower(split_part(coalesce(meta->>'mimetype', ''), ';', 1)) = 'image/gif';
$$;

revoke all on function private.object_is_gif(text, jsonb) from public, anon, authenticated;
grant execute on function private.object_is_gif(text, jsonb) to authenticated;

create or replace function private.avatar_url_is_gif(url text)
returns boolean
language sql
immutable
as $$
  select coalesce(url, '') ~* '(^|[/:])[^/?#]*\.gif($|[?#])'
      or coalesce(url, '') ~* '^data:image/gif';
$$;

revoke all on function private.avatar_url_is_gif(text) from public, anon, authenticated;
grant execute on function private.avatar_url_is_gif(text) to authenticated;

-- A non-creator may still replace their own JPEG. A GIF name or GIF type
-- is allowed only when profiles.is_creator is true for the signed-in user.
drop policy if exists "Users upload their own avatar" on storage.objects;
create policy "Users upload their own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (
      not private.object_is_gif(name, metadata)
      or (select private.viewer_is_creator())
    )
  );

drop policy if exists "Users update their own avatar" on storage.objects;
create policy "Users update their own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (
      not private.object_is_gif(name, metadata)
      or (select private.viewer_is_creator())
    )
  );

create or replace function private.reject_non_creator_gif_avatar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.avatar_url is not distinct from old.avatar_url then
    return new;
  end if;
  if coalesce(new.is_creator, false) then
    return new;
  end if;
  if private.avatar_url_is_gif(new.avatar_url) then
    raise exception 'Animated GIF avatars are for the creator only.';
  end if;
  return new;
end;
$$;

revoke all on function private.reject_non_creator_gif_avatar() from public, anon, authenticated;
grant execute on function private.reject_non_creator_gif_avatar() to authenticated;

drop trigger if exists profiles_reject_gif_avatar on public.profiles;
create trigger profiles_reject_gif_avatar
  before insert or update of avatar_url on public.profiles
  for each row execute function private.reject_non_creator_gif_avatar();
