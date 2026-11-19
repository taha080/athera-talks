-- Reconcile the two request_contact() redefinitions.
--
--   20261119130000 (PR #88) added the L3 7-day declined-request cooldown.
--   20261119140000 (PR #90) added the M3 10/day rate-limit check on
--   re-request (the UPDATE path, which the INSERT trigger never sees).
--
-- Applied in timestamp order, the 140000 version overwrote the 130000
-- version and dropped the cooldown. This migration restores both checks
-- in a single definition, so a declined request is both cooldown-gated
-- (7 days) and rate-limited (10/day).

create or replace function public.request_contact(other_id uuid)
returns public.contact_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.contact_requests;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if other_id is null or other_id = auth.uid() then
    raise exception 'You cannot add yourself';
  end if;
  if not exists (select 1 from public.profiles where id = other_id) then
    raise exception 'User not found';
  end if;

  select * into row
  from public.contact_requests
  where least(from_id, to_id) = least(auth.uid(), other_id)
    and greatest(from_id, to_id) = greatest(auth.uid(), other_id);

  if row.id is null then
    -- New request: the BEFORE INSERT trigger on contact_requests enforces
    -- the 10/day limit, so no check is needed here (and adding one would
    -- count the same request twice).
    insert into public.contact_requests (from_id, to_id, status)
    values (auth.uid(), other_id, 'pending')
    returning * into row;
    return row;
  end if;

  if row.status = 'accepted' or (row.status = 'pending' and row.from_id = auth.uid()) then
    return row;
  end if;

  if row.status = 'pending' and row.to_id = auth.uid() then
    return row;
  end if;

  -- L3: a declined request may only be re-sent 7 days after the decline.
  if row.status = 'declined' and row.updated_at > now() - interval '7 days' then
    raise exception 'That request was declined recently. You can send it again 7 days after it was declined.';
  end if;

  -- M3: re-request after a decline is an UPDATE, so the INSERT trigger
  -- never fires — enforce the same 10/day limit explicitly.
  perform public.check_rate_limit('contact_request', 10, 86400);

  update public.contact_requests
    set from_id = auth.uid(),
        to_id = other_id,
        status = 'pending',
        updated_at = now()
    where id = row.id
    returning * into row;
  return row;
end;
$$;
