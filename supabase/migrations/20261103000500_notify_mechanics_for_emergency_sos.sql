create or replace function public.notify_nearby_mechanics_of_emergency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(coalesce(new.request_type, '')) <> 'emergency'
    or new.mechanic_id is not null
    or lower(coalesce(new.status, '')) <> 'pending'
  then
    return new;
  end if;

  insert into public.app_notifications (
    user_id,
    type,
    title,
    body,
    service_request_id
  )
  select
    mechanic.id,
    'emergency_request',
    'Nearby Emergency SOS',
    'A motorist nearby needs emergency roadside assistance. Open Jobs to respond.',
    new.id
  from public.profiles mechanic
  where mechanic.role = 'mechanic'
    and mechanic.application_status = 'approved'
    and mechanic.is_online = true
    and mechanic.home_latitude is not null
    and mechanic.home_longitude is not null
    and mechanic.id <> new.motorist_id::uuid
    and 6371 * 2 * asin(sqrt(least(1.0,
      power(sin(radians(mechanic.home_latitude - new.latitude) / 2), 2) +
      cos(radians(new.latitude)) * cos(radians(mechanic.home_latitude)) *
      power(sin(radians(mechanic.home_longitude - new.longitude) / 2), 2)
    ))) <= greatest(coalesce(new.search_radius_km, 5), 0);

  return new;
end;
$$;

drop trigger if exists service_request_emergency_mechanic_notifications
on public.service_requests;
create trigger service_request_emergency_mechanic_notifications
after insert on public.service_requests
for each row
execute function public.notify_nearby_mechanics_of_emergency();

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'service_requests'
  ) then
    alter publication supabase_realtime add table public.service_requests;
  end if;
end;
$$;
