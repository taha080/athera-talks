-- One row per call. Both phones share a client id; the unique index keeps the second insert out.
-- Apply this file in the Supabase SQL editor. The earlier calls table is already in place.

alter table public.calls
  add column if not exists client_id uuid;

create unique index if not exists calls_client_id_key
  on public.calls (client_id);
