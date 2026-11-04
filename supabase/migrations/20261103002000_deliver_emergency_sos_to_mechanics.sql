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
    'Emergency SOS request',
    'A motorist needs emergency roadside assistance. Open Jobs to respond.',
    new.id
  from public.profiles mechanic
  where mechanic.role = 'mechanic'
    and mechanic.application_status = 'approved'
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
  'Emergency SOS request',
  'A motorist needs emergency roadside assistance. Open Jobs to respond.',
  request.id
from public.service_requests request
cross join public.profiles mechanic
where lower(coalesce(request.request_type, '')) = 'emergency'
  and lower(coalesce(request.status, '')) = 'pending'
  and request.mechanic_id is null
  and mechanic.role = 'mechanic'
  and mechanic.application_status = 'approved'
  and not exists (
    select 1
    from public.app_notifications existing_notification
    where existing_notification.user_id = mechanic.id
      and existing_notification.service_request_id = request.id
      and existing_notification.type = 'emergency_request'
  );

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'app_notifications'
  ) then
    alter publication supabase_realtime add table public.app_notifications;
  end if;

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
