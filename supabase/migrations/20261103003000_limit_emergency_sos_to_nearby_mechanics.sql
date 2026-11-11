create or replace function public.notify_mechanics_of_emergency_sos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(coalesce(new.request_type, '')) <> 'emergency'
    or new.mechanic_id is not null
    or lower(coalesce(new.status, '')) <> 'pending'
    or new.latitude is null
    or new.longitude is null
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
    ))) <= greatest(coalesce(new.search_radius_km, 5), 0)
    and not exists (
      select 1
      from public.app_notifications existing_notification
      where existing_notification.user_id = mechanic.id
        and existing_notification.service_request_id = new.id
        and existing_notification.type = 'emergency_request'
    );

  return new;
end;
$$;

drop trigger if exists service_request_emergency_mechanic_notifications
on public.service_requests;
create trigger service_request_emergency_mechanic_notifications
after insert on public.service_requests
for each row
execute function public.notify_mechanics_of_emergency_sos();

delete from public.app_notifications notification
using public.service_requests request,
      public.profiles mechanic
where notification.type = 'emergency_request'
  and notification.service_request_id = request.id
  and notification.user_id = mechanic.id
  and lower(coalesce(request.request_type, '')) = 'emergency'
  and lower(coalesce(request.status, '')) = 'pending'
  and request.mechanic_id is null
  and (
    mechanic.home_latitude is null
    or mechanic.home_longitude is null
    or request.latitude is null
    or request.longitude is null
    or mechanic.is_online is false
    or mechanic.application_status <> 'approved'
    or 6371 * 2 * asin(sqrt(least(1.0,
      power(sin(radians(mechanic.home_latitude - request.latitude) / 2), 2) +
      cos(radians(request.latitude)) * cos(radians(mechanic.home_latitude)) *
      power(sin(radians(mechanic.home_longitude - request.longitude) / 2), 2)
    ))) > greatest(coalesce(request.search_radius_km, 5), 0)
  );
