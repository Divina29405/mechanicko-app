alter table public.vehicles
  drop constraint if exists vehicles_motorist_id_fkey;

alter table public.vehicles
  add constraint vehicles_motorist_id_fkey
  foreign key (motorist_id)
  references auth.users(id)
  on delete cascade
  not valid;
