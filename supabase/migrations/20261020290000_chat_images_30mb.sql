-- Pasted GIFs are stored as-is so the animation stays. Stills are still compressed
-- to JPEG before upload. Raise chat-images so an uncompressed GIF can be up to 30 MB.
-- Apply this file in the Supabase SQL editor.

update storage.buckets
set file_size_limit = 31457280
where id = 'chat-images';
