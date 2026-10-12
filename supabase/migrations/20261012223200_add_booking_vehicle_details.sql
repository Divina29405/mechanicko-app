alter table if exists public.service_requests
  add column if not exists plate_number text;
