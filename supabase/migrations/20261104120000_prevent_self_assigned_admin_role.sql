-- Auth user metadata is user-controlled; only a trusted server action may grant admin.
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
    when user_role in ('customer', 'mechanic') then user_role
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
