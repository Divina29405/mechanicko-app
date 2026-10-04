create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'mechanic' check (role in ('mechanic', 'customer')),
  mobile_number text,
  home_address text,
  skills text,
  certifications text,
  experience text,
  license_front_path text,
  license_back_path text,
  application_status text not null default 'approved'
    check (application_status in ('pending', 'approved', 'rejected')),
  application_submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists mobile_number text;
alter table public.profiles add column if not exists home_address text;
alter table public.profiles add column if not exists skills text;
alter table public.profiles add column if not exists certifications text;
alter table public.profiles add column if not exists experience text;
alter table public.profiles add column if not exists license_front_path text;
alter table public.profiles add column if not exists license_back_path text;
alter table public.profiles add column if not exists application_status text not null default 'approved';
alter table public.profiles add column if not exists application_submitted_at timestamptz;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    email,
    full_name,
    role,
    mobile_number,
    home_address,
    skills,
    certifications,
    experience,
    application_status,
    application_submitted_at
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', 'Mechanic'),
    coalesce(new.raw_user_meta_data ->> 'role', 'mechanic'),
    new.raw_user_meta_data ->> 'mobile_number',
    new.raw_user_meta_data ->> 'home_address',
    new.raw_user_meta_data ->> 'skills',
    new.raw_user_meta_data ->> 'certifications',
    new.raw_user_meta_data ->> 'experience',
    coalesce(new.raw_user_meta_data ->> 'application_status', 'approved'),
    case
      when new.raw_user_meta_data ->> 'application_status' = 'pending'
        then now()
      else null
    end
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = excluded.full_name,
      role = excluded.role,
      mobile_number = excluded.mobile_number,
      home_address = excluded.home_address,
      skills = excluded.skills,
      certifications = excluded.certifications,
      experience = excluded.experience,
      application_status = excluded.application_status,
      application_submitted_at = excluded.application_submitted_at,
      updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;

create policy "profiles_select_own"
on public.profiles
for select
using (auth.uid() = id);

create policy "profiles_insert_own"
on public.profiles
for insert
with check (auth.uid() = id);

create policy "profiles_update_own"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "profiles_delete_own"
on public.profiles
for delete
using (auth.uid() = id);

insert into storage.buckets (id, name, public)
values ('mechanic-documents', 'mechanic-documents', false)
on conflict (id) do nothing;

drop policy if exists "mechanic_documents_insert_own" on storage.objects;
create policy "mechanic_documents_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'mechanic-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "mechanic_documents_select_own" on storage.objects;
create policy "mechanic_documents_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'mechanic-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "mechanic_documents_update_own" on storage.objects;
create policy "mechanic_documents_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'mechanic-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'mechanic-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);
