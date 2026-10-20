-- Avatars and group photos may be up to 30 MB. GIFs stay uncompressed in the app.
-- The live buckets are already set to this limit. Applying this again is safe.

update storage.buckets
set file_size_limit = 31457280
where id in ('avatars', 'group-photos');
