create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_role text := new.raw_user_meta_data ->> 'role';
  profile_role text;
  profile_status text;
begin
  if user_role = 'mechanic' then
    insert into public.mechanic_applications (
      id,
      email,
      full_name,
      mobile_number,
      home_address,
      skills,
      certifications,
      experience,
      status,
      submitted_at
    )
    values (
      new.id,
      new.email,
      coalesce(
        nullif(new.raw_user_meta_data ->> 'full_name', ''),
        nullif(new.raw_user_meta_data ->> 'name', ''),
        'Mechanic'
      ),
      new.raw_user_meta_data ->> 'mobile_number',
      new.raw_user_meta_data ->> 'home_address',
      new.raw_user_meta_data ->> 'skills',
      new.raw_user_meta_data ->> 'certifications',
      new.raw_user_meta_data ->> 'experience',
      'pending',
      now()
    )
    on conflict (id) do nothing;
  end if;

  profile_role := case
    when user_role in ('customer', 'mechanic', 'admin') then user_role
    else 'customer'
  end;
  profile_status := case
    when new.raw_user_meta_data ->> 'application_status'
      in ('pending', 'approved', 'rejected')
      then new.raw_user_meta_data ->> 'application_status'
    when profile_role = 'mechanic' then 'pending'
    else 'approved'
  end;

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
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      'User'
    ),
    profile_role,
    new.raw_user_meta_data ->> 'mobile_number',
    new.raw_user_meta_data ->> 'home_address',
    new.raw_user_meta_data ->> 'skills',
    new.raw_user_meta_data ->> 'certifications',
    new.raw_user_meta_data ->> 'experience',
    profile_status,
    case when profile_status = 'pending' then now() else null end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

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
  license_front_path,
  license_back_path,
  application_status,
  application_submitted_at
)
select
  users.id,
  users.email,
  coalesce(
    nullif(users.raw_user_meta_data ->> 'full_name', ''),
    nullif(users.raw_user_meta_data ->> 'name', ''),
    nullif(applications.full_name, ''),
    'User'
  ),
  case
    when applications.id is not null then 'mechanic'
    when users.raw_user_meta_data ->> 'role'
      in ('customer', 'mechanic', 'admin')
      then users.raw_user_meta_data ->> 'role'
    else 'customer'
  end,
  coalesce(
    users.raw_user_meta_data ->> 'mobile_number',
    applications.mobile_number
  ),
  coalesce(
    users.raw_user_meta_data ->> 'home_address',
    applications.home_address
  ),
  coalesce(users.raw_user_meta_data ->> 'skills', applications.skills),
  coalesce(
    users.raw_user_meta_data ->> 'certifications',
    applications.certifications
  ),
  coalesce(users.raw_user_meta_data ->> 'experience', applications.experience),
  applications.license_front_path,
  applications.license_back_path,
  case
    when applications.id is not null then applications.status
    when users.raw_user_meta_data ->> 'role' = 'mechanic' then 'pending'
    else 'approved'
  end,
  case
    when applications.id is not null then applications.submitted_at
    when users.raw_user_meta_data ->> 'role' = 'mechanic' then now()
    else null
  end
from auth.users as users
left join public.mechanic_applications as applications
  on applications.id = users.id
left join public.profiles as profiles
  on profiles.id = users.id
where profiles.id is null
on conflict (id) do nothing;
