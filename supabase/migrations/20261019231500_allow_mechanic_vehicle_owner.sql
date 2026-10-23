alter table public.vehicles
  alter column motorist_id drop not null;

alter table public.vehicles
  alter column mechanic_id drop not null;

alter table public.vehicles
  drop constraint if exists vehicles_one_owner_check;

alter table public.vehicles
  add constraint vehicles_one_owner_check check (
    (motorist_id is not null and mechanic_id is null)
    or (motorist_id is null and mechanic_id is not null)
  );
