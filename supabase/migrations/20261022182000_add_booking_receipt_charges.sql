alter table if exists public.service_requests
  add column if not exists additional_charges jsonb not null default '[]'::jsonb;
