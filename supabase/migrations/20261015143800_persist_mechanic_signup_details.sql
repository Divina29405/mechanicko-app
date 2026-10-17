create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'role', 'customer') = 'mechanic' then
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
      coalesce(new.raw_user_meta_data ->> 'full_name', 'Mechanic'),
      new.raw_user_meta_data ->> 'mobile_number',
      new.raw_user_meta_data ->> 'home_address',
      new.raw_user_meta_data ->> 'skills',
      new.raw_user_meta_data ->> 'certifications',
      new.raw_user_meta_data ->> 'experience',
      'pending',
      now()
    )
    on conflict (id) do update
    set email = excluded.email,
        full_name = excluded.full_name,
        mobile_number = excluded.mobile_number,
        home_address = excluded.home_address,
        skills = excluded.skills,
        certifications = excluded.certifications,
        experience = excluded.experience,
        updated_at = now();
    return new;
  end if;

  insert into public.profiles (
    id,
    email,
    full_name,
    role,
    mobile_number
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', 'User'),
    coalesce(new.raw_user_meta_data ->> 'role', 'customer'),
    new.raw_user_meta_data ->> 'mobile_number'
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = excluded.full_name,
      role = excluded.role,
      mobile_number = excluded.mobile_number,
      updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
