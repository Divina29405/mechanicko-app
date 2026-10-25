create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'customer' check (role in ('mechanic', 'customer', 'admin')),
  mobile_number text,
  is_online boolean not null default true,
  home_address text,
  home_latitude double precision,
  home_longitude double precision,
  skills text,
  certifications text,
  maintenance_pricing jsonb not null default '[]'::jsonb,
  experience text,
  license_front_path text,
  license_back_path text,
  average_rating numeric(2,1) not null default 5.0,
  rating_count integer not null default 0,
  application_status text not null default 'approved'
    check (application_status in ('pending', 'approved', 'rejected')),
  application_submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mechanic_applications (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text not null,
  mobile_number text,
  home_address text,
  skills text,
  certifications text,
  experience text,
  license_front_path text,
  license_back_path text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Live mechanic job assignment for service requests.
alter table if exists public.service_requests
  add column if not exists mechanic_id uuid references public.profiles(id);

alter table if exists public.service_requests
  add column if not exists decline_reason text;

alter table if exists public.service_requests
  add column if not exists service_name text;
alter table if exists public.service_requests
  add column if not exists service_price numeric(10, 2);
alter table if exists public.service_requests
  add column if not exists delivery_fee numeric(10, 2);
alter table if exists public.service_requests
  add column if not exists estimated_total numeric(10, 2);
alter table if exists public.service_requests
  add column if not exists additional_charges jsonb not null default '[]'::jsonb;
alter table if exists public.service_requests
  add column if not exists completed_at timestamptz;
alter table if exists public.service_requests
  add column if not exists scheduled_at timestamptz;
alter table if exists public.service_requests
  add column if not exists plate_number text;
alter table if exists public.service_requests
  add column if not exists mechanic_latitude double precision;
alter table if exists public.service_requests
  add column if not exists mechanic_longitude double precision;

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  body text check (length(trim(coalesce(body, ''))) > 0 or image_url is not null),
  image_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  service_request_id uuid references public.service_requests(id) on delete set null,
  chat_message_id uuid references public.chat_messages(id) on delete set null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists app_notifications_user_created_idx
  on public.app_notifications (user_id, created_at desc);

alter table public.app_notifications enable row level security;

revoke all on public.app_notifications from anon, authenticated;
grant select on public.app_notifications to authenticated;
grant update (read_at) on public.app_notifications to authenticated;

drop policy if exists "app_notifications_select_own"
on public.app_notifications;
create policy "app_notifications_select_own"
on public.app_notifications
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "app_notifications_update_own"
on public.app_notifications;
create policy "app_notifications_update_own"
on public.app_notifications
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

alter table if exists public.chat_messages
  add column if not exists image_url text;

insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', false)
on conflict (id) do nothing;

drop policy if exists "chat_media_participants_select" on storage.objects;
create policy "chat_media_participants_select"
on storage.objects for select
using (
  bucket_id = 'chat-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "chat_media_own_insert" on storage.objects;
create policy "chat_media_own_insert"
on storage.objects for insert
with check (
  bucket_id = 'chat-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create index if not exists chat_messages_request_idx
  on public.chat_messages (service_request_id, created_at);

alter table public.chat_messages enable row level security;
grant select on public.chat_messages to authenticated;

drop policy if exists "chat_messages_participants_select" on public.chat_messages;
create policy "chat_messages_participants_select"
on public.chat_messages for select
to authenticated
using (
  exists (
    select 1
    from public.service_requests request
    where request.id = service_request_id
      and (
        request.motorist_id = auth.uid()::text
        or request.mechanic_id = auth.uid()
      )
  )
);

drop policy if exists "chat_messages_participants_insert" on public.chat_messages;
create policy "chat_messages_participants_insert"
on public.chat_messages for insert
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.service_requests request
    where request.id = service_request_id
      and (
        request.motorist_id = auth.uid()::text
        or request.mechanic_id = auth.uid()
      )
      and lower(coalesce(request.status, '')) in (
        'scheduled',
        'pending',
        'accepted',
        'arrived',
        'in_transit',
        'in_progress',
        'ongoing'
      )
  )
);

create or replace function public.notify_service_request_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient_id uuid;
  event_title text;
  event_body text;
begin
  if tg_op = 'INSERT' then
    insert into public.app_notifications (
      user_id, type, title, body, service_request_id
    )
    values (
      new.motorist_id::uuid,
      'booking_submitted',
      'Booking request sent',
      'Your service request has been submitted.',
      new.id
    );

    if new.mechanic_id is not null then
      insert into public.app_notifications (
        user_id, type, title, body, service_request_id
      )
      values (
        new.mechanic_id,
        'booking_assigned',
        'New booking assigned',
        'A service request has been assigned to you.',
        new.id
      );
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if (
      new.cancelled_by = 'motorist'
      or auth.uid() = new.motorist_id::uuid
    ) and new.mechanic_id is not null then
      recipient_id := new.mechanic_id;
    else
      recipient_id := new.motorist_id::uuid;
    end if;

    event_title := case lower(coalesce(new.status, ''))
      when 'accepted' then 'Booking accepted'
      when 'in_transit' then 'Mechanic on the way'
      when 'arrived' then 'Mechanic arrived'
      when 'in_progress' then 'Service started'
      when 'completed' then 'Service completed'
      when 'cancelled' then 'Booking cancelled'
      when 'canceled' then 'Booking cancelled'
      when 'closed' then 'Booking closed'
      else 'Booking updated'
    end;

    event_body := case lower(coalesce(new.status, ''))
      when 'accepted' then 'Your mechanic accepted the booking.'
      when 'in_transit' then 'Your mechanic is on the way to your location.'
      when 'arrived' then 'Your mechanic has arrived at the service location.'
      when 'in_progress' then 'The service for your booking has started.'
      when 'completed' then 'The service for your booking has been completed.'
      when 'cancelled' then 'This booking has been cancelled.'
      when 'canceled' then 'This booking has been cancelled.'
      when 'closed' then 'This booking has been closed.'
      else 'The status of your booking has changed.'
    end;

    if recipient_id is not null
      and recipient_id is distinct from auth.uid() then
      insert into public.app_notifications (
        user_id, type, title, body, service_request_id
      )
      values (
        recipient_id, 'booking_status', event_title, event_body, new.id
      );
    end if;
  end if;

  if new.mechanic_id is distinct from old.mechanic_id
    and new.mechanic_id is not null
    and new.mechanic_id is distinct from auth.uid() then
    insert into public.app_notifications (
      user_id, type, title, body, service_request_id
    )
    values (
      new.mechanic_id,
      'booking_assigned',
      'New booking assigned',
      'A service request has been assigned to you.',
      new.id
    );
  end if;

  if new.additional_charges is distinct from old.additional_charges then
    recipient_id := case
      when auth.uid() = new.mechanic_id then new.motorist_id::uuid
      when auth.uid() = new.motorist_id::uuid then new.mechanic_id
      else null
    end;

    if recipient_id is not null then
      insert into public.app_notifications (
        user_id, type, title, body, service_request_id
      )
      values (
        recipient_id,
        'repair_charge',
        'Repair charge updated',
        'Additional repair charges were updated for your booking.',
        new.id
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists service_request_app_notifications
on public.service_requests;
create trigger service_request_app_notifications
after insert or update of status, mechanic_id, additional_charges
on public.service_requests
for each row
execute function public.notify_service_request_changes();

create or replace function public.notify_chat_message_recipient()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.recipient_id is distinct from new.sender_id then
    insert into public.app_notifications (
      user_id, type, title, body, service_request_id, chat_message_id
    )
    values (
      new.recipient_id,
      'chat_message',
      'New chat message',
      coalesce(nullif(left(trim(new.body), 140), ''), 'You received a photo.'),
      new.service_request_id,
      new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists chat_message_app_notification
on public.chat_messages;
create trigger chat_message_app_notification
after insert on public.chat_messages
for each row
execute function public.notify_chat_message_recipient();

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'app_notifications'
  ) then
    alter publication supabase_realtime add table public.app_notifications;
  end if;
end;
$$;

create index if not exists service_requests_mechanic_id_idx
  on public.service_requests (mechanic_id);

alter table if exists public.service_requests enable row level security;

drop policy if exists "service_requests_select_mechanic_jobs"
on public.service_requests;

create policy "service_requests_select_mechanic_jobs"
on public.service_requests
for select
using (
  mechanic_id = auth.uid()
  or (
    mechanic_id is null
    and exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and application_status = 'approved'
    )
  )
);

drop policy if exists "service_requests_update_mechanic_jobs"
on public.service_requests;

create policy "service_requests_update_mechanic_jobs"
on public.service_requests
for update
using (
  mechanic_id = auth.uid()
  or (
    mechanic_id is null
    and exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and application_status = 'approved'
    )
  )
)
with check (mechanic_id = auth.uid());

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

