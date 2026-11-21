alter table public.service_requests
  add column if not exists vehicle_id uuid
    references public.vehicles(id) on delete set null,
  add column if not exists vehicle_category text;

alter table public.service_requests
  drop constraint if exists service_requests_vehicle_category_check;

alter table public.service_requests
  add constraint service_requests_vehicle_category_check
  check (
    vehicle_category is null
    or vehicle_category in ('motorcycle', 'four_wheel')
  );

create or replace function public.enforce_scheduled_booking_pricing()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  vehicle_row public.vehicles%rowtype;
  mechanic_row public.profiles%rowtype;
  requested_item jsonb;
  mechanic_item jsonb;
  requested_name text;
  requested_price_text text;
  mechanic_price_text text;
  requested_price numeric;
  mechanic_price numeric;
  mechanic_category text;
  canonical_name text;
  canonical_price numeric;
  vehicle_category text;
  service_total numeric := 0;
  delivery_fee numeric;
  distance_term double precision;
  distance_km double precision;
  matching_vehicles integer;
  canonical_breakdown jsonb := '[]'::jsonb;
  canonical_services text[] := array[]::text[];
begin
  if tg_op = 'UPDATE' then
    if lower(coalesce(old.request_type, '')) = 'scheduled'
      or lower(coalesce(new.request_type, '')) = 'scheduled'
      or lower(coalesce(old.status, '')) = 'scheduled'
      or lower(coalesce(new.status, '')) = 'scheduled'
    then
      if new.motorist_id is distinct from old.motorist_id
        or new.mechanic_id is distinct from old.mechanic_id
        or new.request_type is distinct from old.request_type
        or (
          new.vehicle_id is distinct from old.vehicle_id
          and not (old.vehicle_id is not null and new.vehicle_id is null)
        )
        or new.vehicle_category is distinct from old.vehicle_category
        or new.vehicle_type is distinct from old.vehicle_type
        or new.plate_number is distinct from old.plate_number
        or new.latitude is distinct from old.latitude
        or new.longitude is distinct from old.longitude
        or new.service_name is distinct from old.service_name
        or new.service_breakdown is distinct from old.service_breakdown
        or new.service_price is distinct from old.service_price
        or new.delivery_fee is distinct from old.delivery_fee
        or new.estimated_total is distinct from old.estimated_total
      then
        raise exception 'Scheduled booking vehicle, services, and pricing cannot be changed after submission.'
          using errcode = '22023';
      end if;
    end if;
    return new;
  end if;

  if lower(coalesce(new.request_type, '')) <> 'scheduled' then
    if lower(coalesce(new.status, '')) = 'scheduled' then
      raise exception 'Scheduled requests must use request_type scheduled.'
        using errcode = '22023';
    end if;
    return new;
  end if;

  if lower(coalesce(new.status, '')) <> 'scheduled' then
    raise exception 'Scheduled bookings must start with scheduled status.'
      using errcode = '22023';
  end if;

  if new.scheduled_at is null or new.scheduled_at <= now() then
    raise exception 'Choose a future date and time for a scheduled booking.'
      using errcode = '22023';
  end if;

  if auth.uid() is null or new.motorist_id is distinct from auth.uid()::text then
    raise exception 'A scheduled booking must belong to the authenticated motorist.'
      using errcode = '42501';
  end if;

  if new.mechanic_id is null then
    raise exception 'Choose a mechanic before submitting a scheduled booking.'
      using errcode = '22023';
  end if;

  if new.latitude is null or new.longitude is null
    or new.latitude not between -90 and 90
    or new.longitude not between -180 and 180
  then
    raise exception 'A valid booking location is required to calculate the distance fee.'
      using errcode = '22023';
  end if;

  if new.vehicle_id is null then
    select count(*)
    into matching_vehicles
    from public.vehicles vehicle
    where vehicle.motorist_id = auth.uid()
      and upper(trim(vehicle.plate_number)) = upper(trim(coalesce(new.plate_number, '')))
      and lower(trim(concat_ws(' ', vehicle.make, vehicle.model))) =
        lower(trim(coalesce(new.vehicle_type, '')));

    if matching_vehicles <> 1 then
      raise exception 'Select a saved garage vehicle before submitting a scheduled booking.'
        using errcode = '22023';
    end if;

    select vehicle.*
    into vehicle_row
    from public.vehicles vehicle
    where vehicle.motorist_id = auth.uid()
      and upper(trim(vehicle.plate_number)) = upper(trim(new.plate_number))
      and lower(trim(concat_ws(' ', vehicle.make, vehicle.model))) =
        lower(trim(new.vehicle_type))
    limit 1;
    new.vehicle_id := vehicle_row.id;
  else
    select vehicle.*
    into vehicle_row
    from public.vehicles vehicle
    where vehicle.id = new.vehicle_id
      and vehicle.motorist_id = auth.uid();
  end if;

  if not found then
    raise exception 'The selected vehicle does not belong to this motorist.'
      using errcode = '22023';
  end if;

  vehicle_category := case
    when vehicle_row.type = 'motorcycle' then 'motorcycle'
    else 'four_wheel'
  end;
  new.vehicle_category := vehicle_category;
  new.vehicle_type := trim(concat_ws(' ', vehicle_row.make, vehicle_row.model));
  new.plate_number := upper(trim(vehicle_row.plate_number));

  select profile.*
  into mechanic_row
  from public.profiles profile
  where profile.id = new.mechanic_id
    and profile.role = 'mechanic'
    and profile.application_status = 'approved';

  if not found then
    raise exception 'The selected mechanic is unavailable for scheduled bookings.'
      using errcode = '22023';
  end if;

  if mechanic_row.home_latitude is null or mechanic_row.home_longitude is null then
    raise exception 'The selected mechanic has no service location for distance pricing.'
      using errcode = '22023';
  end if;

  if jsonb_typeof(new.service_breakdown) is distinct from 'array' then
    raise exception 'Select at least one priced service for the selected vehicle.'
      using errcode = '22023';
  end if;

  if jsonb_array_length(new.service_breakdown) = 0 then
    raise exception 'Select at least one priced service for the selected vehicle.'
      using errcode = '22023';
  end if;

  if jsonb_typeof(mechanic_row.maintenance_pricing) is distinct from 'array' then
    raise exception 'The selected mechanic has invalid service pricing.'
      using errcode = '22023';
  end if;

  for requested_item in
    select item.value
    from jsonb_array_elements(new.service_breakdown) as item(value)
  loop
    requested_name := lower(trim(coalesce(
      requested_item ->> 'service',
      requested_item ->> 'service_name',
      requested_item ->> 'name',
      ''
    )));
    requested_price_text := regexp_replace(
      coalesce(requested_item ->> 'price', requested_item ->> 'amount', ''),
      '[₱,[:space:]]',
      '',
      'g'
    );

    if requested_name = ''
      or requested_price_text !~ '^[0-9]+([.][0-9]+)?$'
    then
      raise exception 'A selected service has invalid name or price data.'
        using errcode = '22023';
    end if;

    requested_price := round(requested_price_text::numeric, 2);
    if requested_price <= 0 then
      raise exception 'Service prices must be greater than zero.'
        using errcode = '22023';
    end if;
    canonical_name := null;
    canonical_price := null;

    for mechanic_item in
      select item.value
      from jsonb_array_elements(mechanic_row.maintenance_pricing) as item(value)
    loop
      mechanic_category := 'motorcycle';
      if mechanic_item ->> 'vehicle_category' = 'four_wheel' then
        mechanic_category := 'four_wheel';
      end if;

      if lower(trim(coalesce(
          mechanic_item ->> 'service',
          mechanic_item ->> 'service_name',
          mechanic_item ->> 'name',
          ''
        ))) <> requested_name
        or mechanic_category <> vehicle_category
      then
        continue;
      end if;

      mechanic_price_text := regexp_replace(
        coalesce(mechanic_item ->> 'price', mechanic_item ->> 'amount', ''),
        '[₱,[:space:]]',
        '',
        'g'
      );
      if mechanic_price_text !~ '^[0-9]+([.][0-9]+)?$' then
        continue;
      end if;

      mechanic_price := round(mechanic_price_text::numeric, 2);
      if mechanic_price <= 0 then
        continue;
      end if;
      if mechanic_price = requested_price then
        canonical_name := coalesce(
          mechanic_item ->> 'service',
          mechanic_item ->> 'service_name',
          mechanic_item ->> 'name'
        );
        canonical_price := mechanic_price;
        exit;
      end if;
    end loop;

    if canonical_name is null or canonical_price is null then
      raise exception 'Service "%" is not listed at that price for this vehicle category.',
        requested_name
        using errcode = '22023';
    end if;

    service_total := service_total + canonical_price;
    canonical_services := array_append(canonical_services, canonical_name);
    canonical_breakdown := canonical_breakdown || jsonb_build_array(
      jsonb_build_object(
        'service', canonical_name,
        'price', canonical_price,
        'vehicle_category', vehicle_category
      )
    );
  end loop;

  distance_term :=
    power(sin(radians(mechanic_row.home_latitude - new.latitude) / 2), 2)
    + cos(radians(new.latitude))
    * cos(radians(mechanic_row.home_latitude))
    * power(sin(radians(mechanic_row.home_longitude - new.longitude) / 2), 2);
  distance_km := 6371 * 2 * asin(sqrt(least(1.0, distance_term)));

  if vehicle_category = 'four_wheel' then
    delivery_fee := 150 + greatest(0, ceil(distance_km)::integer - 1) * 15;
  else
    delivery_fee := 100 + greatest(0, ceil(distance_km)::integer - 1) * 10;
  end if;

  new.service_name := array_to_string(canonical_services, ', ');
  new.service_breakdown := canonical_breakdown;
  new.service_price := round(service_total, 2);
  new.delivery_fee := delivery_fee;
  new.estimated_total := round(service_total + delivery_fee, 2);

  return new;
end;
$$;

drop trigger if exists service_request_scheduled_pricing_guard
on public.service_requests;

create trigger service_request_scheduled_pricing_guard
before insert or update on public.service_requests
for each row
execute function public.enforce_scheduled_booking_pricing();
