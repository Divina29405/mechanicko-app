create or replace function public.prevent_cancellation_after_trip_start()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if lower(coalesce(new.status, '')) in ('cancelled', 'canceled')
    and lower(coalesce(old.status, '')) in (
      'in_transit',
      'arrived',
      'in_progress',
      'ongoing'
    ) then
    raise exception using
      errcode = '23514',
      message = 'This booking cannot be cancelled because the mechanic has already started the trip.';
  end if;

  return new;
end;
$$;

drop trigger if exists service_request_prevent_cancellation_after_trip_start
on public.service_requests;

create trigger service_request_prevent_cancellation_after_trip_start
before update of status on public.service_requests
for each row
execute function public.prevent_cancellation_after_trip_start();
