-- Persist a mechanic's pinned home address without relying on client-side RLS
-- update behavior, which can otherwise return zero rows without an error.
create or replace function public.save_mechanic_home_location(
  p_home_address text,
  p_home_latitude double precision,
  p_home_longitude double precision
)
returns table (
  home_address text,
  home_latitude double precision,
  home_longitude double precision
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to save a home location';
  end if;

  return query
  update public.profiles
  set home_address = trim(p_home_address),
      home_latitude = p_home_latitude,
      home_longitude = p_home_longitude,
      updated_at = now()
  where id = auth.uid()
  returning
    profiles.home_address,
    profiles.home_latitude,
    profiles.home_longitude;

  if not found then
    raise exception 'Approved mechanic profile not found';
  end if;
end;
$$;

revoke all on function public.save_mechanic_home_location(text, double precision, double precision)
from public;

grant execute on function public.save_mechanic_home_location(text, double precision, double precision)
to authenticated;
