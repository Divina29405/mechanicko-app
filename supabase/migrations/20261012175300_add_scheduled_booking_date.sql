alter table if exists public.service_requests
  add column if not exists scheduled_at timestamptz;
