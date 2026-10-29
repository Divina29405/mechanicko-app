alter table if exists public.service_requests
  add column if not exists service_breakdown jsonb not null default '[]'::jsonb;
