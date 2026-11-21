alter table public.vehicles
  drop constraint if exists vehicles_type_check;

alter table public.vehicles
  add constraint vehicles_type_check
  check (type in ('car', 'motorcycle', 'sedan', 'suv', 'van', 'pickup'));
