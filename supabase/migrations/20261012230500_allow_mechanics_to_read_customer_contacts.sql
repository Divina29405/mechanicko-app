drop policy if exists "profiles_select_customer_for_mechanics"
on public.profiles;

create policy "profiles_select_customer_for_mechanics"
on public.profiles
for select
to authenticated
using (
  role = 'customer'
  and public.current_profile_role() = 'mechanic'
);

create or replace function public.get_customer_mobile_numbers(p_customer_ids text[])
returns table (customer_id text, mobile_number text)
language sql
security definer
set search_path = public
as $$
  select profiles.id::text, profiles.mobile_number
  from public.profiles
  where profiles.id::text = any(p_customer_ids)
    and profiles.role = 'customer'
    and public.current_profile_role() = 'mechanic';
$$;

revoke all on function public.get_customer_mobile_numbers(text[]) from public;
grant execute on function public.get_customer_mobile_numbers(text[]) to authenticated;
