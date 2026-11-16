-- Athera Stories (WhatsApp Status / Instagram Stories style).
--
-- IMPORTANT: this file is a migration to apply, not proof it has been
-- applied. Until the owner runs this SQL in their Supabase project
-- (Supabase Dashboard -> SQL Editor, or `supabase db push`), the live
-- Stories row falls back to its local demo store and shows a banner
-- saying the tables are not set up yet. It never crashes the site.
--
-- Tables here are new only. No existing table is altered, so chats,
-- groups, calls, profiles and communities keep working exactly as before.
--
-- Row Level Security notes (policies below follow the existing pattern in
-- 20261024120000_communities.sql and reuse public.are_contacts from
-- 20261020120000_contact_requests.sql):
--  * A story is readable by its author and by that author's accepted
--    contacts only — never by strangers. This matches the app's privacy
--    model and WhatsApp Status.
--  * Anyone signed in can insert only their own story, and a story always
--    expires 24 hours after it was created (enforced by the check below).
--  * Only the author can delete a story. Stories are never updated.
--  * A view is readable by the viewer and by the story's author; anyone
--    signed in can record only their own view of a story they can see.
--  * The `stories` storage bucket is private. A photo is readable by its
--    author and by that author's accepted contacts, mirroring chat-images.
-- Review these policies for your own project before applying in production.

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('photo', 'text')),
  media_path text,
  text text,
  background text,
  caption text not null default '' check (char_length(caption) <= 140),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  check (expires_at > created_at and expires_at <= created_at + interval '24 hours'),
  check (kind = 'photo' or (text is not null and char_length(btrim(text)) between 1 and 280)),
  check (kind = 'text' or media_path is not null)
);

create table if not exists public.story_views (
  story_id uuid not null references public.stories (id) on delete cascade,
  viewer_id uuid not null references public.profiles (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);

create index if not exists stories_author_idx on public.stories (author_id, created_at desc);
create index if not exists stories_expires_idx on public.stories (expires_at);
create index if not exists story_views_story_idx on public.story_views (story_id);

alter table public.stories enable row level security;
alter table public.story_views enable row level security;

grant select, insert, delete on public.stories to authenticated;
grant select, insert on public.story_views to authenticated;

-- A story is visible to its author and to the author's accepted contacts.
drop policy if exists "Contacts read stories" on public.stories;
create policy "Contacts read stories"
  on public.stories for select to authenticated
  using (author_id = auth.uid() or public.are_contacts(auth.uid(), author_id));

drop policy if exists "Post your own story" on public.stories;
create policy "Post your own story"
  on public.stories for insert to authenticated
  with check (author_id = auth.uid());

drop policy if exists "Delete your own story" on public.stories;
create policy "Delete your own story"
  on public.stories for delete to authenticated
  using (author_id = auth.uid());

-- A view is visible to the viewer and to the story's author.
drop policy if exists "Author and viewer read story views" on public.story_views;
create policy "Author and viewer read story views"
  on public.story_views for select to authenticated
  using (
    viewer_id = auth.uid()
    or exists (
      select 1 from public.stories s
      where s.id = story_id and s.author_id = auth.uid()
    )
  );

drop policy if exists "Record your own story view" on public.story_views;
create policy "Record your own story view"
  on public.story_views for insert to authenticated
  with check (
    viewer_id = auth.uid()
    and exists (
      select 1 from public.stories s
      where s.id = story_id
        and (s.author_id = auth.uid() or public.are_contacts(auth.uid(), s.author_id))
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'stories',
  'stories',
  false,
  31457280,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Photos live at <author_id>/<uuid>.<ext> in the stories bucket.
drop policy if exists "Contacts read story photos" on storage.objects;
create policy "Contacts read story photos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'stories'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.are_contacts(auth.uid(), ((storage.foldername(name))[1])::uuid)
    )
  );

drop policy if exists "Upload your own story photo" on storage.objects;
create policy "Upload your own story photo"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'stories'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Delete your own story photo" on storage.objects;
create policy "Delete your own story photo"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'stories'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
