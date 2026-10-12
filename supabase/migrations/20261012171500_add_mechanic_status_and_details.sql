  alter table if exists public.profiles
    add column if not exists is_online boolean not null default true;

  drop function if exists public.get_nearby_mechanics(double precision, double precision, double precision);

  create or replace function public.get_nearby_mechanics(
    p_latitude double precision,
    p_longitude double precision,
    p_radius_km double precision default 10
  )
  returns table (
    id uuid,
    full_name text,
    mobile_number text,
    is_online boolean,
    skills text,
    maintenance_pricing jsonb,
    avatar_path text,
    average_rating numeric,
    home_latitude double precision,
    home_longitude double precision,
    distance_km double precision
  )
  language sql
  security definer
  set search_path = public
  as $$
    select
      mechanic.id,
      mechanic.full_name,
      mechanic.mobile_number,
      mechanic.is_online,
      mechanic.skills,
      mechanic.maintenance_pricing,
      mechanic.avatar_path,
      mechanic.average_rating,
      mechanic.home_latitude,
      mechanic.home_longitude,
      6371 * 2 * asin(sqrt(
        power(sin(radians(mechanic.home_latitude - p_latitude) / 2), 2) +
        cos(radians(p_latitude)) * cos(radians(mechanic.home_latitude)) *
        power(sin(radians(mechanic.home_longitude - p_longitude) / 2), 2)
      )) as distance_km
    from public.profiles mechanic
    where mechanic.role = 'mechanic'
      and mechanic.application_status = 'approved'
      and mechanic.home_latitude is not null
      and mechanic.home_longitude is not null
      and 6371 * 2 * asin(sqrt(
        power(sin(radians(mechanic.home_latitude - p_latitude) / 2), 2) +
        cos(radians(p_latitude)) * cos(radians(mechanic.home_latitude)) *
        power(sin(radians(mechanic.home_longitude - p_longitude) / 2), 2)
      )) <= greatest(p_radius_km, 0)
    order by distance_km asc;
  $$;

  revoke all on function public.get_nearby_mechanics(double precision, double precision, double precision) from public;
  grant execute on function public.get_nearby_mechanics(double precision, double precision, double precision) to anon, authenticated;
