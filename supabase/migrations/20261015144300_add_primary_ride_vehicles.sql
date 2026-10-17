create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  motorist_id uuid references auth.users(id) on delete cascade,
  mechanic_id uuid references auth.users(id) on delete cascade,
  type text not null,
  make text not null,
  model text not null,
  year text not null,
  plate_number text not null,
  fuel_type text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicles_one_owner_check check (
    (motorist_id is not null and mechanic_id is null)
    or (motorist_id is null and mechanic_id is not null)
  )
);

alter table public.vehicles
  add column if not exists motorist_id uuid references auth.users(id) on delete cascade;

alter table public.vehicles
  add column if not exists mechanic_id uuid references auth.users(id) on delete cascade;

alter table public.vehicles
  add column if not exists type text;

alter table public.vehicles
  add column if not exists make text;

alter table public.vehicles
  add column if not exists model text;

alter table public.vehicles
  add column if not exists year text;

alter table public.vehicles
  add column if not exists plate_number text;

alter table public.vehicles
  add column if not exists fuel_type text;

alter table public.vehicles
  add column if not exists is_primary boolean not null default false;

alter table public.vehicles
  add column if not exists created_at timestamptz not null default now();

alter table public.vehicles
  add column if not exists updated_at timestamptz not null default now();

alter table public.vehicles
  drop constraint if exists vehicles_one_owner_check;

alter table public.vehicles
  add constraint vehicles_one_owner_check check (
    (motorist_id is not null and mechanic_id is null)
    or (motorist_id is null and mechanic_id is not null)
  );

create index if not exists vehicles_motorist_id_idx
  on public.vehicles (motorist_id);

create index if not exists vehicles_mechanic_id_idx
  on public.vehicles (mechanic_id);

alter table public.vehicles enable row level security;

drop policy if exists "vehicles_select_own" on public.vehicles;
create policy "vehicles_select_own"
on public.vehicles for select
using (motorist_id = auth.uid() or mechanic_id = auth.uid());

drop policy if exists "vehicles_insert_own" on public.vehicles;
create policy "vehicles_insert_own"
on public.vehicles for insert
with check (motorist_id = auth.uid() or mechanic_id = auth.uid());

drop policy if exists "vehicles_update_own" on public.vehicles;
create policy "vehicles_update_own"
on public.vehicles for update
using (motorist_id = auth.uid() or mechanic_id = auth.uid())
with check (motorist_id = auth.uid() or mechanic_id = auth.uid());

drop policy if exists "vehicles_delete_own" on public.vehicles;
create policy "vehicles_delete_own"
on public.vehicles for delete
using (motorist_id = auth.uid() or mechanic_id = auth.uid());
