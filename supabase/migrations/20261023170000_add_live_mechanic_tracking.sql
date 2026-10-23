alter table if exists public.service_requests
  add column if not exists mechanic_latitude double precision;

alter table if exists public.service_requests
  add column if not exists mechanic_longitude double precision;
