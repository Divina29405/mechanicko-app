alter table if exists public.service_requests enable row level security;

drop policy if exists "service_requests_insert_motorist_own"
on public.service_requests;

create policy "service_requests_insert_motorist_own"
on public.service_requests
for insert
to authenticated
with check (motorist_id = auth.uid()::text);

drop policy if exists "service_requests_select_motorist_own"
on public.service_requests;

create policy "service_requests_select_motorist_own"
on public.service_requests
for select
to authenticated
using (motorist_id = auth.uid()::text);

drop policy if exists "service_requests_update_motorist_own"
on public.service_requests;

create policy "service_requests_update_motorist_own"
on public.service_requests
for update
to authenticated
using (motorist_id = auth.uid()::text)
with check (motorist_id = auth.uid()::text);
