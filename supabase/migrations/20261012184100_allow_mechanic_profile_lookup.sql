drop policy if exists "profiles_select_mechanic_basic"
on public.profiles;

create policy "profiles_select_mechanic_basic"
on public.profiles
for select
to authenticated
using (role = 'mechanic');
