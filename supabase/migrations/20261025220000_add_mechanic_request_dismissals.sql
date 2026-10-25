create table if not exists public.mechanic_request_dismissals (
  request_id uuid not null references public.service_requests(id) on delete cascade,
  mechanic_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (length(trim(reason)) > 0),
  created_at timestamptz not null default now(),
  primary key (request_id, mechanic_id)
);

create index if not exists mechanic_request_dismissals_mechanic_idx
  on public.mechanic_request_dismissals (mechanic_id);

alter table public.mechanic_request_dismissals enable row level security;

grant select, insert on public.mechanic_request_dismissals to authenticated;

drop policy if exists "mechanic_request_dismissals_select_own"
on public.mechanic_request_dismissals;
create policy "mechanic_request_dismissals_select_own"
on public.mechanic_request_dismissals
for select
to authenticated
using (mechanic_id = auth.uid());

drop policy if exists "mechanic_request_dismissals_insert_own"
on public.mechanic_request_dismissals;
create policy "mechanic_request_dismissals_insert_own"
on public.mechanic_request_dismissals
for insert
to authenticated
with check (
  mechanic_id = auth.uid()
  and exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'mechanic'
      and application_status = 'approved'
  )
);
