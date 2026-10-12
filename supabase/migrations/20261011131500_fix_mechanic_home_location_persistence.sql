-- Ensure mechanics can persist their own pinned home location.
alter table if exists public.profiles
  add column if not exists home_address text;

alter table if exists public.profiles
  add column if not exists home_latitude double precision;

alter table if exists public.profiles
  add column if not exists home_longitude double precision;

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
using (auth.uid() = id or public.is_admin())
with check (
  public.is_admin()
  or (
    auth.uid() = id
    and role = public.current_profile_role()
  )
);