alter table public.profiles add column if not exists mobile_number text;
alter table public.profiles add column if not exists is_online boolean not null default true;
alter table public.profiles alter column role set default 'customer';
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('mechanic', 'customer', 'admin'));
alter table public.profiles add column if not exists home_address text;
alter table public.profiles add column if not exists home_latitude double precision;
alter table public.profiles add column if not exists home_longitude double precision;
alter table public.profiles add column if not exists skills text;
alter table public.profiles add column if not exists certifications text;
alter table public.profiles
  add column if not exists maintenance_pricing jsonb not null default '[]'::jsonb;
alter table public.profiles add column if not exists experience text;
alter table public.profiles add column if not exists license_front_path text;
alter table public.profiles add column if not exists license_back_path text;
alter table public.profiles add column if not exists avatar_path text;
alter table public.profiles add column if not exists application_status text not null default 'approved';
alter table public.profiles add column if not exists application_submitted_at timestamptz;

create or replace function public.save_mechanic_home_location(
  p_home_address text,
  p_home_latitude double precision,
  p_home_longitude double precision
)
returns table (
  home_address text,
  home_latitude double precision,
  home_longitude double precision
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to save a home location';
  end if;

  return query
  update public.profiles
  set home_address = nullif(trim(p_home_address), ''),
      home_latitude = p_home_latitude,
      home_longitude = p_home_longitude,
      updated_at = now()
  where id = auth.uid()
    and role = 'mechanic'
  returning profiles.home_address, profiles.home_latitude, profiles.home_longitude;

  if not found then
    raise exception 'Mechanic profile not found';
  end if;
end;
$$;

revoke all on function public.save_mechanic_home_location(text, double precision, double precision) from public;
grant execute on function public.save_mechanic_home_location(text, double precision, double precision) to authenticated;

drop function if exists public.get_nearby_mechanics(double precision, double precision, double precision);

create or replace function public.get_nearby_mechanics(
  p_latitude double precision,
  p_longitude double precision,
  p_radius_km double precision default 10
)
returns table (
  id uuid,
  full_name text,
  mobile_number text,
  is_online boolean,
  skills text,
  maintenance_pricing jsonb,
  avatar_path text,
  average_rating numeric,
  home_latitude double precision,
  home_longitude double precision,
  distance_km double precision
)
language sql
security definer
set search_path = public
as $$
  select mechanic.id, mechanic.full_name, mechanic.mobile_number, mechanic.is_online,
    mechanic.skills, mechanic.maintenance_pricing, mechanic.avatar_path, mechanic.average_rating,
    mechanic.home_latitude, mechanic.home_longitude,
    6371 * 2 * asin(sqrt(
      power(sin(radians(mechanic.home_latitude - p_latitude) / 2), 2) +
      cos(radians(p_latitude)) * cos(radians(mechanic.home_latitude)) *
      power(sin(radians(mechanic.home_longitude - p_longitude) / 2), 2)
    )) as distance_km
  from public.profiles mechanic
  where mechanic.role = 'mechanic'
    and mechanic.application_status = 'approved'
    and mechanic.home_latitude is not null
    and mechanic.home_longitude is not null
    and 6371 * 2 * asin(sqrt(
      power(sin(radians(mechanic.home_latitude - p_latitude) / 2), 2) +
      cos(radians(p_latitude)) * cos(radians(mechanic.home_latitude)) *
      power(sin(radians(mechanic.home_longitude - p_longitude) / 2), 2)
    )) <= greatest(p_radius_km, 0)
  order by distance_km asc;
$$;

revoke all on function public.get_nearby_mechanics(double precision, double precision, double precision) from public;
grant execute on function public.get_nearby_mechanics(double precision, double precision, double precision) to anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'role', 'customer') = 'mechanic'
     and coalesce(new.raw_user_meta_data ->> 'application_status', 'pending') = 'pending' then
    insert into public.mechanic_applications (
      id, email, full_name, mobile_number, home_address, skills,
      certifications, experience, status, submitted_at
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
    coalesce(new.raw_user_meta_data ->> 'role', 'customer'),
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
alter table public.mechanic_applications enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
using (auth.uid() = id or public.is_admin());

create policy "profiles_select_admin"
on public.profiles
for select
using (public.is_admin());

create or replace function public.current_profile_role()
returns text
language sql
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

revoke all on function public.current_profile_role() from public;
grant execute on function public.current_profile_role() to authenticated;

drop policy if exists "profiles_select_customer_for_mechanics"
on public.profiles;

create policy "profiles_select_customer_for_mechanics"
on public.profiles
for select
using (
  role = 'customer'
  and public.current_profile_role() = 'mechanic'
);

drop policy if exists "profiles_select_mechanic_basic"
on public.profiles;

create policy "profiles_select_mechanic_basic"
on public.profiles
for select
to authenticated
using (role = 'mechanic');

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
with check (
  auth.uid() = id
  and role = 'customer'
);

drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_update_admin" on public.profiles;
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

create policy "profiles_update_admin"
on public.profiles
for update
using (public.is_admin())
with check (public.is_admin());

create policy "profiles_delete_own"
on public.profiles
for delete
using (auth.uid() = id);

drop policy if exists "applications_select_own_or_admin" on public.mechanic_applications;
create policy "applications_select_own_or_admin"
on public.mechanic_applications
for select
using (auth.uid() = id or public.is_admin());

drop policy if exists "applications_insert_own" on public.mechanic_applications;
create policy "applications_insert_own"
on public.mechanic_applications
for insert
with check (auth.uid() = id);

drop policy if exists "applications_update_own_or_admin" on public.mechanic_applications;
create policy "applications_update_own_or_admin"
on public.mechanic_applications
for update
using (auth.uid() = id or public.is_admin())
with check (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_insert_admin" on public.profiles;
create policy "profiles_insert_admin"
on public.profiles
for insert
with check (public.is_admin() or (auth.uid() = id and role in ('mechanic', 'customer')));

create or replace function public.admin_list_mechanic_applications()
returns setof public.mechanic_applications
language sql
security definer
set search_path = public
set row_security = off
as $$
  select application.*
  from public.mechanic_applications as application
  where public.is_admin();
$$;

revoke all on function public.admin_list_mechanic_applications() from public;
grant execute on function public.admin_list_mechanic_applications() to authenticated;

create or replace function public.admin_review_mechanic_application(
  application_id uuid,
  next_status text
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  application public.mechanic_applications;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can review mechanic applications';
  end if;

  if next_status not in ('approved', 'rejected') then
    raise exception 'Invalid application status';
  end if;

  select *
  into application
  from public.mechanic_applications
  where id = application_id
  for update;

  if not found then
    raise exception 'Mechanic application not found';
  end if;

  update public.mechanic_applications
  set status = next_status, reviewed_at = now(), updated_at = now()
  where id = application_id;

  if next_status = 'approved' then
    insert into public.profiles (
      id, email, full_name, role, mobile_number, home_address, skills,
      certifications, experience, license_front_path, license_back_path,
      application_status, application_submitted_at
    )
    values (
      application.id, application.email, application.full_name, 'mechanic',
      application.mobile_number, application.home_address, application.skills,
      application.certifications, application.experience,
      application.license_front_path, application.license_back_path,
      'approved', application.submitted_at
    )
    on conflict (id) do update
    set email = excluded.email, full_name = excluded.full_name,
        role = 'mechanic', mobile_number = excluded.mobile_number,
        home_address = excluded.home_address, skills = excluded.skills,
        certifications = excluded.certifications,
        experience = excluded.experience,
        license_front_path = excluded.license_front_path,
        license_back_path = excluded.license_back_path,
        application_status = 'approved',
        application_submitted_at = excluded.application_submitted_at,
        updated_at = now();
  end if;
end;
$$;

revoke all on function public.admin_review_mechanic_application(uuid, text) from public;
grant execute on function public.admin_review_mechanic_application(uuid, text) to authenticated;

insert into storage.buckets (id, name, public)
values ('mechanic-documents', 'mechanic-documents', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('mechanic-avatars', 'mechanic-avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "mechanic_avatars_insert_own" on storage.objects;
create policy "mechanic_avatars_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'mechanic-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "mechanic_avatars_select_public" on storage.objects;
create policy "mechanic_avatars_select_public"
on storage.objects
for select
to public
using (bucket_id = 'mechanic-avatars');

drop policy if exists "mechanic_avatars_update_own" on storage.objects;
create policy "mechanic_avatars_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'mechanic-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'mechanic-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

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
