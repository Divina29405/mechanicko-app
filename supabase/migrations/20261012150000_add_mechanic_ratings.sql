create table if not exists public.mechanic_ratings (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null unique references public.service_requests(id) on delete cascade,
  mechanic_id uuid not null references public.profiles(id) on delete cascade,
  motorist_id uuid not null references auth.users(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  review text,
  created_at timestamptz not null default now()
);

create index if not exists mechanic_ratings_mechanic_id_idx
  on public.mechanic_ratings (mechanic_id);

alter table public.mechanic_ratings enable row level security;

create or replace function public.submit_mechanic_rating(
  p_service_request_id uuid,
  p_mechanic_id uuid,
  p_rating integer,
  p_review text default null
)
returns public.mechanic_ratings
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.service_requests;
  rating_row public.mechanic_ratings;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to submit a rating';
  end if;

  select *
  into request_row
  from public.service_requests
  where id = p_service_request_id
    and motorist_id = auth.uid()::text
    and mechanic_id = p_mechanic_id
    and status in ('completed', 'done', 'resolved');

  if not found then
    raise exception 'Only the motorist of a completed booking can submit this rating';
  end if;

  insert into public.mechanic_ratings (
    service_request_id, mechanic_id, motorist_id, rating, review
  )
  values (
    p_service_request_id, p_mechanic_id, auth.uid(), p_rating, nullif(trim(p_review), '')
  )
  returning * into rating_row;

  update public.profiles
  set average_rating = coalesce((
    select round(avg(rating)::numeric, 1)
    from public.mechanic_ratings
    where mechanic_id = p_mechanic_id
  ), 5.0),
  rating_count = (
    select count(*)
    from public.mechanic_ratings
    where mechanic_id = p_mechanic_id
  ),
  updated_at = now()
  where id = p_mechanic_id;

  return rating_row;
end;
$$;

revoke all on function public.submit_mechanic_rating(uuid, uuid, integer, text) from public;
grant execute on function public.submit_mechanic_rating(uuid, uuid, integer, text) to authenticated;

drop policy if exists "mechanic_ratings_select_participants" on public.mechanic_ratings;
create policy "mechanic_ratings_select_participants"
on public.mechanic_ratings for select
using (motorist_id = auth.uid() or mechanic_id = auth.uid());

alter table public.profiles add column if not exists average_rating numeric(2,1) not null default 5.0;
alter table public.profiles add column if not exists rating_count integer not null default 0;

create or replace function public.refresh_mechanic_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set average_rating = coalesce((
    select round(avg(rating)::numeric, 1)
    from public.mechanic_ratings
    where mechanic_id = new.mechanic_id
  ), 5.0),
  rating_count = (
    select count(*)
    from public.mechanic_ratings
    where mechanic_id = new.mechanic_id
  ),
  updated_at = now()
  where id = new.mechanic_id;
  return new;
end;
$$;

drop trigger if exists mechanic_ratings_refresh_profile on public.mechanic_ratings;
create trigger mechanic_ratings_refresh_profile
after insert or update on public.mechanic_ratings
for each row execute function public.refresh_mechanic_rating();
