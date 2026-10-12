alter table if exists public.service_requests
  add column if not exists service_name text,
  add column if not exists service_price numeric(10, 2),
  add column if not exists delivery_fee numeric(10, 2),
  add column if not exists estimated_total numeric(10, 2);
